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
// Experiment switches: change these two values to restore the original halo
// behavior without touching the renderer's state/animation logic.
const HALO_MARKED_STATE: LetterTileState = "matched"
const HALO_MIDDLE_COLOR_MODE: "light" | "darkened-tile" = "light"
const MATCHED_TILE_SHAPE: TileShape = { size: BOARD_LAYOUT.tileSize, cornerRadius: 0 }
const HALO_BASE_ALPHA = 1
const HALO_MIDDLE_ALPHA = 0.5
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
  private readonly baseByTile = new Map<Phaser.GameObjects.Rectangle, Phaser.GameObjects.Rectangle>()
  private readonly middleByTile = new Map<Phaser.GameObjects.Rectangle, Phaser.GameObjects.Rectangle>()
  private readonly stateByTile = new WeakMap<Phaser.GameObjects.Rectangle, LetterTileState>()
  private readonly tweensByTile = new WeakMap<Phaser.GameObjects.Rectangle, Phaser.Tweens.Tween[]>()
  private readonly revealAlphaByTile = new WeakMap<Phaser.GameObjects.Rectangle, number>()
  private readonly outerShapeByTile = new WeakMap<Phaser.GameObjects.Rectangle, TileShape>()

  createTile(scene: Phaser.Scene, center: BoardPoint, fillColor: number): Phaser.GameObjects.Rectangle {
    return createRendererTile(scene, center, fillColor)
  }

  syncTilePosition(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.baseByTile.get(tile)?.setPosition(tile.x, tile.y)
    this.middleByTile.get(tile)?.setPosition(tile.x, tile.y)
  }

  syncTileRevealAlpha(tile: Phaser.GameObjects.Rectangle | undefined, alpha: number): void {
    if (!tile) return
    this.revealAlphaByTile.set(tile, alpha)
    this.baseByTile.get(tile)?.setAlpha(alpha)
    this.middleByTile.get(tile)?.setAlpha(alpha)
  }

  renderMatchedTile(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (HALO_MARKED_STATE === "matched") return this.renderHaloTile(tile, "matched")
    this.renderPlainTile(tile, "matched")
  }

  private renderPlainTile(tile: Phaser.GameObjects.Rectangle | undefined, state: LetterTileState): void {
    if (!tile) return
    const outerShape = this.outerShapeFor(tile)
    this.baseByTile.get(tile)?.setVisible(false)
    this.middleByTile.get(tile)?.setVisible(false)
    tile.setDepth(0)
      .setSize(outerShape.size, outerShape.size)
      .setRounded(outerShape.cornerRadius)
    tile.setVisible(true)
    this.stateByTile.set(tile, state)
  }

  renderUnmatchedTile(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (HALO_MARKED_STATE === "unmatched") return this.renderHaloTile(tile, "unmatched")
    this.renderPlainTile(tile, "unmatched")
  }

  private renderHaloTile(tile: Phaser.GameObjects.Rectangle | undefined, state: LetterTileState): void {
    if (!tile) return
    const shapes = this.shapesFor(tile)
    const base = this.baseFor(tile)
    const middle = this.middleFor(tile)
    this.stackLayersBelowTile(tile, base, middle)
    this.applyLayerShape(base, tile, { size: shapes.outer.size, radius: shapes.outer.cornerRadius, alpha: HALO_BASE_ALPHA }, tile.fillColor, tile.depth - 2)
    this.applyLayerShape(middle, tile, { size: shapes.middle.size, radius: shapes.middle.cornerRadius, alpha: HALO_MIDDLE_ALPHA }, this.haloMiddleColor(tile), tile.depth - 1)
    base.setVisible(true)
    middle.setVisible(true)
    tile.setSize(shapes.inner.size, shapes.inner.size)
      .setRounded(shapes.inner.cornerRadius)
      .setDepth(middle.depth + 1)
    tile.setVisible(true)
    this.stateByTile.set(tile, state)
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
    if (state === HALO_MARKED_STATE) this.animateToUnmatched(scene, tile)
    else this.animateToMatched(scene, tile)
  }

  cancelTileAnimation(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.tweensByTile.get(tile)?.forEach((tween) => tween.stop())
    this.tweensByTile.delete(tile)
  }

  resetTileEffects(tile: Phaser.GameObjects.Rectangle | undefined): void {
    if (!tile) return
    this.renderPlainTile(tile, "matched")
  }

  destroy(): void {
    this.baseByTile.forEach((_base, tile) => this.cancelTileAnimation(tile))
    this.baseByTile.forEach((base) => base.destroy())
    this.middleByTile.forEach((middle) => middle.destroy())
    this.baseByTile.clear()
    this.middleByTile.clear()
  }

  private animateToMatched(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle): void {
    const shapes = this.shapesFor(tile)
    const base = this.baseFor(tile)
    const middle = this.middleFor(tile)
    this.stackLayersBelowTile(tile, base, middle)
    const inner = { size: tile.width, radius: tile.radius }
    const baseShape = { size: shapes.outer.size, radius: shapes.outer.cornerRadius, alpha: HALO_BASE_ALPHA }
    const middleShape = { size: shapes.middle.size, radius: shapes.middle.cornerRadius, alpha: HALO_MIDDLE_ALPHA }
    this.applyLayerShape(base, tile, baseShape, tile.fillColor, tile.depth - 2)
    this.applyLayerShape(middle, tile, middleShape, this.haloMiddleColor(tile), tile.depth - 1)
    base.setVisible(true)
    middle.setVisible(true)

    const innerTween = scene.tweens.add({
      targets: inner,
      size: shapes.outer.size,
      radius: shapes.outer.cornerRadius,
      duration: HALO_MATCHED_INNER_DURATION,
      ease: "Back.InOut",
      onUpdate: () => this.applyTileShape(tile, inner.size, inner.radius),
      onComplete: () => this.applyTileShape(tile, shapes.outer.size, shapes.outer.cornerRadius),
    })
    const overshootTween = scene.tweens.add({
      targets: [baseShape, middleShape],
      size: shapes.outer.size + HALO_MATCHED_OVERSHOOT_SIZE,
      radius: shapes.outer.cornerRadius + HALO_MATCHED_OVERSHOOT_RADIUS,
      duration: HALO_MATCHED_OVERSHOOT_DURATION,
      ease: "Back.Out",
      onUpdate: () => this.applyHaloLayers(base, middle, tile, baseShape, middleShape),
      onComplete: () => {
        const settleTween = scene.tweens.add({
          targets: [baseShape, middleShape],
          size: shapes.outer.size,
          radius: shapes.outer.cornerRadius,
          alpha: 0,
          duration: HALO_MATCHED_SETTLE_DURATION,
          ease: "Sine.InOut",
          onUpdate: () => this.applyHaloLayers(base, middle, tile, baseShape, middleShape),
          onComplete: () => {
            base.setVisible(false)
            middle.setVisible(false)
            this.tweensByTile.delete(tile)
          },
        })
        this.tweensByTile.set(tile, [innerTween, overshootTween, settleTween])
      },
    })
    this.tweensByTile.set(tile, [innerTween, overshootTween])
  }

  private animateToUnmatched(scene: Phaser.Scene, tile: Phaser.GameObjects.Rectangle): void {
    const shapes = this.shapesFor(tile)
    const base = this.baseFor(tile)
    const middle = this.middleFor(tile)
    this.stackLayersBelowTile(tile, base, middle)
    const inner = { size: tile.width, radius: tile.radius }
    const baseShape = { size: shapes.outer.size, radius: shapes.outer.cornerRadius, alpha: HALO_HIDDEN_ALPHA }
    const middleShape = { size: shapes.middle.size, radius: shapes.middle.cornerRadius, alpha: HALO_HIDDEN_ALPHA }
    this.applyHaloLayers(base, middle, tile, baseShape, middleShape)
    base.setVisible(true)
    middle.setVisible(true)
    const innerTween = scene.tweens.add({
      targets: inner,
      size: shapes.inner.size,
      radius: shapes.inner.cornerRadius,
      duration: HALO_UNMATCHED_INNER_DURATION,
      ease: "Cubic.InOut",
      onUpdate: () => this.applyTileShape(tile, inner.size, inner.radius),
      onComplete: () => this.applyTileShape(tile, shapes.inner.size, shapes.inner.cornerRadius),
    })
    const layersTween = scene.tweens.add({
      targets: [baseShape, middleShape],
      alpha: (target: { size: number }) => target === baseShape ? HALO_BASE_ALPHA : HALO_MIDDLE_ALPHA,
      duration: HALO_UNMATCHED_OUTER_FADE_DURATION,
      ease: "Sine.Out",
      onUpdate: () => this.applyHaloLayers(base, middle, tile, baseShape, middleShape),
      onComplete: () => {
        baseShape.alpha = HALO_BASE_ALPHA
        middleShape.alpha = HALO_MIDDLE_ALPHA
        this.applyHaloLayers(base, middle, tile, baseShape, middleShape)
        base.setVisible(true)
        middle.setVisible(true)
        this.tweensByTile.delete(tile)
      },
    })
    this.tweensByTile.set(tile, [innerTween, layersTween])
  }

  private applyTileShape(tile: Phaser.GameObjects.Rectangle, size: number, radius: number): void {
    tile.setSize(size, size).setRounded(radius)
  }

  private applyHaloLayers(base: Phaser.GameObjects.Rectangle, middle: Phaser.GameObjects.Rectangle, tile: Phaser.GameObjects.Rectangle, baseShape: HaloLayerShape, middleShape: HaloLayerShape): void {
    this.applyLayerShape(base, tile, baseShape, tile.fillColor, tile.depth - 2)
    this.applyLayerShape(middle, tile, middleShape, this.haloMiddleColor(tile), tile.depth - 1)
  }

  private applyLayerShape(layer: Phaser.GameObjects.Rectangle, tile: Phaser.GameObjects.Rectangle, shape: HaloLayerShape, color: number, depth: number): void {
    layer.setPosition(tile.x, tile.y)
      .setAlpha(this.revealAlphaFor(tile))
      .setSize(shape.size, shape.size)
      .setRounded(shape.radius)
      .setFillStyle(color, shape.alpha)
      .setDepth(depth)
  }

  private stackLayersBelowTile(tile: Phaser.GameObjects.Rectangle, base: Phaser.GameObjects.Rectangle, middle: Phaser.GameObjects.Rectangle): void {
    const container = tile.parentContainer
    if (!container) return
    container.moveBelow(middle, tile)
    container.moveBelow(base, middle)
  }

  private baseFor(tile: Phaser.GameObjects.Rectangle): Phaser.GameObjects.Rectangle {
    const existing = this.baseByTile.get(tile)
    if (existing) return existing
    const outer = this.outerShapeFor(tile)
    const base = tile.scene.add.rectangle(tile.x, tile.y, outer.size, outer.size, tile.fillColor, HALO_BASE_ALPHA)
      .setOrigin(0.5)
      .setRounded(outer.cornerRadius)
      .setDepth(tile.depth - 2)
      .setVisible(false)
    if (tile.parentContainer) tile.parentContainer.add(base)
    this.baseByTile.set(tile, base)
    return base
  }

  private middleFor(tile: Phaser.GameObjects.Rectangle): Phaser.GameObjects.Rectangle {
    const existing = this.middleByTile.get(tile)
    if (existing) return existing
    const middle = this.shapesFor(tile).middle
    const middleLayer = tile.scene.add.rectangle(tile.x, tile.y, middle.size, middle.size, this.haloMiddleColor(tile), HALO_MIDDLE_ALPHA)
      .setOrigin(0.5)
      .setRounded(middle.cornerRadius)
      .setDepth(tile.depth - 1)
      .setVisible(false)
    if (tile.parentContainer) tile.parentContainer.add(middleLayer)
    this.middleByTile.set(tile, middleLayer)
    return middleLayer
  }

  private outerShapeFor(tile: Phaser.GameObjects.Rectangle): TileShape {
    const existing = this.outerShapeByTile.get(tile)
    if (existing) return existing
    const shape = { size: tile.width, cornerRadius: tile.radius }
    this.outerShapeByTile.set(tile, shape)
    return shape
  }

  private shapesFor(tile: Phaser.GameObjects.Rectangle): { outer: TileShape; middle: TileShape; inner: TileShape } {
    const outer = this.outerShapeFor(tile)
    const inner = {
      size: Math.max(0, outer.size - 2 * HALO_THICKNESS),
      cornerRadius: Math.max(0, outer.cornerRadius - HALO_THICKNESS),
    }
    return {
      outer,
      inner,
      middle: {
        size: (inner.size + outer.size) / 2,
        cornerRadius: (inner.cornerRadius + outer.cornerRadius) / 2,
      },
    }
  }

  private revealAlphaFor(tile: Phaser.GameObjects.Rectangle): number {
    return this.revealAlphaByTile.get(tile) ?? 1
  }

  private haloMiddleColor(tile: Phaser.GameObjects.Rectangle): number {
    if (HALO_MIDDLE_COLOR_MODE === "darkened-tile") return darkenColor(tile.fillColor)
    return 0xffffff
  }

}

function darkenColor(color: number, factor = 0.68): number {
  const red = Math.round(((color >> 16) & 0xff) * factor)
  const green = Math.round(((color >> 8) & 0xff) * factor)
  const blue = Math.round((color & 0xff) * factor)
  return (red << 16) | (green << 8) | blue
}

interface HaloLayerShape {
  size: number
  radius: number
  alpha: number
}

export function createTileRendererForMode(mode: TileRendererMode): TileStateRenderer {
  switch (mode) {
    case "pulse": return new PulseTileRenderer()
    case "tilt": return new TiltTileRenderer()
    case "halo": return new HaloTileRenderer()
    case "shape": return new ShapeTileRenderer()
  }
}
