import Phaser from "phaser"
import { WerdolTitle } from "./WerdolTitle"
import type { LetterTileState } from "./board/tileStateRenderers"
import { HEADER_RULE_Y } from "./board/boardLayout"

export function addWerdolHeader(
  scene: Phaser.Scene,
  parent?: Phaser.GameObjects.Container,
  initialState: LetterTileState = "unmatched",
): WerdolTitle {
  const title = new WerdolTitle(scene, parent, undefined, initialState)
  const rule = scene.add.graphics()
  rule.lineStyle(1, 0xc6bdae, 0.9)
  rule.lineBetween(31, HEADER_RULE_Y, 399, HEADER_RULE_Y)
  parent?.add(rule)
  return title
}
