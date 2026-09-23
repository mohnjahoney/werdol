import Phaser from "phaser"
import { RENDER_SCALE } from "../style/rendering"

export const WERDOL_TITLE_CENTER_X = 215
export const WERDOL_TITLE_HEADER_Y = 58
export const WERDOL_TITLE_SLOT_SPACING = 32
export const WERDOL_TITLE_TILE_SIZE = 32
export const WERDOL_TITLE_TILE_RADIUS = 8

const TITLE_INK = "#211f1a"
const TITLE_YELLOW = 0xc49f52

export type WerdolTitleDisplay = Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle

export interface WerdolTitlePiece {
  character: string
  display: WerdolTitleDisplay
}

export class WerdolTitle {
  readonly container: Phaser.GameObjects.Container
  readonly pieces: WerdolTitlePiece[]

  constructor(scene: Phaser.Scene, parent?: Phaser.GameObjects.Container) {
    this.container = scene.add.container(0, 0)
    if (parent) parent.add(this.container)
    this.pieces = ["W", "E", "R", "D", "O", "L"].map((character) => ({
      character,
      display: character === "O"
        ? scene.add.rectangle(0, WERDOL_TITLE_HEADER_Y, WERDOL_TITLE_TILE_SIZE, WERDOL_TITLE_TILE_SIZE, TITLE_YELLOW)
          .setOrigin(0.5)
          .setRounded(WERDOL_TITLE_TILE_RADIUS)
        : scene.add.text(0, WERDOL_TITLE_HEADER_Y, character, {
            color: TITLE_INK,
            fontFamily: "monospace",
            fontSize: "31px",
            fontStyle: "bold",
            resolution: RENDER_SCALE,
          }).setOrigin(0.5),
    }))
    this.container.add(this.pieces.map((piece) => piece.display))
    this.setHeaderLayout()
  }

  slotPosition(slotIndex: number, y = WERDOL_TITLE_HEADER_Y, spacing = WERDOL_TITLE_SLOT_SPACING): { x: number; y: number } {
    return { x: WERDOL_TITLE_CENTER_X + (slotIndex - 2.5) * spacing, y }
  }

  setPiecePosition(pieceIndex: number, slotIndex: number, y = WERDOL_TITLE_HEADER_Y, scale = 1): void {
    const piece = this.pieces[pieceIndex]
    if (!piece) return
    const position = this.slotPosition(slotIndex, y)
    piece.display.setPosition(position.x, position.y).setScale(scale)
  }

  setHeaderLayout(): void {
    this.pieces.forEach((_piece, pieceIndex) => this.setPiecePosition(pieceIndex, pieceIndex))
  }
}
