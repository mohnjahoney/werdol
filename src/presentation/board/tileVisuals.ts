import Phaser from "phaser"
import type { LetterResult } from "../../core/evaluateGuess"
import { RENDER_SCALE } from "../../style/rendering"
import { BOARD_LAYOUT, type BoardPoint } from "./boardLayout"
import { renderTileState, type LetterTileState, type TileStateRenderer } from "./tileStateRenderers"

export type PresentationMode = "splash" | "game" | "review"

export interface BoardPresentation {
  mode: PresentationMode
  showAsterisks: boolean
  showLetters: boolean
  showEvaluation: boolean
  interactive: boolean
}

export const SPLASH_PRESENTATION: BoardPresentation = {
  mode: "splash",
  showAsterisks: true,
  showLetters: false,
  showEvaluation: true,
  interactive: false,
}

export const GAME_PRESENTATION: BoardPresentation = {
  mode: "game",
  showAsterisks: false,
  showLetters: true,
  showEvaluation: true,
  interactive: true,
}

export const REVIEW_PRESENTATION: BoardPresentation = {
  mode: "review",
  showAsterisks: false,
  showLetters: true,
  showEvaluation: true,
  interactive: false,
}

export const TILE_COLORS = {
  paper: 0xf3eedf,
  ink: "#211f1a",
  empty: 0xe9e2d3,
  absent: 0xaaa396,
  present: 0xc49f52,
  correct: 0x71845f,
} as const

export function createTileLetter(
  scene: Phaser.Scene,
  center: BoardPoint,
  letter: string,
  presentation: BoardPresentation,
): Phaser.GameObjects.Text {
  return scene.add.text(center.x, center.y, letter, {
    color: "#fffdf7",
    fontFamily: "Arial, sans-serif",
    fontSize: `${BOARD_LAYOUT.letterFontSize}px`,
    fontStyle: "bold",
    resolution: RENDER_SCALE,
  }).setOrigin(0.5).setDepth(10).setAlpha(presentation.showLetters ? 1 : 0)
}

export function createTileAsterisk(
  scene: Phaser.Scene,
  center: BoardPoint,
  presentation: BoardPresentation,
): Phaser.GameObjects.Text {
  return scene.add.text(center.x, center.y, "*", {
    color: TILE_COLORS.ink,
    fontFamily: "Arial, sans-serif",
    fontSize: "28px",
    fontStyle: "bold",
    resolution: RENDER_SCALE,
  }).setOrigin(0.5).setDepth(10).setAlpha(presentation.showAsterisks ? 1 : 0)
}

export function applyTileEvaluation(
  scene: Phaser.Scene,
  background: Phaser.GameObjects.Rectangle | undefined,
  result: LetterResult,
  presentation: BoardPresentation,
  renderer: TileStateRenderer,
  animateMark = false,
): void {
  if (!background || !presentation.showEvaluation) return
  const color = tileColor(result)
  background.setFillStyle(color).setStrokeStyle(1.5, color)
  const state: LetterTileState = result === "correct" ? "matched" : "unmatched"
  if (animateMark) renderer.animateTileState(scene, background, state)
  else renderTileState(renderer, background, state)
}

export function tileColor(result: LetterResult): number {
  return TILE_COLORS[result]
}
