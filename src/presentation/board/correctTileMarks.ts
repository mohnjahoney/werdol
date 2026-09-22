import Phaser from "phaser"

export type CorrectTileFeedbackState = "correct" | "incorrect"
export type CorrectTileFeedbackMode = "shape" | "notch" | "stamp" | "pulse" | "tilt" | "focus"

export interface CorrectTileFeedback {
  mark(tile: Phaser.GameObjects.Rectangle | undefined, state: CorrectTileFeedbackState): void
  animate(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle | undefined, state: CorrectTileFeedbackState): void
  stop(tile: Phaser.GameObjects.Rectangle | undefined): void
  reset(tile: Phaser.GameObjects.Rectangle | undefined): void
}

const INCORRECT_TILE_RADIUS = 18
const CORRECT_TILE_RADIUS = 0
const CORRECT_TILE_MARK_DURATION = 500
const CORRECT_TILE_MARK_DELAY = 100
const CORRECT_TILE_MARK_STROKE = 2
const CORRECT_TILE_MARK_COLOR = 0xfffdf7
const CORRECT_TILE_MARK_START_FRACTION = 0.25
const CORRECT_TILE_MARK_FADE_END = 0.8

/** The original WERDOL feedback: incorrect tiles are rounded, correct tiles square. */
export class ShapeCorrectTileFeedback implements CorrectTileFeedback {
  private readonly radiusByTile = new WeakMap<Phaser.GameObjects.Rectangle, number>()
  private readonly squareByTile = new WeakMap<Phaser.GameObjects.Rectangle, Phaser.GameObjects.Rectangle>()
  private readonly tweenByTile = new WeakMap<Phaser.GameObjects.Rectangle, Phaser.Tweens.Tween>()
  private readonly targetByTile = new WeakMap<Phaser.GameObjects.Rectangle, boolean>()

  mark(tile: Phaser.GameObjects.Rectangle | undefined, state: CorrectTileFeedbackState): void {
    if (!tile) return
    const isCorrect = state === "correct"
    const radius = isCorrect ? CORRECT_TILE_RADIUS : INCORRECT_TILE_RADIUS
    tile.setRounded(radius)
    this.radiusByTile.set(tile, radius)
    this.targetByTile.set(tile, isCorrect)
  }

  animate(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle | undefined, state: CorrectTileFeedbackState): void {
    if (!tile) return
    const isCorrect = state === "correct"
    const targetRadius = isCorrect ? CORRECT_TILE_RADIUS : INCORRECT_TILE_RADIUS
    const currentRadius = this.radiusByTile.get(tile) ?? INCORRECT_TILE_RADIUS
    if (this.targetByTile.get(tile) === isCorrect && (this.tweenByTile.has(tile) || currentRadius === targetRadius)) return
    if (currentRadius === targetRadius) return this.mark(tile, state)

    this.stop(tile)
    this.targetByTile.set(tile, isCorrect)
    const square = isCorrect ? this.getOrCreateCorrectMark(scene, tile) : this.squareByTile.get(tile)
    const startSize = tile.width * CORRECT_TILE_MARK_START_FRACTION
    if (isCorrect && square) square.setSize(startSize, startSize).setAlpha(0)
    const tween = scene.tweens.addCounter({
      from: currentRadius,
      to: targetRadius,
      delay: CORRECT_TILE_MARK_DELAY,
      duration: CORRECT_TILE_MARK_DURATION,
      ease: "Cubic.easeInOut",
      onUpdate: (currentTween) => {
        const value = currentTween.getValue() ?? currentRadius
        const progress = Math.min(1, Math.max(0, (value - currentRadius) / (targetRadius - currentRadius)))
        const radius = Math.max(CORRECT_TILE_RADIUS, value)
        tile.setRounded(radius)
        this.radiusByTile.set(tile, radius)
        this.updateCorrectMarkSquare(square, tile, progress, isCorrect, startSize)
      },
      onComplete: () => {
        this.mark(tile, state)
        if (square) {
          if (isCorrect) square.setSize(tile.width, tile.height).setAlpha(0)
          else square.setSize(startSize, startSize).setAlpha(0)
        }
        this.tweenByTile.delete(tile)
      },
    })
    this.tweenByTile.set(tile, tween)
  }

  stop(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.tweenByTile.get(tile)?.stop()
    this.tweenByTile.delete(tile)
  }

  reset(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.stop(tile)
    tile.setRounded(INCORRECT_TILE_RADIUS)
    this.radiusByTile.set(tile, INCORRECT_TILE_RADIUS)
    this.targetByTile.set(tile, false)
    this.squareByTile.get(tile)?.setAlpha(0)
  }

  private getOrCreateCorrectMark(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle): Phaser.GameObjects.Rectangle {
    const existing = this.squareByTile.get(tile)
    if (existing) return existing
    const parent = tile.parentContainer
    const startSize = tile.width * CORRECT_TILE_MARK_START_FRACTION
    const square = scene.add.rectangle(tile.x, tile.y, startSize, startSize)
      .setOrigin(0.5)
      .setFillStyle(0, 0)
      .setStrokeStyle(CORRECT_TILE_MARK_STROKE, CORRECT_TILE_MARK_COLOR)
      .setAlpha(0)
    if (parent) parent.add(square)
    this.squareByTile.set(tile, square)
    return square
  }

  private updateCorrectMarkSquare(
    square: Phaser.GameObjects.Rectangle | undefined,
    tile: Phaser.GameObjects.Rectangle,
    progress: number,
    expanding: boolean,
    startSize: number,
  ): void {
    if (!square) return
    const squareProgress = expanding ? progress : 1 - progress
    const size = startSize + (tile.width - startSize) * squareProgress
    const opacity = expanding ? this.expandingSquareOpacity(progress) : 1 - progress
    square.setSize(size, size).setAlpha(opacity)
  }

  private expandingSquareOpacity(progress: number): number {
    if (progress <= CORRECT_TILE_MARK_FADE_END) return progress / CORRECT_TILE_MARK_FADE_END
    return (1 - progress) / (1 - CORRECT_TILE_MARK_FADE_END)
  }
}

export function createCorrectTileFeedback(): CorrectTileFeedback {
  return new ShapeCorrectTileFeedback()
}

abstract class CornerMarkFeedback implements CorrectTileFeedback {
  private readonly markers = new WeakMap<Phaser.GameObjects.Rectangle, Phaser.GameObjects.Graphics>()
  private readonly tweens = new WeakMap<Phaser.GameObjects.Rectangle, Phaser.Tweens.Tween>()

  constructor(private readonly kind: "notch" | "stamp") {}

  mark(tile: Phaser.GameObjects.Rectangle | undefined, state: CorrectTileFeedbackState): void {
    if (!tile) return
    const marker = this.markerFor(tile)
    marker.setAlpha(state === "correct" ? 1 : 0)
  }

  animate(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle | undefined, state: CorrectTileFeedbackState): void {
    if (!tile) return
    const marker = this.markerFor(tile)
    this.stop(tile)
    if (state === "incorrect") {
      marker.setAlpha(0)
      return
    }
    marker.setAlpha(0).setScale(0.4)
    const tween = scene.tweens.add({
      targets: marker,
      alpha: 1,
      scale: 1,
      duration: 320,
      ease: "Back.Out",
      onComplete: () => this.tweens.delete(tile),
    })
    this.tweens.set(tile, tween)
  }

  stop(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.tweens.get(tile)?.stop()
    this.tweens.delete(tile)
  }

  reset(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.stop(tile)
    this.markers.get(tile)?.setAlpha(0)
  }

  private markerFor(tile: Phaser.GameObjects.Rectangle): Phaser.GameObjects.Graphics {
    const existing = this.markers.get(tile)
    if (existing) return existing
    const marker = tile.scene.add.graphics().setPosition(tile.x, tile.y)
    marker.setDepth(tile.depth + 1)
    marker.fillStyle(0xfffdf7, 1)
    if (this.kind === "notch") {
      marker.fillTriangle(tile.width / 2 - 2, -tile.height / 2 + 2, tile.width / 2 - 14, -tile.height / 2 + 2, tile.width / 2 - 2, -tile.height / 2 + 14)
    } else {
      marker.fillCircle(tile.width / 2 - 10, -tile.height / 2 + 10, 4)
      marker.lineStyle(1.5, 0xfffdf7, 1)
      marker.strokeCircle(tile.width / 2 - 10, -tile.height / 2 + 10, 7)
    }
    marker.setAlpha(0)
    if (tile.parentContainer) tile.parentContainer.add(marker)
    this.markers.set(tile, marker)
    return marker
  }
}

export class NotchCorrectTileFeedback extends CornerMarkFeedback {
  constructor() { super("notch") }
}

export class StampCorrectTileFeedback extends CornerMarkFeedback {
  constructor() { super("stamp") }
}

export class PulseCorrectTileFeedback implements CorrectTileFeedback {
  private readonly tweens = new WeakMap<Phaser.GameObjects.Rectangle, Phaser.Tweens.Tween>()

  mark(tile: Phaser.GameObjects.Rectangle | undefined, _state: CorrectTileFeedbackState): void {
    if (!tile) return
    tile.setScale(1)
  }

  animate(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle | undefined, state: CorrectTileFeedbackState): void {
    if (!tile) return
    this.stop(tile)
    tile.setScale(1)
    if (state !== "correct") return
    const tween = scene.tweens.add({
      targets: tile,
      scale: 1.1,
      duration: 240,
      yoyo: true,
      ease: "Sine.InOut",
      onComplete: () => this.tweens.delete(tile),
    })
    this.tweens.set(tile, tween)
  }

  stop(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.tweens.get(tile)?.stop()
    this.tweens.delete(tile)
    tile.setScale(1)
  }

  reset(tile: Phaser.GameObjects.Rectangle | undefined): void {
    this.stop(tile)
  }
}

export class TiltCorrectTileFeedback implements CorrectTileFeedback {
  private readonly tweens = new WeakMap<Phaser.GameObjects.Rectangle, Phaser.Tweens.Tween>()

  mark(tile: Phaser.GameObjects.Rectangle | undefined, state: CorrectTileFeedbackState): void {
    if (!tile) return
    tile.setAngle(state === "incorrect" ? 45 : 0)
  }

  animate(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle | undefined, state: CorrectTileFeedbackState): void {
    if (!tile) return
    this.stop(tile)
    const tween = scene.tweens.add({
      targets: tile,
      angle: state === "incorrect" ? 45 : 0,
      duration: 260,
      ease: "Back.Out",
      onComplete: () => this.tweens.delete(tile),
    })
    this.tweens.set(tile, tween)
  }

  stop(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.tweens.get(tile)?.stop()
    this.tweens.delete(tile)
  }

  reset(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.stop(tile)
    tile.setAngle(0)
  }
}

export class FocusCorrectTileFeedback implements CorrectTileFeedback {
  private readonly halos = new WeakMap<Phaser.GameObjects.Rectangle, Phaser.GameObjects.Rectangle[]>()
  private readonly tweens = new WeakMap<Phaser.GameObjects.Rectangle, Phaser.Tweens.Tween>()

  mark(tile: Phaser.GameObjects.Rectangle | undefined, state: CorrectTileFeedbackState): void {
    if (!tile) return
    const halos = this.halosFor(tile)
    halos.forEach((halo) => halo.setAlpha(state === "incorrect" ? 1 : 0))
  }

  animate(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle | undefined, state: CorrectTileFeedbackState): void {
    if (!tile) return
    this.stop(tile)
    const halos = this.halosFor(tile)
    if (state === "correct") {
      const tween = scene.tweens.add({
        targets: halos,
        alpha: 0,
        scale: 0.96,
        duration: 360,
        ease: "Sine.Out",
        onComplete: () => this.tweens.delete(tile),
      })
      this.tweens.set(tile, tween)
      return
    }
    halos.forEach((halo) => halo.setAlpha(1).setScale(1))
  }

  stop(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.tweens.get(tile)?.stop()
    this.tweens.delete(tile)
  }

  reset(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.stop(tile)
    this.halos.get(tile)?.forEach((halo) => halo.setAlpha(0).setScale(1))
  }

  private halosFor(tile: Phaser.GameObjects.Rectangle): Phaser.GameObjects.Rectangle[] {
    const existing = this.halos.get(tile)
    if (existing) return existing
    const parent = tile.parentContainer
    const outer = tile.scene.add.rectangle(tile.x, tile.y, tile.width + 14, tile.height + 14)
      .setOrigin(0.5)
      .setFillStyle(0, 0)
      .setStrokeStyle(3, 0xfffdf7, 0.12)
      .setDepth(tile.depth - 1)
    const inner = tile.scene.add.rectangle(tile.x, tile.y, tile.width + 6, tile.height + 6)
      .setOrigin(0.5)
      .setFillStyle(0, 0)
      .setStrokeStyle(2, 0xfffdf7, 0.22)
      .setDepth(tile.depth - 1)
    if (parent) parent.add([outer, inner])
    const result = [outer, inner]
    this.halos.set(tile, result)
    return result
  }
}

export function createCorrectTileFeedbackForMode(mode: CorrectTileFeedbackMode): CorrectTileFeedback {
  switch (mode) {
    case "notch": return new NotchCorrectTileFeedback()
    case "stamp": return new StampCorrectTileFeedback()
    case "pulse": return new PulseCorrectTileFeedback()
    case "tilt": return new TiltCorrectTileFeedback()
    case "focus": return new FocusCorrectTileFeedback()
    case "shape": return new ShapeCorrectTileFeedback()
  }
}
