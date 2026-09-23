import Phaser from "phaser"
import { createTileAsterisk, createTileLetter, GAME_PRESENTATION, SPLASH_PRESENTATION } from "./board/tileVisuals"

export type LetterVisualMode = "asterisk" | "character"

/** A moving letter whose visible representation can change without changing its position. */
export class LetterVisual {
  readonly container: Phaser.GameObjects.Container
  readonly text: Phaser.GameObjects.Text
  private readonly asterisk: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene, character: string, center: { x: number; y: number }) {
    this.container = scene.add.container(center.x, center.y).setDepth(10)
    this.text = createTileLetter(scene, { x: 0, y: 0 }, character, GAME_PRESENTATION).setDepth(0)
    this.asterisk = createTileAsterisk(scene, { x: 0, y: 0 }, SPLASH_PRESENTATION).setDepth(0)
    this.container.add([this.text, this.asterisk])
    this.setMode("character")
  }

  setPosition(x: number, y: number): this {
    this.container.setPosition(x, y)
    return this
  }

  setScale(scale: number): this {
    this.container.setScale(scale)
    return this
  }

  setAlpha(alpha: number): this {
    this.container.setAlpha(alpha)
    return this
  }

  setMode(mode: LetterVisualMode): this {
    this.text.setAlpha(mode === "character" ? 1 : 0)
    this.asterisk.setAlpha(mode === "asterisk" ? 1 : 0)
    return this
  }

  animateToCharacter(scene: Phaser.Scene, delay: number, duration: number): void {
    this.text.setAlpha(0)
    this.asterisk.setAlpha(1)
    scene.tweens.add({ targets: this.asterisk, alpha: 0, delay, duration, ease: "Sine.InOut" })
    scene.tweens.add({ targets: this.text, alpha: 1, delay, duration, ease: "Sine.InOut" })
  }

  releaseCharacter(): Phaser.GameObjects.Text {
    const x = this.container.x
    const y = this.container.y
    this.container.remove(this.text)
    this.container.destroy(true)
    this.text.setPosition(x, y).setDepth(10).setAlpha(1)
    return this.text
  }
}
