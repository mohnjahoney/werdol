import Phaser from "phaser"
import { createScrambledBoard } from "../core/board"
import { evaluateGuess } from "../core/evaluateGuess"
import { countOptimalMoves, findNextSwapRandomize } from "../core/minimumMoves"
import { tilesFromOccupancy } from "../core/boardState"
import type { WerdolPuzzle } from "../core/puzzle"
import { createTileRendererForMode, type TileRendererMode } from "./board/tileStateRenderers"
import { TILE_COLORS } from "./board/tileVisuals"
import { GameBoard } from "./GameBoard"

const COLORS = { ink: "#211f1a", muted: "#756d5e", paper: 0xf3eedf, frame: 0x756d5e } as const
const ROW_DELAY = 900
const SHUFFLE_DURATION = 900
const SWAP_SELECTION_DELAY = 140
const SWAP_PAUSE = 220
const DEMO_COMPLETION_PAUSE = 1_000
const DEMO_FADE_DURATION = 500
const EXTRA_MOVES = 3

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
  private readonly minimumMoves = countOptimalMoves(DEMO_PUZZLE, this.board.tiles)
  private readonly gameBoard: GameBoard
  private readonly overlay: Phaser.GameObjects.Container
  private readonly timers: Phaser.Time.TimerEvent[] = []
  private readonly moveBarBricks: Phaser.GameObjects.Rectangle[] = []
  private moveCountText!: Phaser.GameObjects.Text
  private movesTaken = 0
  private active = true
  private fadingOut = false
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
    this.buildProgress()
    this.hideLetters()
    this.playRows(0)
  }

  private buildFrame(): void {
    const screenBackground = this.scene.add.rectangle(0, 0, 430, 760, COLORS.paper).setOrigin(0, 0)
    const inputShield = this.scene.add.rectangle(0, 0, 430, 760, 0, 0).setOrigin(0, 0).setInteractive()
    const frame = this.scene.add.rectangle(20, 78, 390, 580, 0, 0).setOrigin(0, 0).setStrokeStyle(2, COLORS.frame, 0.9)
    const label = this.scene.add.text(30, 84, "DEMONSTRATION", { color: COLORS.muted, fontFamily: "Arial, sans-serif", fontSize: "9px", fontStyle: "bold", letterSpacing: 1, resolution: 2 })
    const close = this.scene.add.text(400, 632, "CLOSE", { color: COLORS.muted, fontFamily: "Arial, sans-serif", fontSize: "10px", fontStyle: "bold", resolution: 2 }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true })
    close.on("pointerdown", () => this.fadeBackToGame())
    this.overlay.add([screenBackground, inputShield, frame, label, close])
  }

  private buildProgress(): void {
    const ruleLeft = 47
    const ruleWidth = 336
    const ruleY = 512
    const statusTop = 539
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
    const next = findNextSwapRandomize(DEMO_PUZZLE, tilesFromOccupancy(this.gameBoard.currentOccupancy, this.board.letters))
    if (!next) {
      this.schedule(DEMO_COMPLETION_PAUSE, () => this.fadeBackToGame())
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

  private fadeBackToGame(): void {
    if (!this.active || this.fadingOut) return
    this.active = false
    this.fadingOut = true
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
