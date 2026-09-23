import Phaser from "phaser"
import { createCircularArc, mirrorCircularArc, pointOnCircularArc } from "./circularArc"
import { CircularArcVisual } from "./circularArcVisual"
import { WERDOL_TITLE_HEADER_Y, WerdolTitle } from "./WerdolTitle"

const COLORS = {
  paper: 0xf3eedf,
} as const

const TITLE_SPLASH_Y = 300
const TITLE_SPLASH_SLOT_SPACING = 64
const TITLE_ENTRANCE_APPROACH_DURATION = 400
const TITLE_ENTRANCE_RETURN_DURATION = 200
const TITLE_ENTRANCE_SETTLE_DURATION = 100
const TITLE_ENTRANCE_DURATION = TITLE_ENTRANCE_APPROACH_DURATION + TITLE_ENTRANCE_RETURN_DURATION + TITLE_ENTRANCE_SETTLE_DURATION
const TITLE_ENTRANCE_OVERSHOOT = 60
const TITLE_ENTRANCE_STAGGER = 105
const TITLE_ENTRANCE_PAUSE = -500
const TITLE_TOP_ENTRANCE_Y = -80
const TITLE_BOTTOM_ENTRANCE_Y = 840
const TITLE_SPLASH_SCALE = 2
const TITLE_SWAP_DURATION = 300
const TITLE_SWAP_OVERLAP = -90
const TITLE_ARC_ANIMATION_DURATION = 120
const TITLE_ARC_RADIUS_MIN = 0.5
const TITLE_ARC_RADIUS_MAX = 2
const DEFAULT_TITLE_ARC_RADIUS_MULTIPLIER = 0.5
const TITLE_WORDLE_PAUSE = 450
const TITLE_END_PAUSE = 250
const TITLE_HEADER_MOVE_DURATION = 900
const TITLE_HEADER_MOVE_EASE = "Cubic.InOut"
const TITLE_HEADER_SCALE_EASE = "Linear"
export interface OpeningAnimationOptions {
  arcRadiusMultiplier?: number
}

/** The anonymized Wordle prelude shown before the real Werdol board. */
export class OpeningAnimation {
  private readonly layer: Phaser.GameObjects.Container
  private readonly timers: Phaser.Time.TimerEvent[] = []
  private title!: WerdolTitle
  private readonly titleOccupancy = [3, 2, 4, 0, 1, 5]
  private readonly arcRadiusMultiplier: number
  private finished = false

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onComplete: () => void,
    private readonly options: OpeningAnimationOptions = {},
  ) {
    this.arcRadiusMultiplier = clampArcRadiusMultiplier(this.options.arcRadiusMultiplier ?? DEFAULT_TITLE_ARC_RADIUS_MULTIPLIER)
    this.layer = scene.add.container(0, 0).setDepth(10_000)
    this.layer.add(scene.add.rectangle(215, 380, 430, 760, COLORS.paper).setInteractive())
    this.addHeader()
    this.scheduleAnimation()
  }

  destroy(): void {
    this.timers.forEach((timer) => timer.remove(false))
    this.layer.destroy(true)
  }

  skip(): void {
    if (this.finished) return
    this.finished = true
    this.destroy()
  }

  private addHeader(): void {
    const titleRule = this.scene.add.graphics()
    titleRule.lineStyle(1, 0xc6bdae, 0.9)
    titleRule.lineBetween(31, 105, 399, 105)
    this.layer.add(titleRule)
    this.title = new WerdolTitle(this.scene, this.layer)
  }

  private titleSlotPosition(
    slotIndex: number,
    y = TITLE_SPLASH_Y,
    spacing = TITLE_SPLASH_SLOT_SPACING,
  ): { x: number; y: number } {
    return this.title.slotPosition(slotIndex, y, spacing)
  }

  private animateTitleEntrance(): void {
    this.titleOccupancy.forEach((pieceIndex, slotIndex) => {
      const piece = this.title.pieces[pieceIndex]
      if (!piece) return
      const target = this.titleSlotPosition(slotIndex)
      const startY = slotIndex % 2 === 0 ? TITLE_TOP_ENTRANCE_Y : TITLE_BOTTOM_ENTRANCE_Y
      const travelDirection = startY < target.y ? 1 : -1
      piece.display.setPosition(target.x, startY).setScale(TITLE_SPLASH_SCALE)
      this.scene.tweens.chain({
        targets: piece.display,
        delay: slotIndex * TITLE_ENTRANCE_STAGGER,
        tweens: [
          { y: target.y + travelDirection * TITLE_ENTRANCE_OVERSHOOT, duration: TITLE_ENTRANCE_APPROACH_DURATION, ease: "Cubic.Out" },
          { y: target.y - travelDirection * 3, duration: TITLE_ENTRANCE_RETURN_DURATION, ease: "Sine.InOut" },
          { y: target.y, duration: TITLE_ENTRANCE_SETTLE_DURATION, ease: "Sine.Out" },
        ],
      })
    })
  }

  private scheduleTitleSequence(): number {
    const preludeSwaps: Array<[number, number]> = [
      [0, 1], // fake: DROWEL -> RDOWEL
      [4, 5], // real: RDOWEL -> RDOWLE
      [0, 1], // fake: RDOWLE -> DROWLE
      [0, 3], // real: DROWLE -> WRODLE
      [1, 2], // real: WRODLE -> WORDLE
    ]
    const finalSwaps: Array<[number, number]> = [
      [0, 3], // z1: WORDLE -> DORWLE
      [1, 5], // x:  DORWLE -> DERWLO
      [0, 3], // z2: DERWLO -> WERDLO
      [4, 5], // y:  WERDLO -> WERDOL
    ]
    let elapsed = 0
    preludeSwaps.forEach(([firstSlot, secondSlot]) => {
      this.after(elapsed, () => this.animateTitleSwap(firstSlot, secondSlot))
      elapsed += TITLE_SWAP_DURATION + TITLE_SWAP_OVERLAP
    })
    elapsed += TITLE_WORDLE_PAUSE
    finalSwaps.forEach(([firstSlot, secondSlot]) => {
      this.after(elapsed, () => this.animateTitleSwap(firstSlot, secondSlot))
      elapsed += TITLE_SWAP_DURATION + TITLE_SWAP_OVERLAP
    })
    return elapsed
  }

  private animateTitleSwap(firstSlot: number, secondSlot: number): void {
    const firstPieceIndex = this.titleOccupancy[firstSlot]
    const secondPieceIndex = this.titleOccupancy[secondSlot]
    if (firstPieceIndex === undefined || secondPieceIndex === undefined) return
    const firstPiece = this.title.pieces[firstPieceIndex]
    const secondPiece = this.title.pieces[secondPieceIndex]
    if (!firstPiece || !secondPiece) return
    const firstStart = { x: firstPiece.display.x, y: firstPiece.display.y }
    const secondStart = { x: secondPiece.display.x, y: secondPiece.display.y }
    const firstTarget = this.titleSlotPosition(secondSlot)
    const secondTarget = this.titleSlotPosition(firstSlot)
    const distance = Math.hypot(firstStart.x - secondStart.x, firstStart.y - secondStart.y)
    const radius = Math.max(distance * TITLE_ARC_RADIUS_MIN, distance * this.arcRadiusMultiplier)
    const circleSide = Math.random() < 0.5 ? -1 : 1
    const firstArc = createCircularArc(firstStart, firstTarget, radius, circleSide, true)
    const secondArc = mirrorCircularArc(firstArc, firstStart, firstTarget)
    const arcVisuals = [
      new CircularArcVisual(this.scene, firstArc, 0xc49f52, this.layer),
      new CircularArcVisual(this.scene, secondArc, 0x71845f, this.layer),
    ]
    arcVisuals.forEach((arc) => arc.animateIn(TITLE_ARC_ANIMATION_DURATION))
    this.after(TITLE_SWAP_DURATION - TITLE_ARC_ANIMATION_DURATION, () => {
      arcVisuals.forEach((arc) => arc.animateOut(TITLE_ARC_ANIMATION_DURATION, () => arc.destroy()))
    })
    this.titleOccupancy[firstSlot] = secondPieceIndex
    this.titleOccupancy[secondSlot] = firstPieceIndex
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: TITLE_SWAP_DURATION,
      ease: "Sine.easeInOut",
      onUpdate: (tween) => {
        const progress = tween.getValue()
        if (progress === null) return
        const firstPoint = pointOnCircularArc(firstArc, progress)
        const secondPoint = pointOnCircularArc(secondArc, progress)
        firstPiece.display.setPosition(firstPoint.x, firstPoint.y)
        secondPiece.display.setPosition(secondPoint.x, secondPoint.y)
      },
      onComplete: () => {
        firstPiece.display.setPosition(firstTarget.x, TITLE_SPLASH_Y)
        secondPiece.display.setPosition(secondTarget.x, TITLE_SPLASH_Y)
      },
    })
  }

  private scheduleAnimation(): void {
    this.animateTitleEntrance()
    const entranceDuration = TITLE_ENTRANCE_DURATION + 5 * TITLE_ENTRANCE_STAGGER
    this.after(entranceDuration + TITLE_ENTRANCE_PAUSE, () => {
      const titleDuration = this.scheduleTitleSequence()
      this.after(titleDuration + TITLE_END_PAUSE, () => this.animateTitleToHeader())
    })
  }

  private animateTitleToHeader(): void {
    let remaining = this.title.pieces.length
    this.titleOccupancy.forEach((pieceIndex, slotIndex) => {
      const piece = this.title.pieces[pieceIndex]
      if (!piece) return
      const target = this.title.slotPosition(slotIndex, WERDOL_TITLE_HEADER_Y)
      this.scene.tweens.add({
        targets: piece.display,
        x: target.x,
        y: target.y,
        duration: TITLE_HEADER_MOVE_DURATION,
        ease: TITLE_HEADER_MOVE_EASE,
        onComplete: () => {
          remaining -= 1
          if (remaining === 0) {
            this.finished = true
            this.destroy()
            this.onComplete()
          }
        },
      })
      this.scene.tweens.add({
        targets: piece.display,
        scale: 1,
        duration: TITLE_HEADER_MOVE_DURATION,
        ease: TITLE_HEADER_SCALE_EASE,
      })
    })
  }

  private after(delay: number, callback: () => void): void {
    this.timers.push(this.scene.time.delayedCall(delay, callback))
  }
}

function clampArcRadiusMultiplier(value: number): number {
  return Math.min(TITLE_ARC_RADIUS_MAX, Math.max(TITLE_ARC_RADIUS_MIN, value))
}
