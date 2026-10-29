import Phaser from "phaser"
import { MainScene } from "./scenes/MainScene"
import { RENDER_SIZE } from "./style/rendering"
import { installDemoHelpers } from "./demo"
import "./styles.css"

installDemoHelpers()

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  width: RENDER_SIZE.width,
  height: RENDER_SIZE.height,
  backgroundColor: "#f3eedf",
  scene: [MainScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: RENDER_SIZE.width,
    height: RENDER_SIZE.height,
  },
  render: { antialias: true, roundPixels: false },
  input: { keyboard: true, mouse: true, touch: true },
  dom: { createContainer: true },
}

new Phaser.Game(config)
