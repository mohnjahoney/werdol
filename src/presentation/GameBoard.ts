import Phaser from "phaser"
import type { Letter, LetterTile, ScrambledBoard } from "../core/board"
import { countCorrectOccupancy, letterMatchesOriginalTileLetter, swapOccupancy } from "../core/boardState"
import type { WerdolPuzzle } from "../core/puzzle"
import { BOARD_LAYOUT, boardSlotCenter } from "./board/boardLayout"
import { renderTileState, type LetterTileState, type TileStateRenderer } from "./board/tileStateRenderers"
import { createTileLetter, GAME_PRESENTATION, tileColor } from "./board/tileVisuals"
import { createCircularArc, mirrorCircularArc, pointOnCircularArc } from "./circularArc"
import { CircularArcVisual } from "./circularArcVisual"
import { LetterVisual } from "./LetterVisual"

export interface GameBoardTileVisual {
  tile: LetterTile
  text: Phaser.GameObjects.Text
}

export type GameBoardInteractionMode = "swap" | "reveal"

export interface GameBoardBuildOptions {
  openingExplanationPending: boolean
  onTilePointerDown: (slotIndex: number, rowIndex: number, frozen: boolean) => void
  container?: Phaser.GameObjects.Container
  displayOccupancy?: readonly number[]
  initialTileColor?: number
}

export interface GameBoardSwapEvent {
  firstSlot: number
  secondSlot: number
  previousOccupancy: number[]
  nextOccupancy: number[]
  previousCorrectCount: number
  nextCorrectCount: number
}

export interface GameBoardCallbacks {
  isInteractionBlocked: () => boolean
  onAlreadyCompleteRow: (rowIndex: number) => void
  onSwapCommitted: (event: GameBoardSwapEvent) => void
  onSwapSettled: () => void
}

const SWAP_SELECTION_DELAY = 140
const TILE_SWAP_ANIMATION_DURATION = 400
const SWAP_ARC_DEPTH = 5
const ARC_ANIMATION_DURATION = 120
const TRAVEL_SHADOW_DURATION = 100
const TRAVEL_SHADOW_BLUR = 8
const TRAVEL_SHADOW_COLOR = "rgba(33, 31, 26, 0.5)"
const TILE_EVALUATION_FLIP_DURATION = 145

/** Owns the shared Phaser objects that make up a playable or scripted board. */
export class GameBoard {
  readonly tileSlots: GameBoardTileVisual[] = []
  readonly tileBackgrounds: Phaser.GameObjects.Rectangle[] = []
  readonly openingLetterVisuals = new Map<number, LetterVisual>()
  readonly tileRenderer: TileStateRenderer
  private readonly visualsByLetterId = new Map<number, GameBoardTileVisual>()
  private occupancy: number[]
  private selectedSlot: number | undefined
  private renderedSelectedSlot: number | undefined
  private swapping = false

  constructor(
    private readonly scene: Phaser.Scene,
    readonly puzzle: WerdolPuzzle,
    readonly board: ScrambledBoard,
    tileRenderer: TileStateRenderer,
    options: GameBoardBuildOptions,
    private readonly callbacks: GameBoardCallbacks,
  ) {
    this.tileRenderer = tileRenderer
    this.occupancy = [...board.initialOccupancy]
    this.build(options)
  }

  get currentOccupancy(): readonly number[] {
    return this.occupancy
  }

  get isAnimating(): boolean {
    return this.swapping
  }

  setOccupancy(nextOccupancy: readonly number[], syncLetters = false): void {
    this.occupancy = [...nextOccupancy]
    if (syncLetters) {
      this.tileSlots.forEach((visual, slotIndex) => {
        const letterId = this.occupancy[slotIndex]
        visual.text.setText(this.board.letters[letterId ?? visual.tile.id]?.character ?? visual.text.text)
      })
    }
  }

  reorderByTileIds(tileIds: readonly number[]): boolean {
    const visualsById = new Map(this.tileSlots.map((visual) => [visual.tile.id, visual]))
    const nextVisuals = tileIds.map((id) => visualsById.get(id)).filter((visual): visual is GameBoardTileVisual => visual !== undefined)
    if (nextVisuals.length !== this.tileSlots.length) return false
    this.tileSlots.splice(0, this.tileSlots.length, ...nextVisuals)
    return true
  }

  applyTileState(state: readonly LetterTile[]): boolean {
    const visualsById = new Map(this.tileSlots.map((visual) => [visual.tile.id, visual]))
    const nextVisuals = state.map((tile) => visualsById.get(tile.id)).filter((visual): visual is GameBoardTileVisual => visual !== undefined)
    if (nextVisuals.length !== this.tileSlots.length) return false
    this.tileSlots.splice(0, this.tileSlots.length, ...nextVisuals)
    this.tileSlots.forEach((visual, slotIndex) => {
      visual.tile = { ...state[slotIndex]! }
      const center = boardSlotCenter(Math.floor(slotIndex / 5), slotIndex % 5)
      visual.text.setText(visual.tile.letter).setPosition(center.x, center.y).setDepth(10).setAngle(0)
    })
    this.setOccupancy(state.map((tile) => tile.id))
    return true
  }

  renderTileState(slotIndex: number, state: LetterTileState, animate = false): void {
    const tile = this.tileBackgrounds[slotIndex]
    if (!tile) return
    if (animate) this.tileRenderer.animateTileState(this.scene, tile, state)
    else renderTileState(this.tileRenderer, tile, state)
    this.bringLettersToFront()
  }

  syncTilePosition(slotIndex: number): void {
    this.tileRenderer.syncTilePosition(this.tileBackgrounds[slotIndex])
  }

  syncTileRevealAlpha(slotIndex: number, alpha: number): void {
    this.tileRenderer.syncTileRevealAlpha?.(this.tileBackgrounds[slotIndex], alpha)
  }

  bringLettersToFront(): void {
    this.tileSlots.forEach(({ text }) => {
      text.setDepth(20)
      text.parentContainer?.bringToTop(text)
    })
  }

  letterMatchesOriginalTileLetter(slotIndex: number): boolean {
    return letterMatchesOriginalTileLetter(this.board.boardTiles, this.occupancy, this.board.letters, slotIndex)
  }

  lettersMatchOriginalTileLetters(): boolean[] {
    return this.tileBackgrounds.map((_background, slotIndex) => this.letterMatchesOriginalTileLetter(slotIndex))
  }

  updateTileMatchRendering(matchStates = this.lettersMatchOriginalTileLetters()): void {
    matchStates.forEach((matches, slotIndex) => {
      this.renderTileState(slotIndex, matches ? "matched" : "unmatched", true)
    })
  }

  updateEvaluationColor(slotIndex: number): void {
    const tile = this.tileBackgrounds[slotIndex]
    const rowIndex = Math.floor(slotIndex / 5)
    const column = slotIndex % 5
    const result = this.board.rows[rowIndex]?.pattern[column]
    if (!tile || result === undefined) return
    const color = tileColor(result)
    tile.setFillStyle(color).setStrokeStyle(BOARD_LAYOUT.tileBorderWidth, color)
  }

  animateEvaluationReveal(slotIndex: number): void {
    const tile = this.tileBackgrounds[slotIndex]
    const text = this.tileSlots[slotIndex]?.text
    if (!tile || !text) return

    this.scene.tweens.add({
      targets: [tile, text],
      scaleY: 0.04,
      duration: TILE_EVALUATION_FLIP_DURATION,
      ease: "Sine.In",
      onComplete: () => {
        this.updateEvaluationColor(slotIndex)
        this.renderTileState(slotIndex, "matched")
        this.scene.tweens.add({
          targets: [tile, text],
          scaleY: 1,
          duration: TILE_EVALUATION_FLIP_DURATION,
          ease: "Back.Out",
          onComplete: () => this.bringLettersToFront(),
        })
      },
    })
  }

  animateShuffle(nextOccupancy: readonly number[], duration: number, onComplete: () => void): void {
    const visualsById = this.visualsByLetterId
    const currentOccupancy = [...this.occupancy]
    let moving = 0
    currentOccupancy.forEach((letterId) => {
      const destinationSlot = nextOccupancy.indexOf(letterId)
      const visual = visualsById.get(letterId)
      if (destinationSlot < 0 || !visual) return
      moving += 1
      const destination = boardSlotCenter(Math.floor(destinationSlot / 5), destinationSlot % 5)
      this.scene.tweens.add({
        targets: visual.text,
        x: destination.x,
        y: destination.y,
        duration,
        ease: "Cubic.InOut",
        onComplete: () => {
          moving -= 1
          if (moving > 0) return
          this.occupancy = [...nextOccupancy]
          const reordered = nextOccupancy.map((id) => visualsById.get(id)).filter((visual): visual is GameBoardTileVisual => visual !== undefined)
          this.tileSlots.splice(0, this.tileSlots.length, ...reordered)
          this.bringLettersToFront()
          onComplete()
        },
      })
    })
    if (moving === 0) {
      this.occupancy = [...nextOccupancy]
      onComplete()
    }
  }

  destroy(): void {
    this.tileBackgrounds.forEach((tile) => {
      this.tileRenderer.cancelTileAnimation(tile)
      this.scene.tweens.killTweensOf(tile)
    })
    this.tileSlots.forEach(({ text }) => this.scene.tweens.killTweensOf(text))
    this.tileRenderer.destroy()
  }

  clearSelection(): void {
    this.selectedSlot = undefined
    this.updateSelection()
  }

  selectTile(slotIndex: number, mode: GameBoardInteractionMode): void {
    if (this.swapping || this.callbacks.isInteractionBlocked()) return
    const rowIndex = Math.floor(slotIndex / 5)
    if (this.isRowCorrect(rowIndex)) {
      this.selectedSlot = undefined
      this.updateSelection()
      this.callbacks.onAlreadyCompleteRow(rowIndex)
      return
    }
    if (mode === "reveal") {
      this.revealTile(slotIndex)
      return
    }
    if (this.selectedSlot === undefined) {
      this.selectedSlot = slotIndex
      this.updateSelection()
      return
    }
    if (this.selectedSlot === slotIndex) {
      this.selectedSlot = undefined
      this.updateSelection()
      return
    }
    const firstSlot = this.selectedSlot
    this.selectedSlot = undefined
    const first = this.tileSlots[firstSlot]
    const second = this.tileSlots[slotIndex]
    if (first === undefined || second === undefined) return
    this.swapping = true
    this.updateSelection(false)
    this.animateLetterSelection(second.text, true)
    this.scene.time.delayedCall(SWAP_SELECTION_DELAY, () => this.swapSlots(firstSlot, slotIndex))
  }

  swapSlots(firstSlot: number, secondSlot: number): void {
    if (this.swapping && this.selectedSlot !== undefined) return
    const first = this.tileSlots[firstSlot]
    const second = this.tileSlots[secondSlot]
    if (first === undefined || second === undefined) return
    const previousOccupancy = [...this.occupancy]
    const nextOccupancy = swapOccupancy(this.occupancy, firstSlot, secondSlot)
    const event: GameBoardSwapEvent = {
      firstSlot,
      secondSlot,
      previousOccupancy,
      nextOccupancy,
      previousCorrectCount: countCorrectOccupancy(this.board.boardTiles, previousOccupancy, this.board.letters),
      nextCorrectCount: countCorrectOccupancy(this.board.boardTiles, nextOccupancy, this.board.letters),
    }
    this.occupancy = nextOccupancy
    this.tileSlots[firstSlot] = second
    this.tileSlots[secondSlot] = first
    this.callbacks.onSwapCommitted(event)
    this.animateExchange(first, second, firstSlot, secondSlot)
  }

  private build(options: GameBoardBuildOptions): void {
    const letterById = new Map<number, Letter>(this.board.letters.map((letter) => [letter.id, letter]))

    this.board.rows.forEach((row, rowIndex) => {
      const frozen = this.board.frozenRows.includes(rowIndex)
      const rowTiles = this.board.tiles.slice(rowIndex * 5, (rowIndex + 1) * 5)

      row.pattern.forEach((_result, column) => {
        const slotIndex = rowIndex * 5 + column
        const center = boardSlotCenter(rowIndex, column)
        const background = this.tileRenderer.createTile(this.scene, center, options.initialTileColor ?? tileColor(row.pattern[column]!))
          .setInteractive({ useHandCursor: true })
        // A newly created tile starts in its quiet state. Matching against the
        // occupying letter is evaluated later, when the board has established
        // or changed its occupancy.
        renderTileState(this.tileRenderer, background, "matched")

        background.on("pointerdown", () => options.onTilePointerDown(slotIndex, rowIndex, frozen))
        this.tileBackgrounds.push(background)
        const tile = rowTiles[column]
        if (tile === undefined) return

        const displayLetterId = options.openingExplanationPending
          ? this.board.initialOccupancy[slotIndex]
          : options.displayOccupancy?.[slotIndex] ?? this.board.occupancy[slotIndex]
        const displayLetter = letterById.get(displayLetterId ?? tile.id)?.character ?? tile.letter
        const openingVisual = options.openingExplanationPending && displayLetterId !== undefined
          ? new LetterVisual(this.scene, displayLetter, center)
          : undefined
        const text = openingVisual?.text ?? createTileLetter(this.scene, center, displayLetter, GAME_PRESENTATION)

        options.container?.add(background)
        options.container?.add(text)

        this.tileSlots.push({ tile, text })
        if (displayLetterId !== undefined) this.visualsByLetterId.set(displayLetterId, this.tileSlots[this.tileSlots.length - 1]!)
        if (openingVisual && displayLetterId !== undefined) this.openingLetterVisuals.set(displayLetterId, openingVisual)
      })
    })
  }

  private revealTile(slotIndex: number): void {
    const rowIndex = Math.floor(slotIndex / 5)
    const columnIndex = slotIndex % 5
    const row = this.board.rows[rowIndex]
    const expectedLetter = row?.intendedGuess[columnIndex]
    const current = this.tileSlots[slotIndex]
    if (expectedLetter === undefined || current === undefined || current.tile.letter === expectedLetter) return
    const sourceSlot = this.occupancy.findIndex((letterId, index) => this.board.letters[letterId]?.character === expectedLetter && index !== slotIndex && !this.letterMatchesOriginalTileLetter(index))
    if (sourceSlot >= 0) this.swapSlots(slotIndex, sourceSlot)
  }

  private isRowCorrect(rowIndex: number): boolean {
    const target = rowIndex === this.board.rows.length - 1
      ? this.puzzle.target
      : this.board.rows[rowIndex]?.intendedGuess
    return target !== undefined && this.occupancy
      .slice(rowIndex * 5, (rowIndex + 1) * 5)
      .map((letterId) => this.board.letters[letterId]?.character ?? "")
      .join("") === target
  }

  private updateSelection(animateLetters = true): void {
    this.tileBackgrounds.forEach((background, slotIndex) => {
      const row = this.board.rows[Math.floor(slotIndex / 5)]
      const result = row?.pattern[slotIndex % 5] ?? "absent"
      background.setStrokeStyle(1.5, tileColor(result))
    })
    if (animateLetters) {
      const changedSlots = new Set<number>()
      if (this.renderedSelectedSlot !== undefined) changedSlots.add(this.renderedSelectedSlot)
      if (this.selectedSlot !== undefined) changedSlots.add(this.selectedSlot)
      changedSlots.forEach((slotIndex) => {
        const visual = this.tileSlots[slotIndex]
        if (visual) this.animateLetterSelection(visual.text, slotIndex === this.selectedSlot)
      })
    }
    this.renderedSelectedSlot = this.selectedSlot
  }

  private animateExchange(first: GameBoardTileVisual, second: GameBoardTileVisual, firstSlot: number, secondSlot: number): void {
    const startFirst = boardSlotCenter(Math.floor(firstSlot / 5), firstSlot % 5)
    const startSecond = boardSlotCenter(Math.floor(secondSlot / 5), secondSlot % 5)
    const distance = Math.hypot(startSecond.x - startFirst.x, startSecond.y - startFirst.y)
    const firstArc = createCircularArc(startFirst, startSecond, Math.max(distance * 0.5, distance * 0.5), Math.random() < 0.5 ? -1 : 1, true)
    const secondArc = mirrorCircularArc(firstArc, startFirst, startSecond)
    const arcs = [new CircularArcVisual(this.scene, firstArc, 0xc49f52), new CircularArcVisual(this.scene, secondArc, 0x71845f)]
    arcs.forEach((arc) => { arc.setDepth(SWAP_ARC_DEPTH); arc.animateIn(ARC_ANIMATION_DURATION) })
    this.scene.time.delayedCall(TILE_SWAP_ANIMATION_DURATION - ARC_ANIMATION_DURATION, () => arcs.forEach((arc) => arc.animateOut(ARC_ANIMATION_DURATION, () => arc.destroy())))
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: TILE_SWAP_ANIMATION_DURATION,
      ease: "Sine.easeInOut",
      onUpdate: (tween) => {
        const progress = tween.getValue() ?? 0
        const firstPoint = pointOnCircularArc(firstArc, progress)
        const secondPoint = pointOnCircularArc(secondArc, progress)
        first.text.setPosition(firstPoint.x, firstPoint.y).setDepth(10).setAngle(30)
        second.text.setPosition(secondPoint.x, secondPoint.y).setDepth(10).setAngle(30)
      },
      onComplete: () => {
        first.text.setPosition(startSecond.x, startSecond.y)
        second.text.setPosition(startFirst.x, startFirst.y)
        let remaining = 2
        const finish = (): void => {
          remaining -= 1
          if (remaining === 0) {
            this.swapping = false
            this.callbacks.onSwapSettled()
          }
        }
        this.animateLetterToRest(first.text, finish)
        this.animateLetterToRest(second.text, finish)
      },
    })
  }

  private animateLetterSelection(text: Phaser.GameObjects.Text, selected: boolean): void {
    this.scene.tweens.add({ targets: text, angle: selected ? 30 : 0, duration: TRAVEL_SHADOW_DURATION, ease: "Sine.easeInOut" })
    this.scene.tweens.addCounter({
      from: selected ? 0 : TRAVEL_SHADOW_BLUR,
      to: selected ? TRAVEL_SHADOW_BLUR : 0,
      duration: TRAVEL_SHADOW_DURATION,
      ease: "Sine.easeInOut",
      onUpdate: (tween) => text.setShadow(1, 1, TRAVEL_SHADOW_COLOR, tween.getValue() ?? 0, true, true),
      onComplete: () => { if (!selected) text.setShadow(0, 0, TRAVEL_SHADOW_COLOR, 0, false, false) },
    })
  }

  private animateLetterToRest(text: Phaser.GameObjects.Text, onComplete: () => void): void {
    this.scene.tweens.add({ targets: text, angle: 0, duration: TRAVEL_SHADOW_DURATION, ease: "Sine.easeInOut", onComplete })
    this.scene.tweens.addCounter({
      from: TRAVEL_SHADOW_BLUR,
      to: 0,
      duration: TRAVEL_SHADOW_DURATION,
      ease: "Sine.easeInOut",
      onUpdate: (tween) => text.setShadow(1, 1, TRAVEL_SHADOW_COLOR, tween.getValue() ?? 0, true, true),
      onComplete: () => text.setShadow(0, 0, TRAVEL_SHADOW_COLOR, 0, false, false),
    })
  }
}
