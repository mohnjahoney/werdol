import Phaser from "phaser"
import { createScrambledBoard, type Letter, type LetterTile, type ScrambledBoard } from "../core/board"
import { evaluateGuess } from "../core/evaluateGuess"
import { createWerdolPuzzle, type WerdolPuzzle, type PuzzleSetup } from "../core/puzzle"
import { countBoardTiles } from "../core/validation"
import { benchmarkSolvers, countOptimalMoves, findNextSwap, type SolverBenchmark } from "../core/minimumMoves"
import { countCorrectTiles, createReferencePath, type ReviewState } from "../core/reviewPath"
import { letterMatchesOriginalTileLetter, tilesFromOccupancy } from "../core/boardState"
import { createTimelineRects, DEFAULT_MAGNIFICATION_CONFIG, layoutTimelineRects, timelineScaleForStateCount, timelineWidthForStateCount, type MagnificationMode, type TimelineRect } from "../core/reviewTimeline"
import { cardWidthForPath, createReviewCardRects, DEFAULT_REVIEW_CARD_CONFIG, focusCardIndexAtX, layoutReviewCards, type ReviewCardRect } from "../core/reviewCards"
import { TimelineExplorer } from "../core/timelineExplorer"
import { ALLOWED_WORDS, ANSWER_WORDS } from "../core/words"
import { createSeededRandom, nextPuzzleSeed, normalizeSeed, seedFromCurrentTime } from "../core/seededRandom"
import { configureLogicalCamera, RENDER_SCALE } from "../style/rendering"
import { startPuzzleAnalytics, trackWerdolEvent, trackSessionStarted } from "../analytics/tracker"
import { OpeningAnimation } from "../presentation/OpeningAnimation"
import { BOARD_LAYOUT, boardSlotCenter } from "../presentation/board/boardLayout"
import { createTileRendererForMode, renderTileState, type TileRendererMode, type TileStateRenderer } from "../presentation/board/tileStateRenderers"
import { createTileLetter, REVIEW_PRESENTATION, TILE_COLORS, tileColor } from "../presentation/board/tileVisuals"
import { celebrateCompletedPuzzle, celebrateCompletedRow } from "../presentation/celebrations"
import { addWerdolHeader } from "../presentation/WerdolHeader"
import { createCircularArc, mirrorCircularArc, pointOnCircularArc } from "../presentation/circularArc"
import { CircularArcVisual } from "../presentation/circularArcVisual"
import { PuzzleWalkthrough } from "../presentation/PuzzleWalkthrough"
import { LetterVisual } from "../presentation/LetterVisual"
import { GameBoard, type GameBoardSwapEvent, type GameBoardTileVisual } from "../presentation/GameBoard"

const COLORS = {
  ink: "#211f1a",
  muted: "#756d5e",
  mutedNumeric: 0x756d5e,
  button: 0xc6bdae,
  buttonHover: 0x71845f,
  primaryButton: 0x71845f,
  primaryButtonHover: 0x526646,
  primaryButtonText: "#f3eedf",
  buttonHoverText: "#f3eedf",
  reviewHover: 0xe5a5bc,
} as const
const SWAP_ANIMATION_DURATION = 480
const ARC_ANIMATION_DURATION = 120
const TILE_SWAP_ANIMATION_DURATION = 400
const SWAP_ARC_DEPTH = 5
const BOARD_WARMUP_DURATION = 280
const BOARD_WARMUP_STAGGER = 34
const BOARD_WARMUP_DISTANCE = 12
const BOARD_WARMUP_END_PAUSE = 220
const EXPLANATION_SPEED = 2
const explanationTime = (milliseconds: number): number => milliseconds / EXPLANATION_SPEED
const EXPLANATION_ENTRY_INTERVAL = explanationTime(112)
const EXPLANATION_FLIP_DURATION = explanationTime(145)
const EXPLANATION_SHUFFLE_DURATION = explanationTime(1250)
const EXPLANATION_SHUFFLE_STAGGER = explanationTime(18) * 4
const EXPLANATION_POST_SHUFFLE_PAUSE = 500
const EXPLANATION_LETTER_REVEAL_DELAY = 300
const EXPLANATION_LETTER_REVEAL_DURATION = 300
const EXTRA_MOVES = 3
const UI_ENTRANCE_DURATION = 260
const UI_ENTRANCE_OFFSET_Y = 12
const UI_ENTRANCE_EASE = "Sine.Out"
const FINISH_PHRASES = {
  extraOne: ["Nicely done", "Sharp work", "Well played", "Nice solve", "Good work", "Nicely solved", "You got it", "Strong finish"],
  extraTwo: ["Very nicely done", "Strong work", "A good solve", "Nicely solved", "Well found", "Good finish", "Nicely handled", "That works"],
  extraThree: ["Great finish", "Well found", "You got there", "A fine solve", "Nicely done", "Strong finish", "Good solve", "That’s the word"],
  goal: ["Excellent solve", "Beautifully solved", "Right on target", "You nailed it", "Great solve", "Perfectly placed", "Exactly right", "Nicely played"],
  underGoal: ["Brilliant solve", "Exceptional work", "Beautiful work", "Masterfully solved", "Outstanding", "A superb solve", "That was excellent", "You found it"],
} as const

type TileVisual = GameBoardTileVisual

interface SceneData extends PuzzleSetup {
  challengingTestPattern?: boolean
}
type InteractionMode = "swap" | "reveal"
type WordListMode = "easy" | "hard"
type IconKind = "swap" | "reveal" | "easy" | "hard" | "reset"
type ReviewPathKind = "player" | "reference"
type DevTab = "setup" | "solve" | "review"

const ICON_KEYS = ["replace", "eye", "square", "layers-3", "rotate-ccw", "arrow-right"] as const
const OPENING_SEEN_KEY = "werdol-opening-seen"

let pendingSceneData: SceneData | undefined
const CHALLENGE_TARGET = "xxxxx"
const CHALLENGE_ROWS = ["eager", "hewed", "sleet", "bumpy"] as const
const CHALLENGE_INITIAL_LETTERS = "arehegwsleedtbmueepy"

const devSessionState: {
  activeTab: DevTab
  interactionMode: InteractionMode
  magnificationMode: MagnificationMode
  tileRendererMode: TileRendererMode
  titleArcRadiusMultiplier: number
} = {
  activeTab: "setup",
  interactionMode: "swap",
  magnificationMode: "cards",
  tileRendererMode: "halo",
  titleArcRadiusMultiplier: 0.5,
}

export class MainScene extends Phaser.Scene {
  private puzzle!: WerdolPuzzle
  private letters: Letter[] = []
  private initialOccupancy: number[] = []
  private initialTileIds: number[] = []
  private swapDirection = 1
  private swapAnimating = false
  private movesTaken = 0
  private minimumMoves = 0
  private outOfMovesDismissed = false
  private challengeBenchmark?: SolverBenchmark
  private puzzleCreationFailed = false
  private preparedBoard?: ScrambledBoard
  private gameBoard?: GameBoard
  private devPanelReady = false
  private openingAnimationActive = false
  private openingExplanationPending = false
  private boardWarmupPending = false
  private openingShuffleOccupancy?: number[]
  private openingAnimation?: OpeningAnimation
  private openingSkipInProgress = false
  private deferredUiObjects: Phaser.GameObjects.GameObject[] = []
  private moveBarBricks: Phaser.GameObjects.Rectangle[] = []
  private moveBarMinimumMarker!: Phaser.GameObjects.Rectangle
  private outOfMovesOverlay?: Phaser.GameObjects.Container
  private finishOverlay?: Phaser.GameObjects.Container
  private howToPlayOverlay!: Phaser.GameObjects.Container
  private walkthrough?: PuzzleWalkthrough
  private requireTargetLetterInEachRow = false
  private requireGreenTileInEachRow = false
  private minGreenTiles = 4
  private minYellowTiles = 4
  private wordListMode: WordListMode = "easy"
  private challengingTestPattern = false
  private appliedChallengingTestPattern = false
  private seed = 0
  private wordRandom!: () => number
  private letterRandom!: () => number
  private puzzleId = ""
  private puzzleNumber = 0
  private puzzleStartedAt = 0
  private puzzleEndedTracked = false
  private devPanel!: Phaser.GameObjects.Container
  private tileRendererPanel!: Phaser.GameObjects.Container
  private devTabContainers!: Record<DevTab, Phaser.GameObjects.Container>
  private tileRendererMode: TileRendererMode = devSessionState.tileRendererMode
  private tileRenderer: TileStateRenderer = createTileRendererForMode(this.tileRendererMode)
  private devTabButtons!: Record<DevTab, Phaser.GameObjects.Rectangle>
  private devTabLabels!: Record<DevTab, Phaser.GameObjects.Text>
  private feedbackModeButtons: Array<{ id: TileRendererMode; button: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }> = []
  private devOverlay!: Phaser.GameObjects.Rectangle
  private tileRendererOverlay!: Phaser.GameObjects.Rectangle
  private devPanelBackground!: Phaser.GameObjects.Rectangle
  private tileRendererPanelBackground!: Phaser.GameObjects.Rectangle
  private devCloseButton!: Phaser.GameObjects.Text
  private tileRendererCloseButton!: Phaser.GameObjects.Text
  private replayOpeningButton!: Phaser.GameObjects.Text
  private devToggle!: Phaser.GameObjects.Rectangle
  private devGreenToggle!: Phaser.GameObjects.Rectangle
  private devChallengeToggle!: Phaser.GameObjects.Rectangle
  private devGreenCountText!: Phaser.GameObjects.Text
  private devYellowCountText!: Phaser.GameObjects.Text
  private devCountButtons: Phaser.GameObjects.Text[] = []
  private easyModeButton!: Phaser.GameObjects.Rectangle
  private hardModeButton!: Phaser.GameObjects.Rectangle
  private seedInput!: Phaser.GameObjects.DOMElement
  private interactionMode: InteractionMode = "swap"
  private normalModeButton!: Phaser.GameObjects.Rectangle
  private revealModeButton!: Phaser.GameObjects.Rectangle
  private normalModeLabel!: Phaser.GameObjects.Container
  private revealModeLabel!: Phaser.GameObjects.Container
  private easyModeLabel!: Phaser.GameObjects.Container
  private hardModeLabel!: Phaser.GameObjects.Container
  private titleArcRadiusInput!: Phaser.GameObjects.DOMElement
  private modeLabelAnimating = false
  private playerPath: ReviewState[] = []
  private reviewOverlay?: Phaser.GameObjects.Container
  private reviewBoard?: Phaser.GameObjects.Container
  private reviewTimeline?: Phaser.GameObjects.Container
  private reviewReferencePath: ReviewState[] = []
  private reviewSelectedPath: ReviewPathKind = "player"
  private reviewSelectedIndex = 0
  private reviewOriginalTiles: LetterTile[] = []
  private reviewTileTexts: Phaser.GameObjects.Text[] = []

  private get tileSlots(): TileVisual[] {
    return this.gameBoard?.tileSlots ?? []
  }

  private get occupancy(): readonly number[] {
    return this.gameBoard?.currentOccupancy ?? []
  }

  private get tileBackgrounds(): Phaser.GameObjects.Rectangle[] {
    return this.gameBoard?.tileBackgrounds ?? []
  }

  private get openingLetterVisuals(): Map<number, LetterVisual> {
    return this.gameBoard?.openingLetterVisuals ?? new Map()
  }
  private reviewSwapTween?: Phaser.Tweens.Tween
  private reviewSwapAnimating = false
  private reviewPlaying = false
  private reviewTimer?: Phaser.Time.TimerEvent
  private reviewExplorer?: TimelineExplorer<ReviewPathKind>
  private reviewTimelineRows: Array<{ kind: ReviewPathKind; y: number; mode: MagnificationMode; baseRects: TimelineRect[] | ReviewCardRect[]; visuals: Phaser.GameObjects.Rectangle[]; left: number; right: number; focusCardIndex?: number }> = []
  private magnificationMode: MagnificationMode = "cards"
  private centerMagnificationButton!: Phaser.GameObjects.Rectangle
  private continuousMagnificationButton!: Phaser.GameObjects.Rectangle
  private cardMagnificationButton!: Phaser.GameObjects.Rectangle
  private static readonly ACTIVE_BUTTON_COLOR = 0x71845f
  private static readonly INACTIVE_BUTTON_COLOR = 0xc6bdae
  private static readonly BUTTON_STROKE_COLOR = 0x756d5e

  constructor() {
    super("main")
  }

  preload(): void {
    for (const icon of ICON_KEYS) {
      this.load.svg(`werdol-${icon}`, `${import.meta.env.BASE_URL}icons/${icon}.svg`, { width: 48, height: 48 })
    }
  }

  create(): void {
    const data = pendingSceneData ?? {}
    pendingSceneData = undefined
    configureLogicalCamera(this)
    this.letters = []
    this.initialOccupancy = []
    this.initialTileIds = []
    this.swapAnimating = false
    this.movesTaken = 0
    this.minimumMoves = 0
    this.outOfMovesDismissed = false
    this.challengeBenchmark = undefined
    this.playerPath = []
    this.reviewOverlay = undefined
    this.outOfMovesOverlay = undefined
    this.finishOverlay = undefined
    this.walkthrough = undefined
    this.reviewBoard = undefined
    this.reviewTimeline = undefined
    this.reviewTileTexts = []
    this.reviewSwapTween = undefined
    this.reviewSwapAnimating = false
    this.reviewReferencePath = []
    this.reviewPlaying = false
    this.reviewTimelineRows = []
    this.reviewExplorer?.dispose()
    this.reviewExplorer = undefined
    this.reviewTimer?.remove()
    this.reviewTimer = undefined
    this.puzzleCreationFailed = false
    this.preparedBoard = undefined
    this.devPanelReady = false
    this.openingAnimationActive = false
    this.openingAnimation = undefined
    this.openingSkipInProgress = false
    this.deferredUiObjects = []
    this.moveBarBricks = []
    this.modeLabelAnimating = false
    this.interactionMode = devSessionState.interactionMode
    this.magnificationMode = devSessionState.magnificationMode
    this.requireTargetLetterInEachRow = data.requireTargetLetterInEachRow ?? false
    this.requireGreenTileInEachRow = data.requireGreenTileInEachRow ?? false
    this.minGreenTiles = clampTileMinimum(data.minGreenTiles ?? 4)
    this.minYellowTiles = clampTileMinimum(data.minYellowTiles ?? 4)
    this.wordListMode = data.wordListMode ?? "easy"
    this.challengingTestPattern = data.challengingTestPattern ?? false
    this.appliedChallengingTestPattern = this.challengingTestPattern
    this.seed = normalizeSeed(data.seed ?? seedFromCurrentTime())
    this.wordRandom = createSeededRandom(this.seed, 1)
    this.letterRandom = createSeededRandom(this.seed, 2)
    this.puzzleEndedTracked = false
    const puzzleAnalytics = startPuzzleAnalytics()
    this.puzzleId = puzzleAnalytics.puzzleId
    this.puzzleNumber = puzzleAnalytics.puzzleNumber
    this.puzzleStartedAt = performance.now()
    trackSessionStarted()
    try {
      this.puzzle = this.challengingTestPattern
        ? {
            target: CHALLENGE_TARGET,
            rows: CHALLENGE_ROWS.map((word) => ({ intendedGuess: word, pattern: evaluateGuess(word, CHALLENGE_TARGET) })),
          }
        : createWerdolPuzzle(this.wordRandom, {
            requireTargetLetterInEachRow: this.requireTargetLetterInEachRow,
            requireGreenTileInEachRow: this.requireGreenTileInEachRow,
            minGreenTiles: this.minGreenTiles,
            minYellowTiles: this.minYellowTiles,
            wordListMode: this.wordListMode,
          })
    } catch {
      this.puzzleCreationFailed = true
      this.puzzle = { target: "", rows: [] }
    }
    this.openingAnimationActive = !this.puzzleCreationFailed && !this.hasSeenOpening()
    this.openingExplanationPending = this.openingAnimationActive
    this.boardWarmupPending = !this.puzzleCreationFailed && !this.openingAnimationActive
    this.openingShuffleOccupancy = undefined
    if (this.openingAnimationActive) {
      this.preparedBoard = createScrambledBoard(this.puzzle, this.letterRandom)
      this.markOpeningSeen()
      this.openingAnimation = new OpeningAnimation(this, () => this.finishOpeningAnimation(), { arcRadiusMultiplier: devSessionState.titleArcRadiusMultiplier })
      this.input.once("pointerdown", this.skipOpeningAnimation, this)
    }
    addWerdolHeader(this)
    const devButton = this.add.circle(410, 18, 8, COLORS.button, 0.92)
      .setStrokeStyle(1.5, COLORS.mutedNumeric)
      .setInteractive({ useHandCursor: true })
    devButton.on("pointerdown", () => this.setDevPanelVisible(!this.devPanel.visible))
    const rendererButton = this.add.rectangle(390, 18, 12, 12, COLORS.button, 0.92)
      .setStrokeStyle(1.5, COLORS.mutedNumeric)
      .setInteractive({ useHandCursor: true })
    rendererButton.on("pointerdown", () => this.setTileRendererPanelVisible(!this.tileRendererPanel.visible))

    if (this.puzzleCreationFailed) {
      this.add.text(31, 235, "NO PUZZLE FOUND", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "18px", fontStyle: "bold", resolution: RENDER_SCALE })
      this.add.text(31, 265, "Try reducing the constraints in DEV.", { color: COLORS.muted, fontFamily: "Georgia, Times New Roman, serif", fontSize: "16px", wordWrap: { width: 360 }, resolution: RENDER_SCALE })
    } else {
      this.buildBoard()
    }
    trackWerdolEvent("werdol:puzzle_started", {
      puzzleId: this.puzzleId,
      puzzleNumber: this.puzzleNumber,
      randomSeed: this.seed,
      wordListMode: this.wordListMode,
      targetWord: this.puzzle.target,
      minimumMoves: this.minimumMoves,
      wordsConsidered: this.puzzle.wordsConsidered ?? 0,
    })
    this.buildMoveInfo()
    this.buildNewPuzzleButton()
    this.buildHowToPlay()
    this.buildDevPanel()
    this.buildTileRendererPanel()
    if (this.boardWarmupPending) {
      this.boardWarmupPending = false
      this.animateBoardWarmup()
    }
  }

  private hasSeenOpening(): boolean {
    try {
      return window.sessionStorage.getItem(OPENING_SEEN_KEY) === "true"
    } catch {
      return false
    }
  }

  private markOpeningSeen(): void {
    try {
      window.sessionStorage.setItem(OPENING_SEEN_KEY, "true")
    } catch {
      // The intro can replay if session storage is unavailable.
    }
  }

  private replayOpening(): void {
    try {
      window.sessionStorage.removeItem(OPENING_SEEN_KEY)
    } catch {
      // Restarting still gives the developer a fresh attempt in normal browsers.
    }
    this.restartWithSetup(this.currentPuzzleSetup())
  }

  private restartWithSetup(setup: SceneData): void {
    pendingSceneData = setup
    this.scene.restart()
  }

  private buildNewPuzzleButton(): void {
    const button = this.add.rectangle(125, 645, 180, 38, COLORS.primaryButton).setOrigin(0, 0).setStrokeStyle(1.5, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    const label = this.add.text(215, 664, "NEW PUZZLE", { color: COLORS.primaryButtonText, fontFamily: "Arial, sans-serif", fontSize: "14px", fontStyle: "bold", letterSpacing: 0.5, resolution: RENDER_SCALE }).setOrigin(0.5).setDepth(1)
    button.on("pointerover", () => {
      button.setFillStyle(COLORS.primaryButtonHover)
      label.setColor(COLORS.primaryButtonText)
    })
    button.on("pointerout", () => {
      button.setFillStyle(COLORS.primaryButton)
      label.setColor(COLORS.primaryButtonText)
    })
    button.on("pointerdown", () => {
      this.restartWithSetup(this.nextPuzzleSetup())
    })
    this.queueUiEntrance([button, label])
  }

  private buildHowToPlay(): void {
    const infoButton = this.add.circle(330, 664, 11, COLORS.button).setStrokeStyle(1.5, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    const infoLabel = this.add.text(330, 664, "i", { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "16px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(0.5).setDepth(1)
    infoButton.on("pointerover", () => {
      infoButton.setFillStyle(COLORS.buttonHover)
      infoLabel.setColor(COLORS.buttonHoverText)
    })
    infoButton.on("pointerout", () => {
      infoButton.setFillStyle(COLORS.button)
      infoLabel.setColor(COLORS.ink)
    })

    this.howToPlayOverlay = this.add.container(0, 0).setDepth(30).setVisible(false)
    const backdrop = this.add.rectangle(0, 0, 430, 760, 0x211f1a, 0.18).setOrigin(0, 0).setInteractive()
    const panel = this.add.rectangle(25, 150, 380, 550, 0xf3eedf).setOrigin(0, 0).setStrokeStyle(1.5, MainScene.BUTTON_STROKE_COLOR)
    const title = this.add.text(50, 192, "HOW TO PLAY", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "13px", fontStyle: "bold", letterSpacing: 1, resolution: RENDER_SCALE })
    const instructions = this.add.text(50, 230, "WERDOL begins where Wordle ends...\n\nA Wordle game has been played and completed.\n\nHowever!..\n\nThe letters in the first four rows have been mixed up, but the colors stayed in place.\n\nTap two letters to swap. Tiles become square when they receive the right letter. Rebuild the four rows in as few moves as possible.\n\nGreen is correct, yellow is misplaced, and gray is absent.", { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "15px", lineSpacing: 5, wordWrap: { width: 330 }, resolution: RENDER_SCALE })
    const walkthroughButton = this.add.rectangle(50, 600, 330, 36, COLORS.primaryButton).setOrigin(0, 0).setStrokeStyle(1.5, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    const walkthroughLabel = this.add.text(215, 618, "SEE HOW IT WORKS", { color: COLORS.primaryButtonText, fontFamily: "Arial, sans-serif", fontSize: "11px", fontStyle: "bold", letterSpacing: 0.6, resolution: RENDER_SCALE }).setOrigin(0.5)
    walkthroughButton.on("pointerover", () => walkthroughButton.setFillStyle(COLORS.primaryButtonHover))
    walkthroughButton.on("pointerout", () => walkthroughButton.setFillStyle(COLORS.primaryButton))
    walkthroughButton.on("pointerdown", () => {
      this.howToPlayOverlay.setVisible(false)
      this.startWalkthrough()
    })
    this.howToPlayOverlay.add([backdrop, panel, title, instructions, walkthroughButton, walkthroughLabel])
    infoButton.on("pointerdown", () => this.howToPlayOverlay.setVisible(!this.howToPlayOverlay.visible))
    backdrop.on("pointerdown", () => this.howToPlayOverlay.setVisible(false))

    const sayHello = this.add.text(215, 720, "say hello", { color: COLORS.muted, fontFamily: "Georgia, Times New Roman, serif", fontSize: "12px", resolution: RENDER_SCALE }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    let feedbackTimer: Phaser.Time.TimerEvent | undefined
    sayHello.on("pointerover", () => sayHello.setColor(COLORS.ink))
    sayHello.on("pointerout", () => sayHello.setColor(COLORS.muted))
    sayHello.on("pointerdown", async () => {
      try {
        await navigator.clipboard.writeText("mohnjahoney@gmail.com")
        sayHello.setText("email copied").setColor(COLORS.ink)
        feedbackTimer?.remove()
        feedbackTimer = this.time.delayedCall(1600, () => sayHello.setText("say hello").setColor(COLORS.muted))
      } catch {
        sayHello.setText("copy unavailable").setColor(COLORS.muted)
        feedbackTimer?.remove()
        feedbackTimer = this.time.delayedCall(1600, () => sayHello.setText("say hello"))
      }
    })
    this.queueUiEntrance([sayHello])
  }

  private buildMoveInfo(): void {
    const boxLeft = 55
    const boxTop = 535
    const boxWidth = 320
    const boxHeight = 78
    const barLeft = 82
    const barWidth = 266
    const barY = boxTop + 47
    const totalBricks = this.minimumMoves + EXTRA_MOVES
    const brickGap = 3
    const brickWidth = (barWidth - brickGap * (totalBricks - 1)) / totalBricks
    const goalPosition = barLeft + this.minimumMoves * (brickWidth + brickGap) - (this.minimumMoves > 0 ? brickGap / 2 : 0)
    const objects: Phaser.GameObjects.GameObject[] = []
    objects.push(this.add.rectangle(boxLeft, boxTop, boxWidth, boxHeight, 0xfffdf7).setOrigin(0, 0).setStrokeStyle(1, 0xc6bdae))
    objects.push(this.add.text(barLeft, boxTop + 18, "MOVES", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "10px", fontStyle: "bold", letterSpacing: 1, resolution: RENDER_SCALE }).setOrigin(0, 0.5))
    objects.push(this.add.text(goalPosition, boxTop + 18, "GOAL", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "10px", fontStyle: "bold", letterSpacing: 1, resolution: RENDER_SCALE }).setOrigin(0.5, 0.5))
    this.moveBarBricks = Array.from({ length: totalBricks }, (_value, index) => {
      const x = barLeft + index * (brickWidth + brickGap)
      const color = index < this.minimumMoves ? 0xb7c0ae : 0xd8b7b0
      const brick = this.add.rectangle(x, barY, brickWidth, 10, color).setOrigin(0, 0.5)
      objects.push(brick)
      return brick
    })
    this.moveBarMinimumMarker = this.add.rectangle(goalPosition, barY, 2, 22, MainScene.BUTTON_STROKE_COLOR).setOrigin(0.5)
    objects.push(this.moveBarMinimumMarker)
    if (this.challengingTestPattern) {
      const benchmark = this.challengeBenchmark
      objects.push(this.add.text(215, boxTop + 62, `LEGACY GREEDY ${benchmark?.greedyMoves ?? "—"} MOVES · ${benchmark?.greedyMilliseconds.toFixed(2) ?? "—"} MS`, {
        color: COLORS.muted,
        fontFamily: "Arial, sans-serif",
        fontSize: "9px",
        fontStyle: "bold",
        letterSpacing: 0.4,
        resolution: RENDER_SCALE,
      }).setOrigin(0.5, 0.5))
      objects.push(this.add.text(215, boxTop + 73, `OPTIMAL ${benchmark?.optimalMoves ?? this.minimumMoves} MOVES · ${benchmark?.optimalMilliseconds.toFixed(2) ?? "—"} MS`, {
        color: COLORS.muted,
        fontFamily: "Arial, sans-serif",
        fontSize: "9px",
        fontStyle: "bold",
        letterSpacing: 0.4,
        resolution: RENDER_SCALE,
      }).setOrigin(0.5, 0.5))
    }
    this.updateMoveInfo()
    this.queueUiEntrance(objects)
  }

  private animateUiEntrance(objects: Phaser.GameObjects.GameObject[]): void {
    objects.forEach((object) => {
      const displayObject = object as Phaser.GameObjects.GameObject & { y: number; alpha: number }
      const targetY = displayObject.y - UI_ENTRANCE_OFFSET_Y
      this.tweens.add({
        targets: displayObject,
        y: targetY,
        alpha: 1,
        duration: UI_ENTRANCE_DURATION,
        ease: UI_ENTRANCE_EASE,
      })
    })
  }

  private queueUiEntrance(objects: Phaser.GameObjects.GameObject[]): void {
    objects.forEach((object) => {
      const displayObject = object as Phaser.GameObjects.GameObject & { y: number; alpha: number }
      displayObject.y += UI_ENTRANCE_OFFSET_Y
      displayObject.alpha = 0
    })
    if (this.openingAnimationActive) {
      this.deferredUiObjects.push(...objects)
    } else {
      this.animateUiEntrance(objects)
    }
  }

  private finishOpeningAnimation(): void {
    const wasSkipped = this.openingSkipInProgress
    this.input.off("pointerdown", this.skipOpeningAnimation, this)
    this.openingAnimationActive = false
    this.openingAnimation = undefined
    this.openingSkipInProgress = false
    const objects = this.deferredUiObjects
    this.deferredUiObjects = []
    if (this.openingExplanationPending && !wasSkipped) {
      this.openingExplanationPending = false
      this.playExplanatoryBoardAnimation(() => this.animateUiEntrance(objects))
      return
    }
    if (wasSkipped) {
      this.openingExplanationPending = false
      this.commitOpeningShuffle()
      this.revealBoardImmediately()
      this.animateUiEntrance(objects)
      return
    }
    const warmupDuration = this.animateBoardWarmup()
    this.time.delayedCall(warmupDuration, () => this.animateUiEntrance(objects))
  }

  private playExplanatoryBoardAnimation(onComplete: () => void): void {
    this.tileBackgrounds.forEach((background, slotIndex) => {
      const center = this.slotCenter(slotIndex)
      background.setPosition(center.x, center.y).setAlpha(1).setScale(1)
      const letterId = this.initialOccupancy[slotIndex]
      this.openingLetterVisuals.get(letterId ?? -1)?.setPosition(center.x, center.y).setAlpha(0).setScale(1).setMode("asterisk")
    })

    const start = explanationTime(520)
    const rowCount = this.puzzle.rows.length + 1
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      for (let column = 0; column < 5; column += 1) {
        const slotIndex = rowIndex * 5 + column
        this.time.delayedCall(start + column * EXPLANATION_ENTRY_INTERVAL, () => {
          const letterId = this.initialOccupancy[slotIndex]
          const letterVisual = this.openingLetterVisuals.get(letterId ?? -1)
          const background = this.tileBackgrounds[slotIndex]
          if (!letterVisual || !background) return
          letterVisual.setAlpha(1).setMode("asterisk")
          this.tweens.add({
            targets: [background, letterVisual.container],
            scale: 1.08,
            duration: explanationTime(90),
            yoyo: true,
            ease: "Sine.Out",
          })
        })
      }

      const submitAt = start + 5 * EXPLANATION_ENTRY_INTERVAL + explanationTime(180)
      for (let column = 0; column < 5; column += 1) {
        this.time.delayedCall(submitAt + explanationTime(170) + column * explanationTime(88), () => {
          this.flipExplanatoryTile(rowIndex * 5 + column)
        })
      }
    }

    const targetRevealAt = start + (rowCount - 1) * 0 + 5 * EXPLANATION_ENTRY_INTERVAL
      + explanationTime(170) + 5 * explanationTime(88) + explanationTime(300)
      this.time.delayedCall(targetRevealAt, () => {
      for (let column = 0; column < 5; column += 1) {
        const slotIndex = this.puzzle.rows.length * 5 + column
        const letterId = this.initialOccupancy[slotIndex]
        this.openingLetterVisuals.get(letterId ?? -1)?.setAlpha(1).setMode("character")
      }
    })
    this.time.delayedCall(targetRevealAt + explanationTime(900), () => this.shuffleExplanatoryLetters(onComplete))
  }

  private flipExplanatoryTile(slotIndex: number): void {
    const background = this.tileBackgrounds[slotIndex]
    const letterId = this.initialOccupancy[slotIndex]
    const letterVisual = this.openingLetterVisuals.get(letterId ?? -1)
    if (!background || !letterVisual) return
    this.tweens.add({
      targets: [background, letterVisual.container],
      scaleY: 0.04,
      duration: EXPLANATION_FLIP_DURATION,
      ease: "Sine.In",
      onComplete: () => {
        this.gameBoard?.updateEvaluationColor(slotIndex)
        const tileState = this.isLetterCorrectAtOccupancy(this.initialOccupancy, slotIndex) ? "matched" : "unmatched"
        this.gameBoard?.renderTileState(slotIndex, tileState)
        this.tweens.add({
          targets: [background, letterVisual.container],
          scaleY: 1,
          duration: EXPLANATION_FLIP_DURATION,
          ease: "Back.Out",
        })
      },
    })
  }

  private shuffleExplanatoryLetters(onComplete: () => void): void {
    const movableLetterIds = this.initialOccupancy.filter((_letterId, slotIndex) => (
      !this.isFrozenSlot(slotIndex)
    ))
    movableLetterIds.forEach((letterId, index) => {
      const sourceSlot = this.initialOccupancy.findIndex((id) => id === letterId)
      const destinationSlot = this.openingShuffleOccupancy?.findIndex((id) => id === letterId) ?? -1
      const letterVisual = this.openingLetterVisuals.get(letterId)
      if (sourceSlot < 0 || destinationSlot < 0 || !letterVisual) return
      const destination = this.slotCenter(destinationSlot)
      this.tweens.add({
        targets: letterVisual.container,
        x: destination.x,
        y: destination.y,
        duration: EXPLANATION_SHUFFLE_DURATION,
        delay: (index % 5) * explanationTime(18),
        ease: "Cubic.InOut",
      })
      letterVisual.animateToCharacter(this, EXPLANATION_LETTER_REVEAL_DELAY, EXPLANATION_LETTER_REVEAL_DURATION)
    })
    this.time.delayedCall(EXPLANATION_SHUFFLE_DURATION + EXPLANATION_SHUFFLE_STAGGER + EXPLANATION_POST_SHUFFLE_PAUSE, () => {
      const shuffledOccupancy = [...(this.openingShuffleOccupancy ?? this.occupancy)]
      this.commitOpeningShuffle(shuffledOccupancy)
      onComplete()
    })
  }

  private commitOpeningShuffle(nextOccupancy = this.openingShuffleOccupancy ?? this.occupancy): void {
    this.releaseOpeningLetterVisuals(nextOccupancy)
    this.setOccupancy(nextOccupancy)
    const shuffledTiles = tilesFromOccupancy(this.occupancy, this.letters)
    this.playerPath = [{ tiles: shuffledTiles, deltaCorrect: 0, correctCount: countCorrectTiles(this.puzzle, shuffledTiles) }]
    this.movesTaken = 0
    this.openingShuffleOccupancy = undefined
  }

  private releaseOpeningLetterVisuals(occupancy: readonly number[]): void {
    const textByLetterId = new Map<number, Phaser.GameObjects.Text>()
    this.openingLetterVisuals.forEach((visual, letterId) => textByLetterId.set(letterId, visual.releaseCharacter()))
    this.tileSlots.forEach((visual, slotIndex) => {
      const text = textByLetterId.get(occupancy[slotIndex] ?? -1)
      if (text) visual.text = text
    })
    this.openingLetterVisuals.clear()
  }

  private setOccupancy(nextOccupancy: readonly number[], syncLetters = false): void {
    this.gameBoard?.setOccupancy(nextOccupancy, syncLetters)
    if (syncLetters) {
      this.tileSlots.forEach((visual, slotIndex) => {
        const letterId = this.occupancy[slotIndex]
        visual.text.setText(this.letters[letterId ?? visual.tile.id]?.character ?? visual.text.text)
      })
    }
    this.gameBoard?.updateTileMatchRendering()
  }

  private isFrozenSlot(slotIndex: number): boolean {
    return Math.floor(slotIndex / 5) === this.puzzle.rows.length
  }

  private prepareBoardForOpening(): void {
    if (!this.openingAnimationActive && !this.boardWarmupPending) return
    this.tileBackgrounds.forEach((background, slotIndex) => {
      const center = this.slotCenter(slotIndex)
      if (this.openingExplanationPending) {
        background.setFillStyle(TILE_COLORS.empty).setStrokeStyle(BOARD_LAYOUT.tileBorderWidth, TILE_COLORS.empty)
      }
      background.setPosition(center.x, center.y).setAlpha(0)
      if (this.openingExplanationPending) {
        const letterId = this.initialOccupancy[slotIndex]
        this.openingLetterVisuals.get(letterId ?? -1)?.setPosition(center.x, center.y).setAlpha(0).setMode("asterisk")
      } else {
        this.tileSlots[slotIndex]?.text.setPosition(center.x, center.y).setAlpha(0)
      }
    })
  }

  private animateBoardWarmup(): number {
    this.tileBackgrounds.forEach((background, slotIndex) => {
      const center = this.slotCenter(slotIndex)
      const text = this.tileSlots[slotIndex]?.text
      background.setPosition(center.x, center.y + BOARD_WARMUP_DISTANCE).setAlpha(0)
      text?.setPosition(center.x, center.y + BOARD_WARMUP_DISTANCE).setAlpha(0)
      this.tweens.add({
        targets: background,
        y: center.y,
        alpha: 1,
        duration: BOARD_WARMUP_DURATION,
        delay: slotIndex * BOARD_WARMUP_STAGGER,
        ease: "Cubic.Out",
      })
      if (text) {
        this.tweens.add({
          targets: text,
          y: center.y,
          alpha: 1,
          duration: BOARD_WARMUP_DURATION,
          delay: slotIndex * BOARD_WARMUP_STAGGER + 60,
          ease: "Sine.Out",
        })
      }
    })
    return this.tileBackgrounds.length * BOARD_WARMUP_STAGGER + BOARD_WARMUP_DURATION + BOARD_WARMUP_END_PAUSE
  }

  private revealBoardImmediately(): void {
    this.tileBackgrounds.forEach((background, slotIndex) => {
      const center = this.slotCenter(slotIndex)
      background.setPosition(center.x, center.y).setAlpha(1)
      const text = this.tileSlots[slotIndex]?.text
      const letterId = this.occupancy[slotIndex]
      text?.setPosition(center.x, center.y).setText(this.letters[letterId ?? 0]?.character ?? "").setAlpha(1)
    })
  }

  private skipOpeningAnimation(): void {
    if (!this.openingAnimationActive || this.openingSkipInProgress || this.openingAnimation === undefined) return
    this.openingSkipInProgress = true
    this.openingAnimation.skip()
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.finishOpeningAnimation()
      this.cameras.main.fadeIn(200, 0, 0, 0)
    })
    this.cameras.main.fadeOut(200, 0, 0, 0)
  }

  private updateMoveInfo(): void {
    if (!this.moveBarMinimumMarker) return
    this.moveBarBricks.forEach((brick, index) => {
      const isGoalBrick = index < this.minimumMoves
      const isFilled = index < this.movesTaken
      brick.setFillStyle(isFilled
        ? (isGoalBrick ? MainScene.ACTIVE_BUTTON_COLOR : 0xb06a5f)
        : (isGoalBrick ? 0xb7c0ae : 0xd8b7b0))
    })
  }

  private buildInteractionTools(): void {
    const normalX = 20
    const revealX = 101
    const y = 135
    const modeLabel = this.add.text(20, 105, "Interaction mode", { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "15px", resolution: RENDER_SCALE })
    this.normalModeButton = this.add.rectangle(normalX, y, 72, 38, MainScene.ACTIVE_BUTTON_COLOR).setOrigin(0, 0).setStrokeStyle(1, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    this.revealModeButton = this.add.rectangle(revealX, y, 72, 38, MainScene.INACTIVE_BUTTON_COLOR).setOrigin(0, 0).setStrokeStyle(1, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    this.normalModeLabel = createIconLabel(this, normalX + 36, y + 19, "swap")
    this.revealModeLabel = createIconLabel(this, revealX + 36, y + 19, "reveal")
    this.normalModeButton.on("pointerdown", () => this.toggleInteractionMode())
    this.revealModeButton.on("pointerdown", () => this.toggleInteractionMode())
    this.devTabContainers.solve.add([modeLabel, this.normalModeButton, this.revealModeButton, this.normalModeLabel, this.revealModeLabel])
    this.setInteractionMode(this.interactionMode, false)
  }

  private buildDeveloperMoveControls(): void {
    const y = 135
    const nextButton = this.add.rectangle(220, y, 45, 34, MainScene.INACTIVE_BUTTON_COLOR).setOrigin(0, 0).setStrokeStyle(1, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    const nextIcon = this.add.image(242, y + 17, "werdol-arrow-right").setDisplaySize(25, 25).setDepth(1)
    nextButton.on("pointerdown", () => this.performNextAlgorithmicSwap())
    const resetButton = this.add.rectangle(270, y, 45, 34, MainScene.INACTIVE_BUTTON_COLOR).setOrigin(0, 0).setStrokeStyle(1, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    const resetLabel = createIconLabel(this, 292, y + 17, "reset")
    resetButton.on("pointerdown", () => this.resetPuzzle())
    const reviewButton = this.add.rectangle(220, y + 45, 95, 28, MainScene.INACTIVE_BUTTON_COLOR).setOrigin(0, 0).setStrokeStyle(1, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    const reviewLabel = this.add.text(267, y + 59, "REVIEW", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "10px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(0.5).setDepth(1)
    reviewButton.on("pointerdown", () => this.enterReviewMode())
    this.devTabContainers.solve.add([nextButton, nextIcon, resetButton, resetLabel, reviewButton, reviewLabel])
  }

  private buildTileRendererPanel(): void {
    const modes: Array<{ id: TileRendererMode; label: string }> = [
      { id: "shape", label: "SHAPE" },
      { id: "stamp", label: "STAMP" },
      { id: "pulse", label: "PULSE" },
      { id: "tilt", label: "TILT" },
      { id: "halo", label: "HALO" },
    ]
    this.tileRendererOverlay = this.add.rectangle(0, 0, 430, 760, 0x000000, 0).setOrigin(0, 0).setDepth(59).setInteractive()
    this.tileRendererOverlay.on("pointerdown", () => this.setTileRendererPanelVisible(false))
    this.tileRendererPanel = this.add.container(25, 250).setDepth(60)
    const panel = this.add.rectangle(0, 0, 380, 190, 0xfaf6e9).setOrigin(0, 0).setStrokeStyle(2, MainScene.BUTTON_STROKE_COLOR).setInteractive()
    const heading = this.add.text(20, 20, "TILE RENDERER", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "14px", fontStyle: "bold", letterSpacing: 1, resolution: RENDER_SCALE })
    const close = this.add.text(355, 20, "CLOSE", { color: COLORS.muted, fontFamily: "Arial, sans-serif", fontSize: "10px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(1, 0).setInteractive({ useHandCursor: true })
    close.on("pointerdown", () => this.setTileRendererPanelVisible(false))
    const buttons = modes.map((mode, index) => {
      const column = index % 4
      const row = Math.floor(index / 4)
      const button = this.add.rectangle(20 + column * 58, 70 + row * 36, 54, 30, MainScene.INACTIVE_BUTTON_COLOR)
        .setOrigin(0, 0)
        .setStrokeStyle(1, MainScene.BUTTON_STROKE_COLOR)
        .setInteractive({ useHandCursor: true })
      const label = this.add.text(button.x + 27, button.y + 15, mode.label, { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "8px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(0.5)
      button.on("pointerdown", () => this.setTileRendererMode(mode.id))
      this.tileRendererPanel.add([button, label])
      return { id: mode.id, button, label }
    })
    this.feedbackModeButtons = buttons
    this.tileRendererPanel.add([panel, heading, close])
    this.tileRendererPanel.sendToBack(panel)
    this.tileRendererPanelBackground = panel
    this.tileRendererCloseButton = close
    this.updateFeedbackModeButtons(buttons)
    this.setTileRendererPanelVisible(false)
  }

  private updateFeedbackModeButtons(buttons: Array<{ id: TileRendererMode; button: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }>): void {
    buttons.forEach(({ id, button, label }) => {
      const selected = id === this.tileRendererMode
      button.setFillStyle(selected ? MainScene.ACTIVE_BUTTON_COLOR : MainScene.INACTIVE_BUTTON_COLOR)
      label.setColor(selected ? COLORS.primaryButtonText : COLORS.ink)
    })
  }

  private setTileRendererMode(mode: TileRendererMode): void {
    if (mode === this.tileRendererMode) return
    this.tileBackgrounds.forEach((tile) => this.tileRenderer.resetTileEffects(tile))
    this.tileRenderer.destroy()
    this.tileRendererMode = mode
    devSessionState.tileRendererMode = mode
    this.tileRenderer = createTileRendererForMode(mode)
    this.gameBoard?.updateTileMatchRendering()
    this.updateFeedbackModeButtons(this.feedbackModeButtons)
  }

  private setTileRendererPanelVisible(visible: boolean): void {
    this.tileRendererPanel.setVisible(visible)
    this.tileRendererOverlay.setVisible(visible)
    if (visible) {
      this.tileRendererOverlay.setInteractive()
      this.tileRendererPanelBackground.setInteractive()
      this.tileRendererCloseButton.setInteractive({ useHandCursor: true })
      this.feedbackModeButtons.forEach(({ button }) => button.setInteractive({ useHandCursor: true }))
      return
    }
    this.tileRendererOverlay.disableInteractive()
    this.tileRendererPanelBackground.disableInteractive()
    this.tileRendererCloseButton.disableInteractive()
    this.feedbackModeButtons.forEach(({ button }) => button.disableInteractive())
  }

  private performNextAlgorithmicSwap(): void {
    if (this.swapAnimating) return
    if (this.puzzleCreationFailed) {
      return
    }
    const next = findNextSwap(this.puzzle, tilesFromOccupancy(this.occupancy, this.letters))
    if (next === undefined) {
      return
    }
    this.gameBoard?.swapSlots(next.firstSlot, next.secondSlot)
  }

  private buildWordListModeTools(): void {
    const y = 375
    this.easyModeButton = this.add.rectangle(31, y, 72, 38, this.wordListMode === "easy" ? MainScene.ACTIVE_BUTTON_COLOR : MainScene.INACTIVE_BUTTON_COLOR).setOrigin(0, 0).setStrokeStyle(1, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    this.hardModeButton = this.add.rectangle(112, y, 72, 38, this.wordListMode === "hard" ? MainScene.ACTIVE_BUTTON_COLOR : MainScene.INACTIVE_BUTTON_COLOR).setOrigin(0, 0).setStrokeStyle(1, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    const easyX = this.wordListMode === "easy" ? 67 : 148
    const hardX = this.wordListMode === "easy" ? 148 : 67
    this.easyModeLabel = createIconLabel(this, easyX, y + 19, "easy")
    this.hardModeLabel = createIconLabel(this, hardX, y + 19, "hard")
    this.devTabContainers.setup.add([this.easyModeButton, this.hardModeButton, this.easyModeLabel, this.hardModeLabel])
    this.easyModeButton.on("pointerdown", () => this.setWordListMode("easy"))
    this.hardModeButton.on("pointerdown", () => this.setWordListMode("hard"))
  }

  private buildSeedTools(): void {
    const label = this.add.text(20, 420, "Seed", { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "15px", resolution: RENDER_SCALE })
    this.seedInput = this.add.dom(185, 420).createFromHTML(`<div style="display:flex; align-items:center; gap:8px;"><input type="text" value="${String(this.seed).padStart(6, "0")}" maxlength="6" inputmode="numeric" aria-label="Seed" style="width: 82px; height: 28px; box-sizing: border-box; text-align: center; font: bold 14px Arial; color: #211f1a; background: #f3eedf; border: 1px solid #756d5e;"><button type="button" aria-label="Apply seed" style="width: 78px; height: 28px; box-sizing: border-box; font: bold 9px Arial; color: #211f1a; background: #c6bdae; border: 1px solid #756d5e;">APPLY</button></div>`)
    this.setSeedInputVisible(false)
    this.seedInput.node.querySelector("button")?.addEventListener("click", () => this.applySeed())
    this.seedInput.node.querySelector("input")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.applySeed()
    })
    this.devTabContainers.setup.add([label, this.seedInput])
  }

  private applySeed(): void {
    const input = this.seedInput.node.querySelector("input") as HTMLInputElement
    if (!/^\d{6}$/.test(input.value)) {
      input.value = String(this.seed).padStart(6, "0")
      return
    }
    this.restartWithSetup({ ...this.currentPuzzleSetup(), seed: Number(input.value) })
  }

  private setSeedInputVisible(visible: boolean): void {
    this.seedInput.setVisible(visible)
    const node = this.seedInput.node as HTMLElement
    node.style.display = visible ? "" : "none"
  }

  private setTitleArcRadiusInputVisible(visible: boolean): void {
    if (!this.titleArcRadiusInput) return
    this.titleArcRadiusInput.setVisible(visible)
    const node = this.titleArcRadiusInput.node as HTMLElement
    node.style.display = visible ? "" : "none"
  }

  private buildTitleArcRadiusTools(): void {
    const label = this.add.text(20, 475, "Swap arc radius", { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "15px", resolution: RENDER_SCALE })
    this.titleArcRadiusInput = this.add.dom(185, 500).createFromHTML(`<div style="display:flex; align-items:center; gap:8px;"><input type="range" min="0.5" max="2" step="0.5" value="${devSessionState.titleArcRadiusMultiplier}" aria-label="Swap arc radius" style="width:150px;"><output style="width:36px; font: bold 14px Arial; color:#211f1a; text-align:right;">${devSessionState.titleArcRadiusMultiplier}</output></div>`)
    const input = this.titleArcRadiusInput.node.querySelector("input") as HTMLInputElement
    const output = this.titleArcRadiusInput.node.querySelector("output") as HTMLOutputElement
    input.addEventListener("input", () => {
      devSessionState.titleArcRadiusMultiplier = Number(input.value)
      output.value = input.value
    })
    this.titleArcRadiusInput.setVisible(false)
    this.devTabContainers.setup.add([label, this.titleArcRadiusInput])
  }

  private setWordListMode(mode: WordListMode): void {
    if (mode === this.wordListMode) return
    if (this.modeLabelAnimating) return
    this.wordListMode = mode
    this.modeLabelAnimating = true
    this.animateLabelExchange(this.easyModeLabel, this.hardModeLabel, () => {
      this.restartWithSetup({
        requireTargetLetterInEachRow: this.requireTargetLetterInEachRow,
        requireGreenTileInEachRow: this.requireGreenTileInEachRow,
        minGreenTiles: this.minGreenTiles,
        minYellowTiles: this.minYellowTiles,
        wordListMode: this.wordListMode,
        challengingTestPattern: this.challengingTestPattern,
        seed: this.seed,
      })
    })
  }

  private setInteractionMode(mode: InteractionMode, animate = true): void {
    if (mode === this.interactionMode && animate) return
    const shouldAnimate = animate && mode !== this.interactionMode
    this.interactionMode = mode
    devSessionState.interactionMode = mode
    if (shouldAnimate && !this.modeLabelAnimating) {
      this.modeLabelAnimating = true
      this.animateLabelExchange(this.normalModeLabel, this.revealModeLabel)
    }
  }

  private toggleInteractionMode(): void {
    this.setInteractionMode(this.interactionMode === "swap" ? "reveal" : "swap")
  }

  private animateLabelExchange(
    first: Phaser.GameObjects.Container,
    second: Phaser.GameObjects.Container,
    onComplete?: () => void,
  ): void {
    const firstPosition = { x: first.x, y: first.y }
    const secondPosition = { x: second.x, y: second.y }
    const distanceX = secondPosition.x - firstPosition.x
    const distanceY = secondPosition.y - firstPosition.y
    const distance = Math.hypot(distanceX, distanceY)
    const perpendicular = { x: -distanceY / distance, y: distanceX / distance }
    const midpoint = { x: (firstPosition.x + secondPosition.x) / 2, y: (firstPosition.y + secondPosition.y) / 2 }
    const arcHeight = Math.min(28, Math.max(14, distance * 0.2))
    const firstControl = { x: midpoint.x + perpendicular.x * arcHeight * this.swapDirection, y: midpoint.y + perpendicular.y * arcHeight * this.swapDirection }
    const secondControl = { x: midpoint.x - perpendicular.x * arcHeight * this.swapDirection, y: midpoint.y - perpendicular.y * arcHeight * this.swapDirection }
    this.swapDirection *= -1
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: SWAP_ANIMATION_DURATION,
      ease: "Sine.easeInOut",
      onUpdate: (tween) => {
        const progress = tween.getValue()
        if (progress === null) return
        const firstPoint = quadraticPoint(firstPosition, firstControl, secondPosition, progress)
        const secondPoint = quadraticPoint(secondPosition, secondControl, firstPosition, progress)
        first.setPosition(firstPoint.x, firstPoint.y)
        second.setPosition(secondPoint.x, secondPoint.y)
      },
      onComplete: () => {
        first.setPosition(secondPosition.x, secondPosition.y)
        second.setPosition(firstPosition.x, firstPosition.y)
        this.modeLabelAnimating = false
        onComplete?.()
      },
    })
  }

  private createDevTabs(): void {
    this.devTabContainers = {
      setup: this.add.container(0, 0),
      solve: this.add.container(0, 0),
      review: this.add.container(0, 0),
    }
    this.devTabButtons = {} as Record<DevTab, Phaser.GameObjects.Rectangle>
    this.devTabLabels = {} as Record<DevTab, Phaser.GameObjects.Text>
    const tabs: Array<{ id: DevTab; label: string; x: number }> = [
      { id: "setup", label: "SETUP", x: 65 },
      { id: "solve", label: "SOLVE", x: 190 },
      { id: "review", label: "REVIEW", x: 315 },
    ]
    for (const tab of tabs) {
      const button = this.add.rectangle(tab.x, 54, 110, 28, MainScene.INACTIVE_BUTTON_COLOR)
        .setOrigin(0.5)
        .setStrokeStyle(1, MainScene.BUTTON_STROKE_COLOR)
        .setInteractive({ useHandCursor: true })
      const label = this.add.text(tab.x, 54, tab.label, {
        color: COLORS.ink,
        fontFamily: "Arial, sans-serif",
        fontSize: "10px",
        fontStyle: "bold",
        letterSpacing: 0.7,
        resolution: RENDER_SCALE,
      }).setOrigin(0.5)
      button.on("pointerdown", () => this.setDevTab(tab.id))
      this.devTabButtons[tab.id] = button
      this.devTabLabels[tab.id] = label
      this.devPanel.add([button, label, this.devTabContainers[tab.id]])
    }
  }

  private setDevTab(tab: DevTab): void {
    devSessionState.activeTab = tab
    for (const id of ["setup", "solve", "review"] as const) {
      const selected = id === tab
      this.devTabContainers[id]?.setVisible(selected)
      this.devTabButtons[id]?.setFillStyle(selected ? MainScene.ACTIVE_BUTTON_COLOR : MainScene.INACTIVE_BUTTON_COLOR)
      this.devTabLabels[id]?.setColor(selected ? COLORS.primaryButtonText : COLORS.ink)
    }
    this.setSeedInputVisible(this.devPanel?.visible === true && tab === "setup")
    this.setTitleArcRadiusInputVisible(this.devPanel?.visible === true && tab === "setup")
  }

  private buildDevPanel(): void {
    this.devOverlay = this.add.rectangle(0, 0, 430, 760, 0x000000, 0).setOrigin(0, 0).setDepth(49).setInteractive()
    this.devOverlay.on("pointerdown", () => this.setDevPanelVisible(false))
    this.devPanel = this.add.container(25, 95).setDepth(50)
    const panel = this.add.rectangle(0, 0, 380, 585, 0xfaf6e9).setOrigin(0, 0).setStrokeStyle(2, 0x756d5e).setInteractive()
    this.devPanel.add(panel)
    this.createDevTabs()
    this.buildInteractionTools()
    this.buildDeveloperMoveControls()
    const heading = this.add.text(20, 18, "DEV", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "14px", fontStyle: "bold", letterSpacing: 1, resolution: RENDER_SCALE })
    const close = this.add.text(355, 18, "CLOSE", { color: COLORS.muted, fontFamily: "Arial, sans-serif", fontSize: "10px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(1, 0).setInteractive({ useHandCursor: true })
    close.on("pointerdown", () => this.setDevPanelVisible(false))
    const wordListLabel = this.add.text(20, 345, "Word list", { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "15px", resolution: RENDER_SCALE })
    this.buildWordListModeTools()
    this.buildSeedTools()
    this.buildTitleArcRadiusTools()
    const toggleLabel = this.add.text(20, 68, "Each row shares a letter with target", { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "15px", wordWrap: { width: 285 }, resolution: RENDER_SCALE })
    this.devToggle = this.add.rectangle(330, 73, 30, 18).setOrigin(0.5).setInteractive({ useHandCursor: true })
    this.devToggle.on("pointerdown", () => {
      this.requireTargetLetterInEachRow = !this.requireTargetLetterInEachRow
      this.updateDevToggle()
    })
    const greenLabel = this.add.text(20, 122, "Each row has at least one green tile", { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "15px", wordWrap: { width: 285 }, resolution: RENDER_SCALE })
    this.devGreenToggle = this.add.rectangle(330, 127, 30, 18).setOrigin(0.5).setInteractive({ useHandCursor: true })
    this.devGreenToggle.on("pointerdown", () => {
      this.requireGreenTileInEachRow = !this.requireGreenTileInEachRow
      this.updateDevToggle()
    })
    const greenCountLabel = this.add.text(20, 180, "Minimum total green tiles", { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "15px", resolution: RENDER_SCALE })
    const yellowCountLabel = this.add.text(20, 235, "Minimum total yellow tiles", { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "15px", resolution: RENDER_SCALE })
    this.devGreenCountText = this.add.text(310, 180, "", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "16px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(0.5)
    this.devYellowCountText = this.add.text(310, 235, "", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "16px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(0.5)
    const greenMinus = this.add.text(270, 180, "−", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "22px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(0.5).setPadding(10, 8).setInteractive({ useHandCursor: true })
    const greenPlus = this.add.text(350, 180, "+", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "22px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(0.5).setPadding(10, 8).setInteractive({ useHandCursor: true })
    const yellowMinus = this.add.text(270, 235, "−", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "22px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(0.5).setPadding(10, 8).setInteractive({ useHandCursor: true })
    const yellowPlus = this.add.text(350, 235, "+", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "22px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(0.5).setPadding(10, 8).setInteractive({ useHandCursor: true })
    this.devCountButtons = [greenMinus, greenPlus, yellowMinus, yellowPlus]
    greenMinus.on("pointerdown", () => this.adjustTileMinimum("green", -1))
    greenPlus.on("pointerdown", () => this.adjustTileMinimum("green", 1))
    yellowMinus.on("pointerdown", () => this.adjustTileMinimum("yellow", -1))
    yellowPlus.on("pointerdown", () => this.adjustTileMinimum("yellow", 1))
    const challengeLabel = this.add.text(20, 300, "Greedy test", { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "14px", resolution: RENDER_SCALE })
    this.devChallengeToggle = this.add.rectangle(330, 305, 30, 18).setOrigin(0.5).setInteractive({ useHandCursor: true })
    this.devChallengeToggle.on("pointerdown", () => {
      this.challengingTestPattern = !this.challengingTestPattern
      this.updateDevToggle()
    })
    const magnificationLabel = this.add.text(20, 105, "Timeline magnification", { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "15px", resolution: RENDER_SCALE })
    this.centerMagnificationButton = this.add.rectangle(65, 145, 112, 30, this.magnificationMode === "center" ? MainScene.ACTIVE_BUTTON_COLOR : MainScene.INACTIVE_BUTTON_COLOR).setOrigin(0.5).setStrokeStyle(1, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    this.continuousMagnificationButton = this.add.rectangle(190, 145, 112, 30, this.magnificationMode === "continuous" ? MainScene.ACTIVE_BUTTON_COLOR : MainScene.INACTIVE_BUTTON_COLOR).setOrigin(0.5).setStrokeStyle(1, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    this.cardMagnificationButton = this.add.rectangle(315, 145, 112, 30, this.magnificationMode === "cards" ? MainScene.ACTIVE_BUTTON_COLOR : MainScene.INACTIVE_BUTTON_COLOR).setOrigin(0.5).setStrokeStyle(1, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    const centerMagnificationText = this.add.text(65, 145, "A · CENTER", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "9px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(0.5)
    const continuousMagnificationText = this.add.text(190, 145, "B · CONTINUOUS", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "9px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(0.5)
    const cardMagnificationText = this.add.text(315, 145, "C · CARDS", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "9px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(0.5)
    this.centerMagnificationButton.on("pointerdown", () => this.setMagnificationMode("center"))
    this.continuousMagnificationButton.on("pointerdown", () => this.setMagnificationMode("continuous"))
    this.cardMagnificationButton.on("pointerdown", () => this.setMagnificationMode("cards"))
    const note = this.add.text(20, 525, "Changes take effect when the panel closes.", { color: COLORS.muted, fontFamily: "Georgia, Times New Roman, serif", fontSize: "14px", wordWrap: { width: 330 }, resolution: RENDER_SCALE })
    this.replayOpeningButton = this.add.text(20, 220, "REPLAY OPENING", { color: COLORS.ink, backgroundColor: "#c6bdae", fontFamily: "Arial, sans-serif", fontSize: "10px", fontStyle: "bold", resolution: RENDER_SCALE }).setPadding(10, 7).setInteractive({ useHandCursor: true })
    this.replayOpeningButton.on("pointerdown", () => this.replayOpening())
    this.devPanel.add([heading, close])
    this.devTabContainers.setup.add([wordListLabel, toggleLabel, this.devToggle, greenLabel, this.devGreenToggle, greenCountLabel, yellowCountLabel, this.devGreenCountText, this.devYellowCountText, greenMinus, greenPlus, yellowMinus, yellowPlus, challengeLabel, this.devChallengeToggle, note])
    this.devTabContainers.review.add([magnificationLabel, this.centerMagnificationButton, this.continuousMagnificationButton, this.cardMagnificationButton, centerMagnificationText, continuousMagnificationText, cardMagnificationText, this.replayOpeningButton])
    this.devPanelBackground = panel
    this.devCloseButton = close
    this.updateDevToggle()
    this.updateTileMinimumText()
    this.updateMagnificationButtons()
    this.setDevTab(devSessionState.activeTab)
    this.setDevPanelVisible(false)
    this.devPanelReady = true
  }

  private adjustTileMinimum(color: "green" | "yellow", amount: number): void {
    const current = color === "green" ? this.minGreenTiles : this.minYellowTiles
    const next = clampTileMinimum(current + amount)
    if (color === "green") this.minGreenTiles = next
    else this.minYellowTiles = next
    this.updateTileMinimumText()
  }

  private updateTileMinimumText(): void {
    this.devGreenCountText?.setText(String(this.minGreenTiles))
    this.devYellowCountText?.setText(String(this.minYellowTiles))
  }

  private setDevPanelVisible(visible: boolean): void {
    if (!visible && this.devPanelReady && this.devPanel.visible && (this.puzzleCreationFailed || this.appliedChallengingTestPattern !== this.challengingTestPattern || !this.puzzleSatisfiesSetup(this.currentPuzzleSetup()))) {
      this.restartWithSetup(this.currentPuzzleSetup())
      return
    }
    this.devPanel.setVisible(visible)
    this.setSeedInputVisible(visible && devSessionState.activeTab === "setup")
    this.setTitleArcRadiusInputVisible(visible && devSessionState.activeTab === "setup")
    if (visible) {
      this.devOverlay.setInteractive()
      this.devPanelBackground.setInteractive()
      this.devCloseButton.setInteractive({ useHandCursor: true })
      this.devToggle.setInteractive({ useHandCursor: true })
      this.devGreenToggle.setInteractive({ useHandCursor: true })
      this.devChallengeToggle.setInteractive({ useHandCursor: true })
      Object.values(this.devTabButtons).forEach((button) => button.setInteractive({ useHandCursor: true }))
      this.normalModeButton.setInteractive({ useHandCursor: true })
      this.revealModeButton.setInteractive({ useHandCursor: true })
      this.easyModeButton.setInteractive({ useHandCursor: true })
      this.hardModeButton.setInteractive({ useHandCursor: true })
      inputForSeed(this.seedInput).disabled = false
      buttonForSeed(this.seedInput).disabled = false
      this.devCountButtons.forEach((button) => button.setInteractive({ useHandCursor: true }))
      this.centerMagnificationButton.setInteractive({ useHandCursor: true })
      this.continuousMagnificationButton.setInteractive({ useHandCursor: true })
      this.cardMagnificationButton.setInteractive({ useHandCursor: true })
      this.replayOpeningButton.setInteractive({ useHandCursor: true })
    } else {
      this.devOverlay.disableInteractive()
      this.devPanelBackground.disableInteractive()
      this.devCloseButton.disableInteractive()
      this.devToggle.disableInteractive()
      this.devGreenToggle.disableInteractive()
      this.devChallengeToggle.disableInteractive()
      Object.values(this.devTabButtons).forEach((button) => button.disableInteractive())
      this.normalModeButton.disableInteractive()
      this.revealModeButton.disableInteractive()
      this.easyModeButton.disableInteractive()
      this.hardModeButton.disableInteractive()
      inputForSeed(this.seedInput).disabled = true
      buttonForSeed(this.seedInput).disabled = true
      this.devCountButtons.forEach((button) => button.disableInteractive())
      this.centerMagnificationButton.disableInteractive()
      this.continuousMagnificationButton.disableInteractive()
      this.cardMagnificationButton.disableInteractive()
      this.replayOpeningButton.disableInteractive()
    }
  }

  private setMagnificationMode(mode: MagnificationMode): void {
    this.magnificationMode = mode
    devSessionState.magnificationMode = mode
    this.updateMagnificationButtons()
    if (this.reviewOverlay !== undefined) this.refreshReview()
  }

  private updateMagnificationButtons(): void {
    this.centerMagnificationButton?.setFillStyle(this.magnificationMode === "center" ? MainScene.ACTIVE_BUTTON_COLOR : MainScene.INACTIVE_BUTTON_COLOR)
    this.continuousMagnificationButton?.setFillStyle(this.magnificationMode === "continuous" ? MainScene.ACTIVE_BUTTON_COLOR : MainScene.INACTIVE_BUTTON_COLOR)
    this.cardMagnificationButton?.setFillStyle(this.magnificationMode === "cards" ? MainScene.ACTIVE_BUTTON_COLOR : MainScene.INACTIVE_BUTTON_COLOR)
  }

  private currentPuzzleSetup(): SceneData {
    return {
      requireTargetLetterInEachRow: this.requireTargetLetterInEachRow,
      requireGreenTileInEachRow: this.requireGreenTileInEachRow,
      minGreenTiles: this.minGreenTiles,
      minYellowTiles: this.minYellowTiles,
      wordListMode: this.wordListMode,
      challengingTestPattern: this.challengingTestPattern,
      seed: this.seed,
    }
  }

  private nextPuzzleSetup(): SceneData {
    return {
      ...this.currentPuzzleSetup(),
      seed: nextPuzzleSeed(
        this.seed,
        this.wordListMode === "easy" ? ANSWER_WORDS.length : ALLOWED_WORDS.length,
      ),
    }
  }

  private puzzleSatisfiesSetup(setup: PuzzleSetup): boolean {
    if (this.challengingTestPattern) return true
    return this.puzzle.rows.every((row) => {
      if (setup.requireTargetLetterInEachRow && !row.pattern.some((result) => result !== "absent")) return false
      if (setup.requireGreenTileInEachRow && !row.pattern.some((result) => result === "correct")) return false
      if (setup.wordListMode === "easy" && !ANSWER_WORDS.includes(row.intendedGuess)) return false
      return true
    }) && (() => {
      const counts = countBoardTiles(this.puzzle)
      return counts.green >= (setup.minGreenTiles ?? 0) && counts.yellow >= (setup.minYellowTiles ?? 0)
    })()
  }

  private updateDevToggle(): void {
    this.devToggle.setFillStyle(this.requireTargetLetterInEachRow ? 0x71845f : 0xc6bdae)
    this.devToggle.setStrokeStyle(2, this.requireTargetLetterInEachRow ? 0x4c7b43 : 0x756d5e)
    this.devGreenToggle.setFillStyle(this.requireGreenTileInEachRow ? 0x71845f : 0xc6bdae)
    this.devGreenToggle.setStrokeStyle(2, this.requireGreenTileInEachRow ? 0x4c7b43 : 0x756d5e)
    this.devChallengeToggle?.setFillStyle(this.challengingTestPattern ? 0x71845f : 0xc6bdae)
    this.devChallengeToggle?.setStrokeStyle(2, this.challengingTestPattern ? 0x4c7b43 : 0x756d5e)
  }

  private buildBoard(): void {
    const board = this.preparedBoard ?? createScrambledBoard(this.puzzle, this.letterRandom, this.challengingTestPattern ? CHALLENGE_INITIAL_LETTERS : undefined)
    this.preparedBoard = undefined
    this.letters = board.letters
    this.initialOccupancy = [...board.initialOccupancy]
    this.openingShuffleOccupancy = this.openingExplanationPending ? [...board.occupancy] : undefined
    const startingOccupancy = this.openingExplanationPending ? [...board.initialOccupancy] : [...board.occupancy]
    this.initialTileIds = board.tiles.map((tile) => tile.id)
    this.challengeBenchmark = this.challengingTestPattern ? benchmarkSolvers(this.puzzle, board.tiles) : undefined
    this.minimumMoves = this.challengeBenchmark?.optimalMoves ?? countOptimalMoves(this.puzzle, board.tiles)
    this.gameBoard = new GameBoard(this, this.puzzle, board, this.tileRenderer, {
      openingExplanationPending: this.openingExplanationPending,
      onTilePointerDown: (slotIndex, rowIndex, frozen) => {
        if (frozen) this.showAlreadyCompleteWord(rowIndex)
        else this.gameBoard?.selectTile(slotIndex, this.interactionMode)
      },
    }, {
      isInteractionBlocked: () => this.outOfMovesOverlay !== undefined || this.finishOverlay !== undefined || this.puzzleCreationFailed,
      onAlreadyCompleteRow: (rowIndex) => this.showAlreadyCompleteWord(rowIndex),
      onSwapCommitted: (event) => this.handleBoardSwapCommitted(event),
      onSwapSettled: () => {
        this.swapAnimating = false
        this.gameBoard?.updateTileMatchRendering()
      },
    })
    this.gameBoard.setOccupancy(startingOccupancy)
    const initialTiles = tilesFromOccupancy(this.occupancy, this.letters)
    this.playerPath = [{ tiles: initialTiles, deltaCorrect: 0, correctCount: countCorrectTiles(this.puzzle, initialTiles) }]
    this.gameBoard?.updateTileMatchRendering()
    this.prepareBoardForOpening()
  }

  private resetPuzzle(): void {
    if (this.swapAnimating || this.puzzleCreationFailed) return
    if (!this.gameBoard?.reorderByTileIds(this.initialTileIds)) return
    trackWerdolEvent("werdol:puzzle_reset", {
      puzzleId: this.puzzleId,
      puzzleNumber: this.puzzleNumber,
      movesTaken: this.movesTaken,
    })
    this.puzzleEndedTracked = false

    this.tileSlots.forEach((visual, slotIndex) => {
      const center = this.slotCenter(slotIndex)
      visual.text.setPosition(center.x, center.y).setDepth(10)
    })
    this.setOccupancy(this.initialOccupancy, true)
    this.movesTaken = 0
    this.outOfMovesDismissed = false
    const resetTiles = tilesFromOccupancy(this.occupancy, this.letters)
    this.playerPath = [{ tiles: resetTiles, deltaCorrect: 0, correctCount: countCorrectTiles(this.puzzle, resetTiles) }]
    this.minimumMoves = countOptimalMoves(this.puzzle, resetTiles)
    this.gameBoard?.clearSelection()
    this.updateMoveInfo()
    this.gameBoard?.updateTileMatchRendering()
  }

  private showAlreadyCompleteWord(rowIndex: number): void {
    this.playCompletionCelebration([rowIndex], false)
  }

  private handleBoardSwapCommitted(event: GameBoardSwapEvent): void {
    const { firstSlot, secondSlot, previousOccupancy, nextOccupancy, previousCorrectCount, nextCorrectCount } = event
    const previouslyCorrect = this.puzzle.rows.map((_row, rowIndex) => this.isRowCorrectAtOccupancy(previousOccupancy, rowIndex))
    const nextTiles = tilesFromOccupancy(nextOccupancy, this.letters)
    this.swapAnimating = true
    this.playerPath.push({ tiles: nextTiles.map((tile) => ({ ...tile })), deltaCorrect: nextCorrectCount - previousCorrectCount, correctCount: nextCorrectCount, swap: { firstSlot, secondSlot } })
    this.setOccupancy(nextOccupancy)
    this.movesTaken += 1
    trackWerdolEvent("werdol:move_executed", {
      puzzleId: this.puzzleId,
      puzzleNumber: this.puzzleNumber,
      moveNumber: this.movesTaken,
      firstSlot,
      secondSlot,
      interactionMode: this.interactionMode,
    })
    this.updateMoveInfo()
    const newlyCompletedRows = this.puzzle.rows
      .map((_row, rowIndex) => rowIndex)
      .filter((rowIndex) => !previouslyCorrect[rowIndex] && this.isRowCorrect(rowIndex))
    if (!this.puzzleEndedTracked && this.puzzle.rows.every((_row, rowIndex) => this.isRowCorrect(rowIndex))) {
      this.puzzleEndedTracked = true
      this.time.delayedCall(SWAP_ANIMATION_DURATION, () => this.playCompletionCelebration(newlyCompletedRows, true))
      trackWerdolEvent("werdol:puzzle_ended", {
        puzzleId: this.puzzleId,
        puzzleNumber: this.puzzleNumber,
        outcome: "solved",
        randomSeed: this.seed,
        wordListMode: this.wordListMode,
        movesTaken: this.movesTaken,
        minimumMoves: this.minimumMoves,
        elapsedMs: Math.max(0, Math.round(performance.now() - this.puzzleStartedAt)),
      })
    } else if (!this.outOfMovesDismissed && this.movesTaken >= this.minimumMoves + EXTRA_MOVES) {
      this.time.delayedCall(SWAP_ANIMATION_DURATION, () => this.showOutOfMoves())
      trackWerdolEvent("werdol:puzzle_ended", {
        puzzleId: this.puzzleId,
        puzzleNumber: this.puzzleNumber,
        outcome: "out_of_moves",
        randomSeed: this.seed,
        wordListMode: this.wordListMode,
        movesTaken: this.movesTaken,
        minimumMoves: this.minimumMoves,
        elapsedMs: Math.max(0, Math.round(performance.now() - this.puzzleStartedAt)),
      })
    } else if (newlyCompletedRows.length > 0) {
      this.time.delayedCall(SWAP_ANIMATION_DURATION, () => this.playCompletionCelebration(newlyCompletedRows, false))
    }
  }

  private showOutOfMoves(): void {
    if (this.outOfMovesOverlay !== undefined) return
    const overlay = this.add.container(0, 0).setDepth(50).setAlpha(0)
    const backdrop = this.add.rectangle(0, 0, 430, 760, 0x211f1a, 0.72).setOrigin(0, 0).setInteractive()
    const panel = this.add.rectangle(40, 265, 350, 210, 0xf3eedf).setOrigin(0, 0).setStrokeStyle(1.5, MainScene.BUTTON_STROKE_COLOR)
    const title = this.add.text(215, 310, "OUT OF MOVES", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "18px", fontStyle: "bold", letterSpacing: 1, resolution: RENDER_SCALE }).setOrigin(0.5)
    const message = this.add.text(215, 355, "The puzzle is still unsolved.", { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "16px", resolution: RENDER_SCALE }).setOrigin(0.5)
    const subtext = this.add.text(215, 380, "… but if you'd like to keep going", { color: COLORS.muted, fontFamily: "Georgia, Times New Roman, serif", fontSize: "12px", resolution: RENDER_SCALE }).setOrigin(0.5)
    const returnButton = this.add.rectangle(70, 405, 140, 34, MainScene.INACTIVE_BUTTON_COLOR).setOrigin(0, 0).setStrokeStyle(1, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    const returnLabel = this.add.text(140, 422, "RETURN TO GAME", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "10px", fontStyle: "bold", letterSpacing: 0.4, resolution: RENDER_SCALE }).setOrigin(0.5)
    const newPuzzleButton = this.add.rectangle(220, 405, 140, 34, COLORS.primaryButton).setOrigin(0, 0).setStrokeStyle(1.5, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    const newPuzzleLabel = this.add.text(290, 422, "NEW PUZZLE", { color: COLORS.primaryButtonText, fontFamily: "Arial, sans-serif", fontSize: "10px", fontStyle: "bold", letterSpacing: 0.4, resolution: RENDER_SCALE }).setOrigin(0.5)
    returnButton.on("pointerover", () => {
      returnButton.setFillStyle(MainScene.ACTIVE_BUTTON_COLOR)
    })
    returnButton.on("pointerout", () => {
      returnButton.setFillStyle(MainScene.INACTIVE_BUTTON_COLOR)
    })
    returnButton.on("pointerdown", () => {
      this.outOfMovesDismissed = true
      overlay.setVisible(false)
      this.outOfMovesOverlay = undefined
    })
    newPuzzleButton.on("pointerover", () => {
      newPuzzleButton.setFillStyle(COLORS.primaryButtonHover)
    })
    newPuzzleButton.on("pointerout", () => {
      newPuzzleButton.setFillStyle(COLORS.primaryButton)
    })
    newPuzzleButton.on("pointerdown", () => {
      this.restartWithSetup(this.nextPuzzleSetup())
    })
    overlay.add([backdrop, panel, title, message, subtext, returnButton, returnLabel, newPuzzleButton, newPuzzleLabel])
    this.outOfMovesOverlay = overlay
    this.tweens.add({ targets: overlay, alpha: 1, duration: UI_ENTRANCE_DURATION, ease: UI_ENTRANCE_EASE })
  }

  private showFinishOverlay(): void {
    if (this.finishOverlay !== undefined) return
    const phraseBank = this.movesTaken < this.minimumMoves
      ? FINISH_PHRASES.underGoal
      : this.movesTaken === this.minimumMoves
        ? FINISH_PHRASES.goal
        : this.movesTaken === this.minimumMoves + 1
          ? FINISH_PHRASES.extraOne
          : this.movesTaken === this.minimumMoves + 2
            ? FINISH_PHRASES.extraTwo
            : FINISH_PHRASES.extraThree
    const phrase = phraseBank[Math.floor(this.wordRandom() * phraseBank.length)] ?? "Excellent solve"
    const overlay = this.add.container(0, 0).setDepth(50).setAlpha(0)
    const backdrop = this.add.rectangle(0, 0, 430, 760, 0x211f1a, 0.72).setOrigin(0, 0)
    const dismissRegion = (x: number, y: number, width: number, height: number): Phaser.GameObjects.Rectangle => {
      const region = this.add.rectangle(x, y, width, height, 0, 0).setOrigin(0, 0).setInteractive()
      region.on("pointerdown", () => overlay.setVisible(false))
      return region
    }
    const dismissRegions = [
      dismissRegion(0, 0, 430, 265),
      dismissRegion(0, 475, 430, 285),
      dismissRegion(0, 265, 40, 210),
      dismissRegion(390, 265, 40, 210),
    ]
    const panel = this.add.rectangle(40, 265, 350, 210, 0xf3eedf).setOrigin(0, 0).setStrokeStyle(1.5, MainScene.BUTTON_STROKE_COLOR)
    const title = this.add.text(215, 310, "SOLVED", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "18px", fontStyle: "bold", letterSpacing: 1, resolution: RENDER_SCALE }).setOrigin(0.5)
    const target = this.add.text(215, 350, this.puzzle.target, { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "24px", fontStyle: "bold", letterSpacing: 2, resolution: RENDER_SCALE }).setOrigin(0.5)
    const message = this.add.text(215, 382, phrase, { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "17px", resolution: RENDER_SCALE }).setOrigin(0.5)
    const button = this.add.rectangle(125, 415, 180, 38, COLORS.primaryButton).setOrigin(0, 0).setStrokeStyle(1.5, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    const label = this.add.text(215, 434, "NEW PUZZLE", { color: COLORS.primaryButtonText, fontFamily: "Arial, sans-serif", fontSize: "14px", fontStyle: "bold", letterSpacing: 0.5, resolution: RENDER_SCALE }).setOrigin(0.5)
    button.on("pointerover", () => {
      button.setFillStyle(COLORS.primaryButtonHover)
      label.setColor(COLORS.primaryButtonText)
    })
    button.on("pointerout", () => {
      button.setFillStyle(COLORS.primaryButton)
      label.setColor(COLORS.primaryButtonText)
    })
    button.on("pointerdown", () => {
      this.restartWithSetup(this.nextPuzzleSetup())
    })
    overlay.add([backdrop, ...dismissRegions, panel, title, target, message, button, label])
    this.finishOverlay = overlay
    this.tweens.add({ targets: overlay, alpha: 1, duration: UI_ENTRANCE_DURATION, ease: UI_ENTRANCE_EASE })
  }

  private playCompletionCelebration(completedRows: number[], puzzleComplete: boolean): void {
    const groups: Phaser.GameObjects.GameObject[][] = this.tileSlots.map((visual, slotIndex) => {
      const background = this.tileBackgrounds[slotIndex]
      return background === undefined ? [visual.text] : [background, visual.text]
    })
    const rows = Array.from({ length: this.puzzle.rows.length + 1 }, (_value, rowIndex) => groups.slice(rowIndex * 5, (rowIndex + 1) * 5))
    if (puzzleComplete) {
      const playableRows = rows.slice(0, this.puzzle.rows.length)
      let remainingRows = completedRows.length
      const startPuzzleCelebration = (): void => {
        if (remainingRows > 0) return
        celebrateCompletedPuzzle(this, playableRows, () => this.showFinishOverlay())
      }
      if (remainingRows === 0) {
        startPuzzleCelebration()
      } else {
        completedRows.forEach((rowIndex) => {
          celebrateCompletedRow(this, rows[rowIndex] ?? [], () => {
            remainingRows -= 1
            startPuzzleCelebration()
          })
        })
      }
      return
    }
    completedRows.forEach((rowIndex) => celebrateCompletedRow(this, rows[rowIndex] ?? []))
  }

  private isLetterCorrectAtOccupancy(occupancy: readonly number[], slotIndex: number): boolean {
    return this.gameBoard !== undefined && letterMatchesOriginalTileLetter(this.gameBoard.board.boardTiles, occupancy, this.letters, slotIndex)
  }

  private isRowCorrect(rowIndex: number): boolean {
    return this.isRowCorrectAtOccupancy(this.occupancy, rowIndex)
  }

  private isRowCorrectAtOccupancy(occupancy: readonly number[], rowIndex: number): boolean {
    const target = rowIndex === this.puzzle.rows.length ? this.puzzle.target : this.puzzle.rows[rowIndex]?.intendedGuess
    return target !== undefined && occupancy
      .slice(rowIndex * 5, (rowIndex + 1) * 5)
      .map((letterId) => this.letters[letterId]?.character ?? "")
      .join("") === target
  }

  private startWalkthrough(): void {
    if (this.walkthrough !== undefined || this.swapAnimating || this.puzzleCreationFailed || this.reviewOverlay !== undefined) return
    this.walkthrough = new PuzzleWalkthrough(this, this.tileRendererMode, () => {
      this.walkthrough = undefined
    })
  }

  private animateTextExchange(
    firstText: Phaser.GameObjects.Text,
    secondText: Phaser.GameObjects.Text,
    firstSlot: number,
    secondSlot: number,
    onComplete: () => void,
  ): Phaser.Tweens.Tween {
    const startFirst = this.slotCenter(firstSlot)
    const startSecond = this.slotCenter(secondSlot)
    const distance = Math.hypot(startSecond.x - startFirst.x, startSecond.y - startFirst.y)
    const radius = Math.max(distance * 0.5, distance * devSessionState.titleArcRadiusMultiplier)
    const circleSide = Math.random() < 0.5 ? -1 : 1
    const firstArc = createCircularArc(startFirst, startSecond, radius, circleSide, true)
    const secondArc = mirrorCircularArc(firstArc, startFirst, startSecond)
    const arcVisuals = [
      new CircularArcVisual(this, firstArc, 0xc49f52),
      new CircularArcVisual(this, secondArc, 0x71845f),
    ]
    arcVisuals.forEach((arc) => {
      arc.setDepth(SWAP_ARC_DEPTH)
      arc.animateIn(ARC_ANIMATION_DURATION)
    })
    this.time.delayedCall(TILE_SWAP_ANIMATION_DURATION - ARC_ANIMATION_DURATION, () => {
      arcVisuals.forEach((arc) => arc.animateOut(ARC_ANIMATION_DURATION, () => arc.destroy()))
    })
    return this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: TILE_SWAP_ANIMATION_DURATION,
      ease: "Sine.easeInOut",
      onUpdate: (tween) => {
        const progress = tween.getValue()
        if (progress === null) return
        const firstPoint = pointOnCircularArc(firstArc, progress)
        const secondPoint = pointOnCircularArc(secondArc, progress)
        firstText.setPosition(firstPoint.x, firstPoint.y)
        secondText.setPosition(secondPoint.x, secondPoint.y)
        firstText.setAngle(30)
        secondText.setAngle(30)
      },
      onComplete: () => {
        firstText.setPosition(startSecond.x, startSecond.y)
        secondText.setPosition(startFirst.x, startFirst.y)
        firstText.setAngle(0)
        secondText.setAngle(0)
        onComplete()
      },
    })
  }

  private slotCenter(slotIndex: number): { x: number; y: number } {
    const rowIndex = Math.floor(slotIndex / 5)
    const columnIndex = slotIndex % 5
    return boardSlotCenter(rowIndex, columnIndex)
  }

  private enterReviewMode(): void {
    if (this.puzzleCreationFailed || this.swapAnimating || this.reviewOverlay !== undefined) return
    this.reviewOriginalTiles = this.tileSlots.map((visual) => ({ ...visual.tile }))
    const currentTiles = this.reviewOriginalTiles
    this.reviewReferencePath = createReferencePath(this.puzzle, currentTiles)
    this.reviewSelectedPath = "player"
    this.reviewSelectedIndex = Math.max(0, this.playerPath.length - 1)
    this.reviewOverlay = this.add.container(0, 0).setDepth(40)
    this.reviewOverlay.add(this.add.rectangle(0, 0, 430, 760, 0xf3eedf, 0.98).setOrigin(0, 0).setInteractive())
    this.reviewOverlay.add(this.add.text(24, 26, "REVIEW", { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "28px", fontStyle: "bold", resolution: RENDER_SCALE }))
    this.reviewOverlay.add(this.add.text(215, 127, this.puzzle.target, { color: COLORS.ink, fontFamily: "Georgia, Times New Roman, serif", fontSize: "28px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(0.5))
    this.reviewBoard = this.add.container(0, 0)
    this.reviewOverlay.add(this.reviewBoard)
    this.reviewExplorer = new TimelineExplorer<ReviewPathKind>(() => this.updateReviewTimelineGeometry(), { smoothing: DEFAULT_MAGNIFICATION_CONFIG.smoothing })
    const close = this.add.text(398, 34, "CLOSE", { color: COLORS.muted, fontFamily: "Arial, sans-serif", fontSize: "11px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(1, 0.5).setPadding(12, 10).setInteractive({ useHandCursor: true })
    close.on("pointerdown", () => this.exitReviewMode(false))
    this.reviewOverlay.add(close)
    this.input.on("pointermove", this.handleReviewPointerMove, this)
    this.input.on("pointerup", this.handleReviewPointerUp, this)
    this.reviewTimeline = this.add.container(0, 0)
    this.reviewOverlay.add(this.reviewTimeline)
    this.buildReviewControls()
    this.refreshReview()
  }

  private buildReviewControls(): void {
    if (this.reviewOverlay === undefined) return
    const controls: Array<[number, string, () => void]> = [
      [35, "‹ BACK", () => this.stepReview(-1)],
      [125, "PLAY", () => this.playReview()],
      [215, "STOP", () => this.stopReview()],
      [305, "NEXT ›", () => this.stepReview(1)],
    ]
    controls.forEach(([x, label, callback]) => {
      const button = this.add.rectangle(x, 665, 80, 32, MainScene.INACTIVE_BUTTON_COLOR).setOrigin(0, 0).setStrokeStyle(1, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
      button.on("pointerdown", callback)
      this.reviewOverlay?.add(button)
      this.reviewOverlay?.add(this.add.text(x + 40, 681, label, { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "9px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(0.5))
    })
    const continueButton = this.add.rectangle(105, 710, 220, 34, MainScene.ACTIVE_BUTTON_COLOR).setOrigin(0, 0).setStrokeStyle(1, MainScene.BUTTON_STROKE_COLOR).setInteractive({ useHandCursor: true })
    continueButton.on("pointerdown", () => this.continueFromReview())
    this.reviewOverlay.add(continueButton)
    this.reviewOverlay.add(this.add.text(215, 727, "CONTINUE PLAYING FROM HERE", { color: COLORS.ink, fontFamily: "Arial, sans-serif", fontSize: "10px", fontStyle: "bold", resolution: RENDER_SCALE }).setOrigin(0.5))
  }

  private refreshReview(): void {
    if (this.reviewTimeline === undefined) return
    this.reviewTimeline.removeAll(true)
    this.reviewTimelineRows = []
    if (this.reviewSelectedPath === "player") {
      const referenceStart = this.playerPath[this.reviewSelectedIndex]?.tiles ?? this.reviewOriginalTiles
      this.reviewReferencePath = createReferencePath(this.puzzle, referenceStart)
    }
    this.drawReviewTimeline(this.playerPath, "YOUR PATH", 535, "player")
    this.drawReviewTimeline(this.reviewReferencePath, "REFERENCE", 605, "reference")
    const selectedState = this.getSelectedReviewState()
    if (selectedState !== undefined) {
      this.applyTileState(selectedState.tiles)
      this.drawReviewBoard(selectedState.tiles)
    }
  }

  private drawReviewTimeline(states: ReviewState[], label: string, y: number, kind: ReviewPathKind): void {
    if (this.reviewTimeline === undefined) return
    if (this.magnificationMode === "cards") {
      this.drawCardReviewTimeline(states, label, y, kind)
      return
    }
    const timeline = this.reviewTimeline
    timeline.add(this.add.text(24, y - 32, label, { color: COLORS.muted, fontFamily: "Arial, sans-serif", fontSize: "11px", fontStyle: "bold", resolution: RENDER_SCALE }))
    const largerStateCount = Math.max(this.playerPath.length, this.reviewReferencePath.length)
    const scale = timelineScaleForStateCount(largerStateCount, 344, DEFAULT_MAGNIFICATION_CONFIG)
    const stripWidth = timelineWidthForStateCount(states.length, scale, DEFAULT_MAGNIFICATION_CONFIG)
    const startX = (430 - stripWidth) / 2
    const baseRects = createTimelineRects(states.length, startX, 344, DEFAULT_MAGNIFICATION_CONFIG, scale)
    const rowVisuals: Phaser.GameObjects.Rectangle[] = []
    baseRects.forEach((baseRect, rectIndex) => {
      const initial = layoutTimelineRects(baseRects, undefined, startX, startX + stripWidth, this.magnificationMode, DEFAULT_MAGNIFICATION_CONFIG)[rectIndex]!
      const stateIndex = baseRect.type === "state" ? baseRect.index : baseRect.index + 1
      const fill = baseRect.type === "state" ? 0x211f1a : reviewDeltaColor(states[stateIndex]?.deltaCorrect ?? 0)
      const visual = this.add.rectangle(initial.center, y + 23, initial.width, initial.height, fill).setOrigin(0.5)
      if (baseRect.type === "state") {
        visual.setInteractive(new Phaser.Geom.Rectangle(-9, -24, 18, 48), Phaser.Geom.Rectangle.Contains)
        visual.on("pointerdown", () => {
          this.selectReviewState(kind, baseRect.index)
        })
      }
      timeline.add(visual)
      rowVisuals.push(visual)
    })
    this.reviewTimelineRows.push({ kind, y, mode: this.magnificationMode, baseRects, visuals: rowVisuals, left: startX, right: startX + stripWidth })
    this.updateReviewTimelineGeometry()
  }

  private drawCardReviewTimeline(states: ReviewState[], label: string, y: number, kind: ReviewPathKind): void {
    if (this.reviewTimeline === undefined) return
    const timeline = this.reviewTimeline
    timeline.add(this.add.text(24, y - 32, label, { color: COLORS.muted, fontFamily: "Arial, sans-serif", fontSize: "11px", fontStyle: "bold", resolution: RENDER_SCALE }))
    const largerCardCount = Math.max(this.playerPath.length, this.reviewReferencePath.length) * 2 - 1
    const cardWidth = cardWidthForPath(largerCardCount, 344, DEFAULT_REVIEW_CARD_CONFIG)
    const cardConfig = { ...DEFAULT_REVIEW_CARD_CONFIG, cardWidth }
    const left = 43
    const right = 387
    const focusStateIndex = kind === "player"
      ? (this.reviewSelectedPath === "player" ? this.reviewSelectedIndex : this.playerPath.length - 1)
      : (this.reviewSelectedPath === "reference" ? this.reviewSelectedIndex : 0)
    const focusCardIndex = Math.max(0, focusStateIndex * 2)
    const baseRects = createReviewCardRects(states.length, left, right, cardConfig)
    const initialLayouts = layoutReviewCards(baseRects, focusCardIndex, undefined, left, right, cardConfig)
    const rowVisuals: Phaser.GameObjects.Rectangle[] = []
    baseRects.forEach((baseRect, rectIndex) => {
      const layout = initialLayouts[rectIndex]!
      const stateIndex = baseRect.type === "state" ? baseRect.index : baseRect.index + 1
      const fill = baseRect.type === "state" ? 0x211f1a : reviewDeltaColor(states[stateIndex]?.deltaCorrect ?? 0)
      const visual = this.add.rectangle(layout.center, y + 23, layout.width, DEFAULT_MAGNIFICATION_CONFIG.baseHeight, fill).setOrigin(0.5)
      const hitHeight = 48
      const hitTop = (DEFAULT_MAGNIFICATION_CONFIG.baseHeight - hitHeight) / 2
      visual.setInteractive(new Phaser.Geom.Rectangle(0, hitTop, layout.width, hitHeight), Phaser.Geom.Rectangle.Contains)
      visual.on("pointerover", () => {
        visual.setFillStyle(COLORS.reviewHover, 1)
        visual.setStrokeStyle(2, 0x211f1a, 1)
      })
      visual.on("pointerout", () => {
        visual.setFillStyle(fill, 1)
        visual.setStrokeStyle(0, 0x211f1a, 1)
      })
      visual.on("pointerdown", () => {
        this.selectReviewState(kind, stateIndex)
      })
      timeline.add(visual)
      rowVisuals.push(visual)
    })
    this.reviewTimelineRows.push({ kind, y, mode: "cards", baseRects, visuals: rowVisuals, left, right, focusCardIndex })
    this.updateReviewTimelineGeometry()
  }

  private setReviewZoomFocus(kind: ReviewPathKind, x: number): void {
    this.reviewExplorer?.setPointer(kind, x)
  }

  private handleReviewPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.reviewOverlay === undefined) return
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
    const row = this.reviewTimelineRows.find((candidate) => Math.abs(worldPoint.y - (candidate.y + 23)) <= 28)
    if (row === undefined) {
      if (this.magnificationMode === "cards") this.reviewExplorer?.releaseAfter(2000)
      else this.reviewExplorer?.clear()
      return
    }
    this.setReviewZoomFocus(row.kind, worldPoint.x)
  }

  private handleReviewPointerUp(): void {
    if (this.magnificationMode === "cards") this.reviewExplorer?.releaseAfter(2000)
  }

  private updateReviewTimelineGeometry(): void {
    this.reviewTimelineRows.forEach((row) => {
      const focus = this.reviewExplorer?.getFocus()
      const focusX = focus?.kind === row.kind ? focus.x : undefined
      if (row.mode === "cards") {
        const cardRects = row.baseRects as ReviewCardRect[]
        const focusCardIndex = focusX === undefined
          ? (row.focusCardIndex ?? 0)
          : focusCardIndexAtX(cardRects.length, row.left, row.right, focusX, { ...DEFAULT_REVIEW_CARD_CONFIG, cardWidth: cardRects[0]!.baseRight - cardRects[0]!.baseLeft })
        const cardLayouts = layoutReviewCards(cardRects, focusCardIndex, focusX, row.left, row.right, { ...DEFAULT_REVIEW_CARD_CONFIG, cardWidth: cardRects[0]!.baseRight - cardRects[0]!.baseLeft })
        row.visuals.forEach((visual, index) => {
          const layout = cardLayouts[index]
          if (layout === undefined) return
          const targetX = layout.center
          const targetY = row.y + 23 - DEFAULT_REVIEW_CARD_CONFIG.verticalLift * layout.verticalInfluence
          visual.setPosition(targetX, targetY).setSize(layout.width, DEFAULT_MAGNIFICATION_CONFIG.baseHeight)
        })
        return
      }
      const layouts = layoutTimelineRects(row.baseRects, focusX, row.left, row.right, this.magnificationMode, DEFAULT_MAGNIFICATION_CONFIG)
      row.visuals.forEach((visual, index) => {
        const layout = layouts[index]
        if (layout === undefined) return
        const verticalLift = DEFAULT_MAGNIFICATION_CONFIG.maxVerticalDisplacement * layout.influence
        visual.setPosition(layout.center, row.y + 23 - verticalLift).setSize(layout.width, layout.height)
        if (layout.type === "state") {
          visual.setFillStyle(layout.influence > 0 ? 0xfaf6e9 : 0x211f1a, 1)
          visual.setStrokeStyle(layout.influence > 0 ? 2 : 0, 0x211f1a, 1)
        }
      })
    })
  }

  private getSelectedReviewState(): ReviewState | undefined {
    const states = this.reviewSelectedPath === "player" ? this.playerPath : this.reviewReferencePath
    return states[this.reviewSelectedIndex]
  }

  private stepReview(amount: number): void {
    this.stopReview()
    const states = this.reviewSelectedPath === "player" ? this.playerPath : this.reviewReferencePath
    this.moveReviewTo(this.reviewSelectedPath, this.reviewSelectedIndex + amount, states)
  }

  private playReview(): void {
    if (this.reviewPlaying) return
    this.reviewPlaying = true
    this.reviewTimer = this.time.addEvent({ delay: 550, loop: true, callback: () => {
      const states = this.reviewSelectedPath === "player" ? this.playerPath : this.reviewReferencePath
      if (this.reviewSelectedIndex >= states.length - 1) {
        this.stopReview()
        return
      }
      this.moveReviewTo(this.reviewSelectedPath, this.reviewSelectedIndex + 1, states)
    } })
  }

  private selectReviewState(kind: ReviewPathKind, index: number): void {
    if (this.reviewSwapAnimating) return
    this.stopReview()
    this.moveReviewTo(kind, index)
  }

  private moveReviewTo(kind: ReviewPathKind, index: number, knownStates?: ReviewState[]): void {
    if (this.reviewSwapAnimating) return
    const states = knownStates ?? (kind === "player" ? this.playerPath : this.reviewReferencePath)
    const nextIndex = Math.max(0, Math.min(states.length - 1, index))
    if (kind !== this.reviewSelectedPath || Math.abs(nextIndex - this.reviewSelectedIndex) !== 1) {
      this.reviewSelectedPath = kind
      this.reviewSelectedIndex = nextIndex
      this.refreshReview()
      return
    }

    const currentIndex = this.reviewSelectedIndex
    const movingForward = nextIndex > currentIndex
    const transitionState = states[movingForward ? nextIndex : currentIndex]
    const swap = transitionState?.swap
    const firstText = swap === undefined ? undefined : this.reviewTileTexts[swap.firstSlot]
    const secondText = swap === undefined ? undefined : this.reviewTileTexts[swap.secondSlot]
    if (swap === undefined || firstText === undefined || secondText === undefined) {
      this.reviewSelectedPath = kind
      this.reviewSelectedIndex = nextIndex
      this.refreshReview()
      return
    }

    this.reviewSwapAnimating = true
    this.reviewSwapTween = this.animateTextExchange(firstText, secondText, swap.firstSlot, swap.secondSlot, () => {
      this.reviewTileTexts[swap.firstSlot] = secondText
      this.reviewTileTexts[swap.secondSlot] = firstText
      this.reviewSwapAnimating = false
      this.reviewSwapTween = undefined
      this.reviewSelectedPath = kind
      this.reviewSelectedIndex = nextIndex
      this.refreshReview()
    })
  }

  private stopReview(): void {
    this.reviewPlaying = false
    this.reviewTimer?.remove()
    this.reviewTimer = undefined
  }

  private continueFromReview(): void {
    if (this.reviewSwapAnimating) return
    const selected = this.getSelectedReviewState()
    if (selected === undefined) return
    if (this.reviewSelectedPath === "player") {
      this.playerPath = this.playerPath.slice(0, this.reviewSelectedIndex + 1)
      this.movesTaken = this.reviewSelectedIndex
    } else {
      this.playerPath = [{ tiles: selected.tiles.map((tile) => ({ ...tile })), deltaCorrect: 0, correctCount: selected.correctCount }]
      this.movesTaken = 0
    }
    this.applyTileState(selected.tiles)
    this.minimumMoves = countOptimalMoves(this.puzzle, selected.tiles)
    this.updateMoveInfo()
    this.exitReviewMode(true)
  }

  private exitReviewMode(keepState: boolean): void {
    this.stopReview()
    this.reviewSwapTween?.stop()
    this.reviewSwapTween = undefined
    this.reviewSwapAnimating = false
    this.input.off("pointermove", this.handleReviewPointerMove, this)
    this.input.off("pointerup", this.handleReviewPointerUp, this)
    this.reviewExplorer?.dispose()
    this.reviewExplorer = undefined
    if (!keepState) this.applyTileState(this.reviewOriginalTiles)
    this.reviewOverlay?.destroy(true)
    this.reviewOverlay = undefined
    this.reviewTimeline = undefined
    this.gameBoard?.updateTileMatchRendering()
  }

  private applyTileState(state: readonly LetterTile[]): void {
    if (!this.gameBoard?.applyTileState(state)) return
  }

  private drawReviewBoard(state: readonly LetterTile[]): void {
    if (this.reviewBoard === undefined) return
    this.reviewBoard.removeAll(true)
    this.reviewTileTexts = []
    this.puzzle.rows.forEach((row, rowIndex) => {
      row.pattern.forEach((result, columnIndex) => {
        const slotIndex = rowIndex * 5 + columnIndex
        const center = this.slotCenter(slotIndex)
        const tile = state[slotIndex]
        if (tile === undefined) return
        const background = this.tileRenderer.createTile(this, center, tileColor(result))
        this.reviewBoard?.add(background)
        const text = createTileLetter(this, center, tile.letter, REVIEW_PRESENTATION)
        renderTileState(this.tileRenderer, background, tile.letter === row.intendedGuess[columnIndex] ? "matched" : "unmatched")
        this.reviewBoard?.add(text)
        this.reviewTileTexts[slotIndex] = text
      })
    })
  }
}

function quadraticPoint(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  progress: number,
): { x: number; y: number } {
  const remaining = 1 - progress
  return {
    x: remaining * remaining * start.x + 2 * remaining * progress * control.x + progress * progress * end.x,
    y: remaining * remaining * start.y + 2 * remaining * progress * control.y + progress * progress * end.y,
  }
}

function clampTileMinimum(value: number): number {
  return Math.max(0, Math.min(6, Math.round(value)))
}

function inputForSeed(element: Phaser.GameObjects.DOMElement): HTMLInputElement {
  return element.node.querySelector("input") as HTMLInputElement
}

function buttonForSeed(element: Phaser.GameObjects.DOMElement): HTMLButtonElement {
  return element.node.querySelector("button") as HTMLButtonElement
}

function reviewDeltaColor(delta: number): number {
  if (delta >= 2) return 0x8fae7f
  if (delta === 1) return 0xb4c59d
  if (delta < 0) return 0xd49b86
  return 0xc6bdae
}

function createIconLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  kind: IconKind,
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y).setDepth(1)
  const assetName = {
    swap: "replace",
    reveal: "eye",
    easy: "square",
    hard: "layers-3",
    reset: "rotate-ccw",
  }[kind]
  container.add(scene.add.image(0, 0, `werdol-${assetName}`).setDisplaySize(30, 30))
  return container
}
