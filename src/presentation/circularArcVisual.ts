import Phaser from "phaser"
import { sampleCircularArc, type CircularArc } from "./circularArc"

const ARC_VISIBLE_ALPHA = 0.7
const ARC_MIN_LINE_WIDTH = 0
const ARC_MAX_LINE_WIDTH = 6

export class CircularArcVisual {
  readonly graphics: Phaser.GameObjects.Graphics
  readonly underlayGraphics: Phaser.GameObjects.Graphics
  private animation?: Phaser.Tweens.Tween

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly arc: CircularArc,
    private readonly color: number,
    parent?: Phaser.GameObjects.Container,
  ) {
    this.underlayGraphics = scene.add.graphics().setAlpha(0)
    this.graphics = scene.add.graphics().setAlpha(0)
    if (parent) parent.add([this.underlayGraphics, this.graphics])
    this.redraw(this.underlayGraphics, ARC_MIN_LINE_WIDTH * 2, 0xffffff)
    this.redraw(this.graphics, ARC_MIN_LINE_WIDTH, this.color)
  }

  setDepth(depth: number): this {
    this.underlayGraphics.setDepth(depth - 1)
    this.graphics.setDepth(depth)
    return this
  }

  animateIn(duration: number): void {
    this.animate(0, 1, duration)
  }

  animateOut(duration: number, onComplete?: () => void): void {
    this.animate(1, 0, duration, onComplete)
  }

  destroy(): void {
    this.animation?.stop()
    this.underlayGraphics.destroy()
    this.graphics.destroy()
  }

  private animate(from: number, to: number, duration: number, onComplete?: () => void): void {
    this.animation?.stop()
    const state = { value: from }
    this.animation = this.scene.tweens.add({
      targets: state,
      value: to,
      duration,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        this.graphics.setAlpha(ARC_VISIBLE_ALPHA * state.value)
        this.underlayGraphics.setAlpha(ARC_VISIBLE_ALPHA * state.value)
        const lineWidth = ARC_MIN_LINE_WIDTH + (ARC_MAX_LINE_WIDTH - ARC_MIN_LINE_WIDTH) * state.value
        this.redraw(this.underlayGraphics, lineWidth * 2, 0xffffff)
        this.redraw(this.graphics, lineWidth, this.color)
      },
      onComplete: () => {
        if (to === 0) {
          this.underlayGraphics.setAlpha(0)
          this.graphics.setAlpha(0)
          this.underlayGraphics.clear()
          this.graphics.clear()
        }
        onComplete?.()
      },
    })
  }

  private redraw(graphics: Phaser.GameObjects.Graphics, lineWidth: number, color: number): void {
    if (lineWidth <= 0) {
      graphics.clear()
      return
    }
    const points = sampleCircularArc(this.arc)
    const firstPoint = points[0]
    if (!firstPoint) return
    graphics.clear()
    graphics.lineStyle(lineWidth, color, 1)
    graphics.beginPath()
    graphics.moveTo(firstPoint.x, firstPoint.y)
    points.slice(1).forEach((point) => graphics.lineTo(point.x, point.y))
    graphics.strokePath()
  }
}
