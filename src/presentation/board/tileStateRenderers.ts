import Phaser from "phaser"
import { BOARD_LAYOUT, type BoardPoint } from "./boardLayout"

export type LetterTileState = "matched" | "unmatched"
export type TileRendererMode = "shape" | "pulse" | "tilt" | "halo"

export interface TileShape {
  size: number
  cornerRadius: number
}

const NORMAL_CORNER_RADIUS = 14
const TILE_BASE_DEPTH = 2
export const NORMAL_TILE_SHAPE: TileShape = { size: BOARD_LAYOUT.tileSize, cornerRadius: NORMAL_CORNER_RADIUS }
const HALO_THICKNESS = 8
const MATCHED_TILE_SHAPE: TileShape = { size: BOARD_LAYOUT.tileSize, cornerRadius: 0 }
const HALO_UNMATCHED_INNER_SHAPE: TileShape = { size: BOARD_LAYOUT.tileSize - 2 * HALO_THICKNESS, cornerRadius: NORMAL_CORNER_RADIUS - HALO_THICKNESS }
const HALO_UNMATCHED_OUTER_SHAPE: TileShape = { size: BOARD_LAYOUT.tileSize, cornerRadius: NORMAL_CORNER_RADIUS }
const HALO_OUTER_ALPHA = 0.4
const HALO_HIDDEN_ALPHA = 0
const HALO_MATCHED_OVERSHOOT_SIZE = 12
const HALO_MATCHED_OVERSHOOT_RADIUS = 6
const HALO_MATCHED_INNER_DURATION = 500
const HALO_MATCHED_OVERSHOOT_DURATION = 200
const HALO_MATCHED_SETTLE_DURATION = 400
const HALO_UNMATCHED_INNER_DURATION = 260
const HALO_UNMATCHED_OUTER_FADE_DURATION = 360

export interface TileStateRenderer {
  createTile(scene: Phaser.Scene, center: BoardPoint, fillColor: number): Phaser.GameObjects.Rectangle
  syncTilePosition(tile: Phaser.GameObjects.Rectangle | undefined): void
  syncTileRevealAlpha?(tile: Phaser.GameObjects.Rectangle | undefined, alpha: number): void
  renderMatchedTile(tile: Phaser.GameObjects.Rectangle | undefined): void
  renderUnmatchedTile(tile: Phaser.GameObjects.Rectangle | undefined): void
  animateTileState(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle | undefined, state: LetterTileState): void
  cancelTileAnimation(tile: Phaser.GameObjects.Rectangle | undefined): void
  resetTileEffects(tile: Phaser.GameObjects.Rectangle | undefined): void
  destroy(): void
}

function createRendererTile(scene: Phaser.Scene, center: BoardPoint, fillColor: number): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(center.x, center.y, NORMAL_TILE_SHAPE.size, NORMAL_TILE_SHAPE.size, fillColor)
    .setOrigin(0.5)
    .setStrokeStyle(BOARD_LAYOUT.tileBorderWidth, fillColor)
    .setRounded(NORMAL_TILE_SHAPE.cornerRadius)
    .setDepth(TILE_BASE_DEPTH)
}

export function renderTileState(renderer: TileStateRenderer, tile: Phaser.GameObjects.Rectangle | undefined, state: LetterTileState): void {
  if (state === "matched") renderer.renderMatchedTile(tile)
  else renderer.renderUnmatchedTile(tile)
}

const UNMATCHED_TILE_RADIUS = NORMAL_TILE_SHAPE.cornerRadius
const MATCHED_TILE_RADIUS = MATCHED_TILE_SHAPE.cornerRadius
const MATCHED_TRANSITION_DURATION = 500
const MATCHED_TRANSITION_DELAY = 100
const MATCHED_TRANSITION_MARK_STROKE = 2
const MATCHED_TRANSITION_MARK_COLOR = 0xfffdf7
const MATCHED_TRANSITION_MARK_START_FRACTION = 0.25
const MATCHED_TRANSITION_MARK_FADE_END = 0.8

/** The original WERDOL tile renderer: unmatched tiles are rounded, matched tiles square. */
export class ShapeTileRenderer implements TileStateRenderer {
  private readonly matchedAppearance = MATCHED_TILE_SHAPE
  private readonly unmatchedAppearance = NORMAL_TILE_SHAPE
  private readonly radiusByTile = new WeakMap<Phaser.GameObjects.Rectangle, number>()
  private readonly squareByTile = new Map<Phaser.GameObjects.Rectangle, Phaser.GameObjects.Rectangle>()
  private readonly tweenByTile = new Map<Phaser.GameObjects.Rectangle, Phaser.Tweens.Tween>()
  private readonly targetByTile = new WeakMap<Phaser.GameObjects.Rectangle, boolean>()

  createTile(scene: Phaser.Scene, center: BoardPoint, fillColor: number): Phaser.GameObjects.Rectangle {
    return createRendererTile(scene, center, fillColor)
  }

  syncTilePosition(_tile: Phaser.GameObjects.Rectangle | undefined): void {}

  renderMatchedTile(tile: Phaser.GameObjects.Rectangle | undefined): void {
    this.renderShape(tile, this.matchedAppearance)
  }

  renderUnmatchedTile(tile: Phaser.GameObjects.Rectangle | undefined): void {
    this.renderShape(tile, this.unmatchedAppearance)
  }

  private renderShape(tile: Phaser.GameObjects.Rectangle | undefined, appearance: TileShape): void {
    if (!tile) return
    tile.setRounded(appearance.cornerRadius)
    this.radiusByTile.set(tile, appearance.cornerRadius)
    this.targetByTile.set(tile, appearance.cornerRadius === this.matchedAppearance.cornerRadius)
  }

  animateTileState(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle | undefined, state: LetterTileState): void {
    if (!tile) return
    const isMatched = state === "matched"
    const targetAppearance = isMatched ? this.matchedAppearance : this.unmatchedAppearance
    const targetRadius = targetAppearance.cornerRadius
    const currentRadius = this.radiusByTile.get(tile) ?? UNMATCHED_TILE_RADIUS
    if (this.targetByTile.get(tile) === isMatched && (this.tweenByTile.has(tile) || currentRadius === targetRadius)) return
    if (currentRadius === targetRadius) return renderTileState(this, tile, state)

    this.cancelTileAnimation(tile)
    this.targetByTile.set(tile, isMatched)
    const square = isMatched ? this.getOrCreateMatchedTransitionMark(scene, tile) : this.squareByTile.get(tile)
    const startSize = tile.width * MATCHED_TRANSITION_MARK_START_FRACTION
    if (isMatched && square) square.setSize(startSize, startSize).setAlpha(0)
    const tween = scene.tweens.addCounter({
      from: currentRadius,
      to: targetRadius,
      delay: MATCHED_TRANSITION_DELAY,
      duration: MATCHED_TRANSITION_DURATION,
      ease: "Cubic.easeInOut",
      onUpdate: (currentTween) => {
        const value = currentTween.getValue() ?? currentRadius
        const progress = Math.min(1, Math.max(0, (value - currentRadius) / (targetRadius - currentRadius)))
        const radius = Math.max(MATCHED_TILE_RADIUS, value)
        tile.setRounded(radius)
        this.radiusByTile.set(tile, radius)
        this.updateMatchedTransitionMark(square, tile, progress, isMatched, startSize)
      },
      onComplete: () => {
        renderTileState(this, tile, state)
        if (square) {
          if (isMatched) square.setSize(tile.width, tile.height).setAlpha(0)
          else square.setSize(startSize, startSize).setAlpha(0)
        }
        this.tweenByTile.delete(tile)
      },
    })
    this.tweenByTile.set(tile, tween)
  }

  cancelTileAnimation(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.tweenByTile.get(tile)?.stop()
    this.tweenByTile.delete(tile)
  }

  resetTileEffects(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.cancelTileAnimation(tile)
    tile.setRounded(this.unmatchedAppearance.cornerRadius)
    this.radiusByTile.set(tile, this.unmatchedAppearance.cornerRadius)
    this.targetByTile.set(tile, false)
    this.squareByTile.get(tile)?.setAlpha(0)
  }

  destroy(): void {
    this.tweenByTile.forEach((tween) => tween.stop())
    this.tweenByTile.clear()
    this.squareByTile.forEach((square) => square.destroy())
    this.squareByTile.clear()
  }

  private getOrCreateMatchedTransitionMark(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle): Phaser.GameObjects.Rectangle {
    const existing = this.squareByTile.get(tile)
    if (existing) return existing
    const parent = tile.parentContainer
    const startSize = tile.width * MATCHED_TRANSITION_MARK_START_FRACTION
    const square = scene.add.rectangle(tile.x, tile.y, startSize, startSize)
      .setOrigin(0.5)
      .setFillStyle(0, 0)
      .setStrokeStyle(MATCHED_TRANSITION_MARK_STROKE, MATCHED_TRANSITION_MARK_COLOR)
      .setAlpha(0)
    if (parent) parent.add(square)
    this.squareByTile.set(tile, square)
    return square
  }

  private updateMatchedTransitionMark(
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
    if (progress <= MATCHED_TRANSITION_MARK_FADE_END) return progress / MATCHED_TRANSITION_MARK_FADE_END
    return (1 - progress) / (1 - MATCHED_TRANSITION_MARK_FADE_END)
  }
}

export function createTileRenderer(): TileStateRenderer {
  return new ShapeTileRenderer()
}

export class PulseTileRenderer implements TileStateRenderer {
  private readonly tweens = new Map<Phaser.GameObjects.Rectangle, Phaser.Tweens.Tween>()

  createTile(scene: Phaser.Scene, center: BoardPoint, fillColor: number): Phaser.GameObjects.Rectangle {
    return createRendererTile(scene, center, fillColor)
  }

  syncTilePosition(_tile: Phaser.GameObjects.Rectangle | undefined): void {}

  renderMatchedTile(tile: Phaser.GameObjects.Rectangle | undefined): void {
    this.renderPulseBase(tile)
  }

  renderUnmatchedTile(tile: Phaser.GameObjects.Rectangle | undefined): void {
    this.renderPulseBase(tile)
  }

  private renderPulseBase(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    tile.setScale(1)
  }

  animateTileState(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle | undefined, state: LetterTileState): void {
    if (!tile) return
    this.cancelTileAnimation(tile)
    tile.setScale(1)
    if (state !== "matched") return
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

  cancelTileAnimation(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.tweens.get(tile)?.stop()
    this.tweens.delete(tile)
    tile.setScale(1)
  }

  resetTileEffects(tile: Phaser.GameObjects.Rectangle | undefined): void {
    this.cancelTileAnimation(tile)
  }

  destroy(): void {
    this.tweens.forEach((tween) => tween.stop())
    this.tweens.clear()
  }
}

export class TiltTileRenderer implements TileStateRenderer {
  private readonly tweens = new Map<Phaser.GameObjects.Rectangle, Phaser.Tweens.Tween>()

  createTile(scene: Phaser.Scene, center: BoardPoint, fillColor: number): Phaser.GameObjects.Rectangle {
    return createRendererTile(scene, center, fillColor)
  }

  syncTilePosition(_tile: Phaser.GameObjects.Rectangle | undefined): void {}

  renderMatchedTile(tile: Phaser.GameObjects.Rectangle | undefined): void {
    this.renderTilt(tile, "matched")
  }

  renderUnmatchedTile(tile: Phaser.GameObjects.Rectangle | undefined): void {
    this.renderTilt(tile, "unmatched")
  }

  private renderTilt(tile: Phaser.GameObjects.Rectangle | undefined, state: LetterTileState): void {
    if (!tile) return
    tile.setAngle(state === "unmatched" ? 45 : 0)
  }

  animateTileState(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle | undefined, state: LetterTileState): void {
    if (!tile) return
    this.cancelTileAnimation(tile)
    const tween = scene.tweens.add({
      targets: tile,
      angle: state === "unmatched" ? 45 : 0,
      duration: 260,
      ease: "Back.Out",
      onComplete: () => this.tweens.delete(tile),
    })
    this.tweens.set(tile, tween)
  }

  cancelTileAnimation(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.tweens.get(tile)?.stop()
    this.tweens.delete(tile)
  }

  resetTileEffects(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.cancelTileAnimation(tile)
    tile.setAngle(0)
  }

  destroy(): void {
    this.tweens.forEach((tween) => tween.stop())
    this.tweens.clear()
  }
}

/** The halo mode uses ordinary Phaser rounded rectangles for each unmatched tile. */
export class HaloTileRenderer implements TileStateRenderer {
  private readonly outerByTile = new Map<Phaser.GameObjects.Rectangle, Phaser.GameObjects.Rectangle>()
  private readonly stateByTile = new WeakMap<Phaser.GameObjects.Rectangle, LetterTileState>()
  private readonly tweensByTile = new WeakMap<Phaser.GameObjects.Rectangle, Phaser.Tweens.Tween[]>()
  private readonly revealAlphaByTile = new WeakMap<Phaser.GameObjects.Rectangle, number>()

  createTile(scene: Phaser.Scene, center: BoardPoint, fillColor: number): Phaser.GameObjects.Rectangle {
    return createRendererTile(scene, center, fillColor)
  }

  syncTilePosition(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.outerByTile.get(tile)?.setPosition(tile.x, tile.y)
  }

  syncTileRevealAlpha(tile: Phaser.GameObjects.Rectangle | undefined, alpha: number): void {
    if (!tile) return
    this.revealAlphaByTile.set(tile, alpha)
    this.outerByTile.get(tile)?.setAlpha(alpha)
  }

  renderMatchedTile(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.outerByTile.get(tile)?.setVisible(false)
    tile.setDepth(0)
      .setSize(NORMAL_TILE_SHAPE.size, NORMAL_TILE_SHAPE.size)
      .setRounded(NORMAL_TILE_SHAPE.cornerRadius)
    tile.setVisible(true)
    this.stateByTile.set(tile, "matched")
  }

  renderUnmatchedTile(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    const innerShape = HALO_UNMATCHED_INNER_SHAPE
    const outerShape = HALO_UNMATCHED_OUTER_SHAPE
    const outer = this.outerFor(tile)
    outer.setPosition(tile.x, tile.y)
      .setAlpha(this.revealAlphaFor(tile))
      .setSize(outerShape.size, outerShape.size)
      .setRounded(outerShape.cornerRadius)
      .setFillStyle(tile.fillColor, HALO_OUTER_ALPHA)
      .setDepth(tile.depth - 1)
      .setVisible(true)
    tile.setSize(innerShape.size, innerShape.size)
      .setRounded(innerShape.cornerRadius)
      .setDepth(outer.depth + 1)
    tile.setVisible(true)
    this.stateByTile.set(tile, "unmatched")
  }

  animateTileState(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle | undefined, state: LetterTileState): void {
    if (!tile) return
    const currentState = this.stateByTile.get(tile)
    if (currentState === undefined) {
      renderTileState(this, tile, state)
      return
    }
    if (currentState === state) {
      renderTileState(this, tile, state)
      return
    }
    this.cancelTileAnimation(tile)
    this.stateByTile.set(tile, state)
    if (state === "matched") this.animateToMatched(scene, tile)
    else this.animateToUnmatched(scene, tile)
  }

  cancelTileAnimation(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.tweensByTile.get(tile)?.forEach((tween) => tween.stop())
    this.tweensByTile.delete(tile)
  }

  resetTileEffects(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.renderMatchedTile(tile)
  }

  destroy(): void {
    this.outerByTile.forEach((_outer, tile) => this.cancelTileAnimation(tile))
    this.outerByTile.forEach((outer) => outer.destroy())
    this.outerByTile.clear()
  }

  private animateToMatched(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle): void {
    const outer = this.outerFor(tile)
    const inner = { size: tile.width, radius: tile.radius }
    const outerShape = { size: HALO_UNMATCHED_OUTER_SHAPE.size, radius: HALO_UNMATCHED_OUTER_SHAPE.cornerRadius, alpha: HALO_OUTER_ALPHA }
    outer.setPosition(tile.x, tile.y).setVisible(true).setAlpha(this.revealAlphaFor(tile))
    outer.setSize(outerShape.size, outerShape.size)
      .setRounded(outerShape.radius)
      .setFillStyle(tile.fillColor, outerShape.alpha)

    const innerTween = scene.tweens.add({
      targets: inner,
      size: NORMAL_TILE_SHAPE.size,
      radius: NORMAL_TILE_SHAPE.cornerRadius,
      duration: HALO_MATCHED_INNER_DURATION,
      ease: "Back.InOut",
      onUpdate: () => this.applyTileShape(tile, inner.size, inner.radius),
      onComplete: () => this.applyTileShape(tile, NORMAL_TILE_SHAPE.size, NORMAL_TILE_SHAPE.cornerRadius),
    })
    const overshootTween = scene.tweens.add({
      targets: outerShape,
      size: HALO_UNMATCHED_OUTER_SHAPE.size + HALO_MATCHED_OVERSHOOT_SIZE,
      radius: HALO_UNMATCHED_OUTER_SHAPE.cornerRadius + HALO_MATCHED_OVERSHOOT_RADIUS,
      duration: HALO_MATCHED_OVERSHOOT_DURATION,
      ease: "Back.Out",
      onUpdate: () => this.applyOuterShape(outer, tile, outerShape),
      onComplete: () => {
        const settleTween = scene.tweens.add({
          targets: outerShape,
          size: HALO_UNMATCHED_OUTER_SHAPE.size,
          radius: HALO_UNMATCHED_OUTER_SHAPE.cornerRadius,
          alpha: 0,
          duration: HALO_MATCHED_SETTLE_DURATION,
          ease: "Sine.InOut",
          onUpdate: () => this.applyOuterShape(outer, tile, outerShape),
          onComplete: () => {
            outer.setVisible(false)
            this.tweensByTile.delete(tile)
          },
        })
        this.tweensByTile.set(tile, [innerTween, overshootTween, settleTween])
      },
    })
    this.tweensByTile.set(tile, [innerTween, overshootTween])
  }

  private animateToUnmatched(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle): void {
    const outer = this.outerFor(tile)
    const inner = { size: tile.width, radius: tile.radius }
    const outerShape = { size: HALO_UNMATCHED_OUTER_SHAPE.size, radius: HALO_UNMATCHED_OUTER_SHAPE.cornerRadius, alpha: HALO_HIDDEN_ALPHA }
    outer.setPosition(tile.x, tile.y)
      .setVisible(true)
      .setAlpha(this.revealAlphaFor(tile))
      .setDepth(tile.depth - 1)
    outer.setSize(outerShape.size, outerShape.size)
      .setRounded(outerShape.radius)
      .setFillStyle(tile.fillColor, HALO_HIDDEN_ALPHA)
    const innerTween = scene.tweens.add({
      targets: inner,
      size: HALO_UNMATCHED_INNER_SHAPE.size,
      radius: HALO_UNMATCHED_INNER_SHAPE.cornerRadius,
      duration: HALO_UNMATCHED_INNER_DURATION,
      ease: "Cubic.InOut",
      onUpdate: () => this.applyTileShape(tile, inner.size, inner.radius),
      onComplete: () => this.applyTileShape(tile, HALO_UNMATCHED_INNER_SHAPE.size, HALO_UNMATCHED_INNER_SHAPE.cornerRadius),
    })
    const outerTween = scene.tweens.add({
      targets: outerShape,
      alpha: HALO_OUTER_ALPHA,
      duration: HALO_UNMATCHED_OUTER_FADE_DURATION,
      ease: "Sine.Out",
      onUpdate: () => this.applyOuterShape(outer, tile, outerShape),
      onComplete: () => {
        outerShape.alpha = HALO_OUTER_ALPHA
        this.applyOuterShape(outer, tile, outerShape)
        outer.setVisible(true)
        this.tweensByTile.delete(tile)
      },
    })
    this.tweensByTile.set(tile, [innerTween, outerTween])
  }

  private applyTileShape(tile: Phaser.GameObjects.Rectangle, size: number, radius: number): void {
    tile.setSize(size, size).setRounded(radius)
  }

  private applyOuterShape(outer: Phaser.GameObjects.Rectangle, tile: Phaser.GameObjects.Rectangle, shape: { size: number; radius: number; alpha: number }): void {
    outer.setPosition(tile.x, tile.y)
      .setAlpha(this.revealAlphaFor(tile))
      .setSize(shape.size, shape.size)
      .setRounded(shape.radius)
      .setFillStyle(tile.fillColor, shape.alpha)
      .setDepth(tile.depth - 1)
  }

  private outerFor(tile: Phaser.GameObjects.Rectangle): Phaser.GameObjects.Rectangle {
    const existing = this.outerByTile.get(tile)
    if (existing) return existing
    const outer = tile.scene.add.rectangle(tile.x, tile.y, HALO_UNMATCHED_OUTER_SHAPE.size, HALO_UNMATCHED_OUTER_SHAPE.size, tile.fillColor, HALO_OUTER_ALPHA)
      .setOrigin(0.5)
      .setRounded(HALO_UNMATCHED_OUTER_SHAPE.cornerRadius)
      .setDepth(tile.depth + 1)
      .setVisible(false)
    if (tile.parentContainer) tile.parentContainer.add(outer)
    this.outerByTile.set(tile, outer)
    return outer
  }

  private revealAlphaFor(tile: Phaser.GameObjects.Rectangle): number {
    return this.revealAlphaByTile.get(tile) ?? 1
  }
}

export function createTileRendererForMode(mode: TileRendererMode): TileStateRenderer {
  switch (mode) {
    case "pulse": return new PulseTileRenderer()
    case "tilt": return new TiltTileRenderer()
    case "halo": return new HaloTileRenderer()
    case "shape": return new ShapeTileRenderer()
  }
}
