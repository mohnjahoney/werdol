import Phaser from "phaser"
import { RENDER_SCALE } from "../style/rendering"
import { HaloTileRenderer, type LetterTileState, type TileStateRenderer } from "./board/tileStateRenderers"
import { tileBorderColorForTileColor } from "./board/tileVisuals"

export const WERDOL_TITLE_CENTER_X = 215
export const WERDOL_TITLE_HEADER_Y = 58
export const WERDOL_TITLE_SLOT_SPACING = 32
export const WERDOL_TITLE_TILE_SIZE = 32
export const WERDOL_TITLE_TILE_RADIUS = 8

const TITLE_INK = "#211f1a"
const TITLE_YELLOW = 0xc49f52

export type WerdolTitleDisplay = Phaser.GameObjects.Text | Phaser.GameObjects.Container

export interface WerdolTitlePiece {
  character: string
  display: WerdolTitleDisplay
}

export class WerdolTitle {
  readonly container: Phaser.GameObjects.Container
  readonly pieces: WerdolTitlePiece[]
  private readonly tileRenderer: TileStateRenderer
  private readonly titleTile: Phaser.GameObjects.Rectangle

  constructor(
    scene: Phaser.Scene,
    parent?: Phaser.GameObjects.Container,
    tileRenderer: TileStateRenderer = new HaloTileRenderer(),
    initialState: LetterTileState = "unmatched",
  ) {
    this.container = scene.add.container(0, 0)
    if (parent) parent.add(this.container)
    this.tileRenderer = tileRenderer
    const titleTileDisplay = createTitleTile(scene, tileRenderer)
    this.titleTile = titleTileDisplay.getAt(0) as Phaser.GameObjects.Rectangle
    this.pieces = ["W", "E", "R", "D", "O", "L"].map((character) => ({
      character,
      display: character === "O"
        ? titleTileDisplay
        : scene.add.text(0, WERDOL_TITLE_HEADER_Y, character, {
            color: TITLE_INK,
            fontFamily: "'Courier', monospace",
            fontSize: "31px",
            fontStyle: "bold",
            resolution: RENDER_SCALE,
          }).setOrigin(0.5),
    }))
    this.container.add(this.pieces.map((piece) => piece.display))
    if (initialState === "matched") tileRenderer.renderMatchedTile(this.titleTile)
    else tileRenderer.renderUnmatchedTile(this.titleTile)
    this.titleTile.setStrokeStyle(initialState === "unmatched" ? 1 : 0, tileBorderColorForTileColor(this.titleTile.fillColor))
    this.setHeaderLayout()
  }

  slotPosition(slotIndex: number, y = WERDOL_TITLE_HEADER_Y, spacing = WERDOL_TITLE_SLOT_SPACING): { x: number; y: number } {
    return { x: WERDOL_TITLE_CENTER_X + (slotIndex - 2.5) * spacing, y }
  }

  setPiecePosition(pieceIndex: number, slotIndex: number, y = WERDOL_TITLE_HEADER_Y, scale = 1): void {
    const piece = this.pieces[pieceIndex]
    if (!piece) return
    const position = this.slotPosition(slotIndex, y)
    piece.display.setPosition(position.x, position.y).setScale(this.displayScale(pieceIndex, scale))
  }

  displayScale(_pieceIndex: number, scale = 1): number {
    return scale
  }

  setTitleTileColor(color: number): void {
    this.titleTile.setFillStyle(color).setStrokeStyle(0, color)
  }

  animateTitleTileState(scene: Phaser.Scene, state: LetterTileState): void {
    this.titleTile.setStrokeStyle(state === "unmatched" ? 1 : 0, tileBorderColorForTileColor(this.titleTile.fillColor))
    this.tileRenderer.animateTileState(scene, this.titleTile, state)
  }

  resetTitleTile(state: LetterTileState = "matched"): void {
    this.tileRenderer.cancelTileAnimation(this.titleTile)
    this.titleTile.setStrokeStyle(state === "unmatched" ? 1 : 0, tileBorderColorForTileColor(this.titleTile.fillColor))
    if (state === "matched") this.tileRenderer.renderMatchedTile(this.titleTile)
    else this.tileRenderer.renderUnmatchedTile(this.titleTile)
  }

  dispose(): void {
    this.tileRenderer.destroy()
  }

  setHeaderLayout(): void {
    this.pieces.forEach((_piece, pieceIndex) => this.setPiecePosition(pieceIndex, pieceIndex))
  }
}

function createTitleTile(scene: Phaser.Scene, renderer: TileStateRenderer): Phaser.GameObjects.Container {
  const display = scene.add.container(0, WERDOL_TITLE_HEADER_Y)
  const tile = renderer.createTile(scene, { x: 0, y: 0 }, TITLE_YELLOW)
  tile.setSize(WERDOL_TITLE_TILE_SIZE, WERDOL_TITLE_TILE_SIZE).setRounded(WERDOL_TITLE_TILE_RADIUS)
  display.add(tile)
  return display
}
