import Phaser from "phaser"
import { createScrambledBoard } from "../core/board"
import { evaluateGuess } from "../core/evaluateGuess"
import { countOptimalMoves, findNextSwapRandomize } from "../core/minimumMoves"
import { tilesFromOccupancy } from "../core/boardState"
import type { WerdolPuzzle } from "../core/puzzle"
import { createTileRendererForMode, type TileRendererMode } from "./board/tileStateRenderers"
import { TILE_COLORS } from "./board/tileVisuals"
import { GameBoard } from "./GameBoard"
import { CONTENT_SHIFT, STATUS_RULE_Y } from "./board/boardLayout"

const COLORS = { ink: "#211f1a", muted: "#756d5e", paper: 0xf3eedf, frame: 0x756d5e } as const
const SHUFFLE_DURATION = 900
const SWAP_SELECTION_DELAY = 140
const SWAP_GAP = 650
const SETUP_REVEAL_DURATION = 450
const DEMO_SWAPS = 4
const READ_DELAY = 1_000
const FAST_FORWARD_SCALE = 8
const TEXT_ENTRY_DURATION = 420
const TEXT_ENTRY_LIFT = 10
const DEMO_FADE_DURATION = 500
const EXTRA_MOVES = 3

const FRAME_TOP = 14
const LABEL_Y = 46
const CAPTION_Y = 64
const CONTROLS_Y = 628 + CONTENT_SHIFT
const DISCLAIMER_Y = 662 + CONTENT_SHIFT

const DEMO_PUZZLE: WerdolPuzzle = {
  target: "CAPER",
  rows: ["CABIN", "SPEAR", "MOTEL", "PARTY"].map((intendedGuess) => ({
    intendedGuess,
    pattern: evaluateGuess(intendedGuess, "CAPER"),
  })),
}

const BEATS = [
  { label: "1 · THE SETUP", caption: "Not WERDOL yet. This is the setup:\na Wordle game, already finished.\nThe bottom row is the answer.", next: "NEXT →" },
  { label: "2 · THE MIX-UP", caption: "Every letter from every guess\ngets shuffled. Colors stay put.", next: "NEXT →" },
  { label: "3 · YOUR TURN", caption: "Tap two tiles to swap them.\nA ring means it's right.", next: "LET'S PLAY →" },
] as const
const DISCLAIMER = "Not affiliated with Wordle or The New York Times."

/**
 * A scripted controller for a real GameBoard instance. The demo plays as three
 * beats on one board. Each beat shows its text first, gives the player a moment
 * to read it, then plays its animation and holds on the last frame. Next while
 * a beat is running fast-forwards it and moves straight on; back rebuilds the
 * board in the state the previous beat started from.
 */
export class PuzzleWalkthrough {
  private readonly board = createScrambledBoard(DEMO_PUZZLE, () => 0.37)
  private readonly minimumMoves = countOptimalMoves(DEMO_PUZZLE, this.board.tiles)
  private gameBoard!: GameBoard
  private boardObjects: Phaser.GameObjects.GameObject[] = []
  private readonly overlay: Phaser.GameObjects.Container
  private readonly timers: Phaser.Time.TimerEvent[] = []
  private readonly moveBarBricks: Phaser.GameObjects.Rectangle[] = []
  private progressObjects: Phaser.GameObjects.GameObject[] = []
  private moveCountText!: Phaser.GameObjects.Text
  private movesTaken = 0
  private active = true
  private fadingOut = false
  private afterSwap?: () => void
  private beat = 0
  private beatDone = false
  private advanceWhenDone = false
  private swapsPlayed = 0
  private beatLabel!: Phaser.GameObjects.Text
  private caption!: Phaser.GameObjects.Text
  private backButton!: Phaser.GameObjects.Text
  private nextButton!: Phaser.GameObjects.Text
  private disclaimer!: Phaser.GameObjects.Text

  constructor(private readonly scene: Phaser.Scene, private readonly rendererMode: TileRendererMode, private readonly onClose: () => void) {
    this.overlay = scene.add.container(0, 0).setDepth(35)
    this.buildFrame()
    this.buildBoard()
    this.buildProgress()
    this.startBeat(0)
  }

  private buildFrame(): void {
    const serif = "Georgia, Times New Roman, serif"
    const sans = "Arial, sans-serif"
    const screenBackground = this.scene.add.rectangle(0, 0, 430, 760, COLORS.paper).setOrigin(0, 0)
    const inputShield = this.scene.add.rectangle(0, 0, 430, 760, 0, 0).setOrigin(0, 0).setInteractive()
    const frame = this.scene.add.rectangle(20, FRAME_TOP, 390, 676 + CONTENT_SHIFT, 0, 0).setOrigin(0, 0).setStrokeStyle(2, COLORS.frame, 0.9)
    const heading = this.scene.add.text(30, FRAME_TOP + 6, "HOW TO PLAY", { color: COLORS.muted, fontFamily: sans, fontSize: "9px", fontStyle: "bold", letterSpacing: 1, resolution: 2 })
    const close = this.scene.add.text(398, FRAME_TOP + 17, "✕", { color: COLORS.muted, fontFamily: sans, fontSize: "14px", fontStyle: "bold", resolution: 2 }).setOrigin(1, 0.5).setPadding(10).setInteractive({ useHandCursor: true })
    close.on("pointerdown", () => this.fadeBackToGame())
    this.beatLabel = this.scene.add.text(40, LABEL_Y, "", { color: COLORS.muted, fontFamily: sans, fontSize: "10px", fontStyle: "bold", letterSpacing: 1, resolution: 2 })
    this.caption = this.scene.add.text(40, CAPTION_Y, "", { color: COLORS.ink, fontFamily: serif, fontSize: "15px", lineSpacing: 3, wordWrap: { width: 340 }, resolution: 2 })
    this.backButton = this.makeControl(40, CONTROLS_Y, 0, "← BACK", () => this.onBack())
    this.nextButton = this.makeControl(398, CONTROLS_Y, 1, "", () => this.onNext())
    this.disclaimer = this.scene.add.text(40, DISCLAIMER_Y, DISCLAIMER, { color: COLORS.muted, fontFamily: serif, fontSize: "11px", resolution: 2 }).setOrigin(0, 0.5).setAlpha(0)
    this.overlay.add([screenBackground, inputShield, frame, heading, close, this.beatLabel, this.caption, this.backButton, this.nextButton, this.disclaimer])
  }

  private makeControl(x: number, y: number, originX: number, text: string, onPress: () => void): Phaser.GameObjects.Text {
    const control = this.scene.add.text(x, y, text, { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "12px", fontStyle: "bold", letterSpacing: 0.8, resolution: 2 })
      .setOrigin(originX, 0.5)
      .setPadding(8)
      .setInteractive({ useHandCursor: true })
    control.on("pointerover", () => control.setColor(COLORS.muted))
    control.on("pointerout", () => control.setColor(COLORS.ink))
    control.on("pointerdown", onPress)
    return control
  }

  /** Builds (or rebuilds) the empty demo board; everything it adds to the overlay is tracked so it can be thrown away. */
  private buildBoard(): void {
    this.boardObjects.forEach((object) => object.destroy())
    const before = new Set(this.overlay.list)
    this.gameBoard = new GameBoard(this.scene, DEMO_PUZZLE, this.board, createTileRendererForMode(this.rendererMode), {
      openingExplanationPending: false,
      displayOccupancy: this.board.initialOccupancy,
      initialTileColor: TILE_COLORS.empty,
      container: this.overlay,
      onTilePointerDown: () => undefined,
    }, {
      isInteractionBlocked: () => !this.active,
      onAlreadyCompleteRow: () => undefined,
      onSwapCommitted: () => {
        this.movesTaken += 1
        this.updateProgress()
        this.gameBoard.updateTileMatchRendering()
      },
      onSwapSettled: () => {
        const callback = this.afterSwap
        this.afterSwap = undefined
        callback?.()
      },
    })
    this.boardObjects = this.overlay.list.filter((object) => !before.has(object))
    this.gameBoard.tileSlots.forEach(({ text }) => text.setAlpha(0).setDepth(20))
  }

  private buildProgress(): void {
    const ruleLeft = 47
    const ruleWidth = 336
    const ruleY = STATUS_RULE_Y
    const statusTop = STATUS_RULE_Y + 27
    const barLeft = 82
    const barWidth = 266
    const barY = statusTop + 37
    const totalBricks = this.minimumMoves + EXTRA_MOVES
    const brickGap = 3
    const brickWidth = (barWidth - brickGap * (totalBricks - 1)) / totalBricks
    const goalPosition = barLeft + this.minimumMoves * (brickWidth + brickGap) - (this.minimumMoves > 0 ? brickGap / 2 : 0)
    const objects: Phaser.GameObjects.GameObject[] = []
    objects.push(this.scene.add.rectangle(ruleLeft, ruleY, ruleWidth, 1, 0xc6bdae, 0.85).setOrigin(0, 0.5))
    this.moveCountText = this.scene.add.text(barLeft, statusTop + 2, String(this.movesTaken), { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "18px", fontStyle: "bold", resolution: 2 }).setOrigin(0, 0.5)
    const goalCountText = this.scene.add.text(goalPosition, statusTop + 2, String(this.minimumMoves), { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "18px", fontStyle: "bold", resolution: 2 }).setOrigin(0.5)
    const moveLabel = this.scene.add.text(barLeft, statusTop + 17, "MOVES", { color: COLORS.muted, fontFamily: "Arial, sans-serif", fontSize: "8px", fontStyle: "bold", letterSpacing: 1.1, resolution: 2 }).setOrigin(0, 0.5)
    const goalLabel = this.scene.add.text(goalPosition, statusTop + 17, "GOAL", { color: COLORS.muted, fontFamily: "Arial, sans-serif", fontSize: "8px", fontStyle: "bold", letterSpacing: 1.1, resolution: 2 }).setOrigin(0.5)
    objects.push(this.moveCountText, goalCountText, moveLabel, goalLabel)
    for (let index = 0; index < totalBricks; index += 1) {
      const x = barLeft + index * (brickWidth + brickGap)
      const brick = this.scene.add.rectangle(x, barY, brickWidth, 12, 0xb7c0ae).setOrigin(0, 0.5).setRounded(Math.min(3, brickWidth / 2))
      this.moveBarBricks.push(brick)
      objects.push(brick)
    }
    objects.push(this.scene.add.rectangle(goalPosition, barY - 11, 2, 6, COLORS.frame).setOrigin(0.5))
    objects.forEach((object) => (object as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0))
    this.progressObjects = objects
    this.overlay.add(objects)
    this.updateProgress()
  }

  private updateProgress(): void {
    this.moveCountText.setText(String(this.movesTaken))
    this.moveBarBricks.forEach((brick, index) => {
      const isGoalBrick = index < this.minimumMoves
      const isFilled = index < this.movesTaken
      brick.setFillStyle(isFilled
        ? (isGoalBrick ? 0x71845f : 0xb06a5f)
        : (isGoalBrick ? 0xb7c0ae : 0xd8b7b0))
    })
  }

  private setProgressVisible(visible: boolean): void {
    this.scene.tweens.killTweensOf(this.progressObjects)
    this.scene.tweens.add({ targets: this.progressObjects, alpha: visible ? 1 : 0, duration: TEXT_ENTRY_DURATION })
  }

  /** The finished Wordle game, shown all at once: it is the premise, not something to watch being played. */
  private revealSetup(): void {
    this.gameBoard.tileSlots.forEach((visual, slotIndex) => {
      const row = Math.floor(slotIndex / 5)
      const column = slotIndex % 5
      const letter = row === DEMO_PUZZLE.rows.length ? DEMO_PUZZLE.target[column] : DEMO_PUZZLE.rows[row]?.intendedGuess[column]
      visual.text.setText(letter ?? "").setAlpha(1)
      visual.tile.letter = visual.text.text
      this.gameBoard.animateEvaluationReveal(slotIndex)
    })
  }

  private shuffleLetters(): void {
    this.gameBoard.animateShuffle(this.board.occupancy, SHUFFLE_DURATION, () => {
      this.gameBoard.updateTileMatchRendering()
      this.finishBeat()
    })
  }

  private playSwap(): void {
    if (!this.active) return
    const next = this.swapsPlayed >= DEMO_SWAPS
      ? undefined
      : findNextSwapRandomize(DEMO_PUZZLE, tilesFromOccupancy(this.gameBoard.currentOccupancy, this.board.letters))
    if (!next) {
      this.finishBeat()
      return
    }
    this.gameBoard.selectTile(next.firstSlot, "swap")
    this.schedule(SWAP_SELECTION_DELAY + SWAP_GAP / 2, () => {
      this.afterSwap = () => {
        this.swapsPlayed += 1
        this.schedule(SWAP_GAP, () => this.playSwap())
      }
      this.gameBoard.selectTile(next.secondSlot, "swap")
    })
  }

  private startBeat(index: number): void {
    if (!this.active) return
    this.beat = index
    this.beatDone = false
    this.advanceWhenDone = false
    this.setTimeScale(1)
    this.showBeatText(index)
    this.setProgressVisible(index === BEATS.length - 1)
    // The text lands first; the animation waits a beat so it can be read.
    this.schedule(READ_DELAY, () => {
      if (index === 0) {
        this.revealSetup()
        this.schedule(SETUP_REVEAL_DURATION, () => this.finishBeat())
      } else if (index === 1) {
        this.shuffleLetters()
      } else {
        this.swapsPlayed = 0
        this.playSwap()
      }
    })
  }

  private finishBeat(): void {
    if (!this.active) return
    this.beatDone = true
    if (this.advanceWhenDone && this.beat < BEATS.length - 1) this.startBeat(this.beat + 1)
    else this.setTimeScale(1)
  }

  /** Next while a beat is running fast-forwards it, then the following beat starts on its own. */
  private onNext(): void {
    if (!this.active || this.fadingOut) return
    if (this.beat === BEATS.length - 1) {
      this.fadeBackToGame()
      return
    }
    if (this.beatDone) {
      this.startBeat(this.beat + 1)
      return
    }
    if (this.advanceWhenDone) return
    this.advanceWhenDone = true
    this.setTimeScale(FAST_FORWARD_SCALE)
  }

  /** Rebuilds the board as it stood when the previous beat began, then plays that beat again. */
  private onBack(): void {
    if (!this.active || this.fadingOut || this.beat === 0) return
    const target = this.beat - 1
    this.cancelPending()
    this.buildBoard()
    this.movesTaken = 0
    this.updateProgress()
    if (target >= 1) this.revealSetup()
    this.startBeat(target)
  }

  private cancelPending(): void {
    this.timers.forEach((timer) => timer.remove())
    this.timers.length = 0
    this.afterSwap = undefined
    this.setTimeScale(1)
    this.gameBoard.destroy()
  }

  private showBeatText(index: number): void {
    const beat = BEATS[index]
    if (beat === undefined) return
    this.beatLabel.setText(beat.label)
    this.caption.setText(beat.caption)
    this.nextButton.setText(beat.next)
    this.backButton.setVisible(index > 0)
    this.scene.tweens.killTweensOf([this.beatLabel, this.caption, this.disclaimer])
    this.beatLabel.setAlpha(0).setY(LABEL_Y + TEXT_ENTRY_LIFT)
    this.caption.setAlpha(0).setY(CAPTION_Y + TEXT_ENTRY_LIFT)
    this.scene.tweens.add({ targets: this.beatLabel, alpha: 1, y: LABEL_Y, duration: TEXT_ENTRY_DURATION, ease: "Sine.Out" })
    this.scene.tweens.add({ targets: this.caption, alpha: 1, y: CAPTION_Y, duration: TEXT_ENTRY_DURATION, delay: 80, ease: "Sine.Out" })
    this.scene.tweens.add({ targets: this.disclaimer, alpha: index === 0 ? 1 : 0, duration: TEXT_ENTRY_DURATION })
  }

  private setTimeScale(scale: number): void {
    this.scene.time.timeScale = scale
    this.scene.tweens.timeScale = scale
  }

  private schedule(delay: number, callback: () => void): void {
    const timer = this.scene.time.delayedCall(delay, () => {
      const index = this.timers.indexOf(timer)
      if (index >= 0) this.timers.splice(index, 1)
      callback()
    })
    this.timers.push(timer)
  }

  private fadeBackToGame(): void {
    if (!this.active || this.fadingOut) return
    this.active = false
    this.fadingOut = true
    this.setTimeScale(1)
    this.timers.forEach((timer) => timer.remove())
    this.timers.length = 0
    this.gameBoard.destroy()
    this.scene.tweens.add({
      targets: this.overlay,
      alpha: 0,
      duration: DEMO_FADE_DURATION,
      ease: "Sine.InOut",
      onComplete: () => this.finishClose(),
    })
  }

  private finishClose(): void {
    if (!this.fadingOut) return
    this.fadingOut = false
    this.overlay.destroy(true)
    this.onClose()
  }
}
