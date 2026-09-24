import Phaser from "phaser"
import { createScrambledBoard } from "../core/board"
import { evaluateGuess } from "../core/evaluateGuess"
import { findNextSwap } from "../core/minimumMoves"
import { tilesFromOccupancy } from "../core/boardState"
import type { WerdolPuzzle } from "../core/puzzle"
import { createTileRendererForMode, type TileRendererMode } from "./board/tileStateRenderers"
import { TILE_COLORS } from "./board/tileVisuals"
import { GameBoard } from "./GameBoard"

const COLORS = { muted: "#756d5e", paper: 0xf3eedf, frame: 0x756d5e } as const
const ROW_DELAY = 900
const SHUFFLE_DURATION = 900
const SWAP_SELECTION_DELAY = 140
const SWAP_PAUSE = 220

const DEMO_PUZZLE: WerdolPuzzle = {
  target: "CAPER",
  rows: ["CABIN", "SPEAR", "MOTEL", "PARTY"].map((intendedGuess) => ({
    intendedGuess,
    pattern: evaluateGuess(intendedGuess, "CAPER"),
  })),
}

/** A scripted controller for a real GameBoard instance. */
export class PuzzleWalkthrough {
  private readonly board = createScrambledBoard(DEMO_PUZZLE, () => 0.37)
  private readonly gameBoard: GameBoard
  private readonly overlay: Phaser.GameObjects.Container
  private readonly timers: Phaser.Time.TimerEvent[] = []
  private active = true
  private afterSwap?: () => void

  constructor(private readonly scene: Phaser.Scene, rendererMode: TileRendererMode, private readonly onClose: () => void) {
    this.overlay = scene.add.container(0, 0).setDepth(35)
    this.buildFrame()
    const renderer = createTileRendererForMode(rendererMode)
    this.gameBoard = new GameBoard(scene, DEMO_PUZZLE, this.board, renderer, {
      openingExplanationPending: false,
      displayOccupancy: this.board.initialOccupancy,
      initialTileColor: TILE_COLORS.empty,
      container: this.overlay,
      onTilePointerDown: () => undefined,
    }, {
      isInteractionBlocked: () => !this.active,
      onAlreadyCompleteRow: () => undefined,
      onSwapCommitted: () => this.gameBoard.updateTileMatchRendering(),
      onSwapSettled: () => {
        const callback = this.afterSwap
        this.afterSwap = undefined
        callback?.()
      },
    })
    this.hideLetters()
    this.playRows(0)
  }

  private buildFrame(): void {
    const screenBackground = this.scene.add.rectangle(0, 0, 430, 760, COLORS.paper).setOrigin(0, 0)
    const inputShield = this.scene.add.rectangle(0, 0, 430, 760, 0, 0).setOrigin(0, 0).setInteractive()
    const frame = this.scene.add.rectangle(20, 78, 390, 450, 0, 0).setOrigin(0, 0).setStrokeStyle(2, COLORS.frame, 0.9)
    const label = this.scene.add.text(30, 84, "DEMONSTRATION", { color: COLORS.muted, fontFamily: "Arial, sans-serif", fontSize: "9px", fontStyle: "bold", letterSpacing: 1, resolution: 2 })
    const close = this.scene.add.text(400, 550, "CLOSE", { color: COLORS.muted, fontFamily: "Arial, sans-serif", fontSize: "10px", fontStyle: "bold", resolution: 2 }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true })
    close.on("pointerdown", () => this.stop())
    this.overlay.add([screenBackground, inputShield, frame, label, close])
  }

  private hideLetters(): void {
    this.gameBoard.tileSlots.forEach(({ text }) => text.setAlpha(0).setDepth(20))
  }

  private playRows(rowIndex: number): void {
    if (!this.active) return
    if (rowIndex > DEMO_PUZZLE.rows.length) {
      this.shuffleLetters()
      return
    }
    const row = DEMO_PUZZLE.rows[rowIndex]
    for (let column = 0; column < 5; column += 1) {
      const slotIndex = rowIndex * 5 + column
      const visual = this.gameBoard.tileSlots[slotIndex]
      if (!visual) continue
      visual.text.setText(rowIndex === DEMO_PUZZLE.rows.length ? DEMO_PUZZLE.target[column] ?? "" : row?.intendedGuess[column] ?? "")
      this.schedule(column * 70, () => {
        if (!this.active) return
        visual.text.setAlpha(1)
        this.schedule(300, () => {
          visual.tile.letter = visual.text.text
          // Evaluation color describes the guess against the target word;
          // matched/unmatched describes whether the occupying letter belongs
          // in this physical tile. Those are independent states. The letters
          // have not shuffled yet, so all revealed tiles remain matched here.
          this.gameBoard.animateEvaluationReveal(slotIndex)
        })
      })
    }
    this.schedule(ROW_DELAY, () => this.playRows(rowIndex + 1))
  }

  private shuffleLetters(): void {
    this.gameBoard.animateShuffle(this.board.occupancy, SHUFFLE_DURATION, () => {
      this.gameBoard.updateTileMatchRendering()
      this.playSwap()
    })
  }

  private playSwap(): void {
    if (!this.active) return
    const next = findNextSwap(DEMO_PUZZLE, tilesFromOccupancy(this.gameBoard.currentOccupancy, this.board.letters))
    if (!next) {
      this.schedule(700, () => this.stop())
      return
    }
    this.gameBoard.selectTile(next.firstSlot, "swap")
    this.schedule(SWAP_SELECTION_DELAY + SWAP_PAUSE, () => {
      this.afterSwap = () => this.schedule(SWAP_PAUSE, () => this.playSwap())
      this.gameBoard.selectTile(next.secondSlot, "swap")
    })
  }

  private schedule(delay: number, callback: () => void): void {
    const timer = this.scene.time.delayedCall(delay, () => {
      const index = this.timers.indexOf(timer)
      if (index >= 0) this.timers.splice(index, 1)
      callback()
    })
    this.timers.push(timer)
  }

  stop(): void {
    if (!this.active) return
    this.active = false
    this.timers.forEach((timer) => timer.remove())
    this.gameBoard.destroy()
    this.overlay.destroy(true)
    this.onClose()
  }
}
