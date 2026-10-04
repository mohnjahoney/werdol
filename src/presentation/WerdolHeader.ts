import Phaser from "phaser"
import { WerdolTitle } from "./WerdolTitle"
import type { LetterTileState } from "./board/tileStateRenderers"

export function addWerdolHeader(
  scene: Phaser.Scene,
  parent?: Phaser.GameObjects.Container,
  initialState: LetterTileState = "unmatched",
): WerdolTitle {
  const title = new WerdolTitle(scene, parent, undefined, initialState)
  const rule = scene.add.graphics()
  rule.lineStyle(1, 0xc6bdae, 0.9)
  rule.lineBetween(31, 105, 399, 105)
  parent?.add(rule)
  return title
}
