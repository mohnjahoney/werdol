import Phaser from "phaser"
import { WerdolTitle } from "./WerdolTitle"

export function addWerdolHeader(scene: Phaser.Scene, parent?: Phaser.GameObjects.Container): WerdolTitle {
  const title = new WerdolTitle(scene, parent)
  const rule = scene.add.graphics()
  rule.lineStyle(1, 0xc6bdae, 0.9)
  rule.lineBetween(31, 105, 399, 105)
  parent?.add(rule)
  return title
}
