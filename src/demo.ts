import { BOARD_LAYOUT, boardSlotCenter } from "./presentation/board/boardLayout"
import { normalizeSeed } from "./core/seededRandom"

/**
 * Demo mode is for recording demo videos (see demo.yaml). It is only on when the
 * URL has `?demo=1`; `&seed=N` pins the puzzle. Everything here is inert otherwise.
 */
const params = typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search)

export const demoMode = params?.get("demo") === "1"

/** The puzzle seed pinned by `?demo=1&seed=N`, if any. */
export function demoSeed(): number | undefined {
  const seed = params?.get("seed")
  return demoMode && seed ? normalizeSeed(Number(seed)) : undefined
}

declare global {
  interface Window {
    __demo?: Record<string, (...args: number[]) => { x: number; y: number; width: number; height: number }>
  }
}

/** Lets the recorder find canvas-drawn things: rects in page pixels from the game's 430x760 layout. */
export function installDemoHelpers(): void {
  if (!demoMode) return
  const logical = (x: number, y: number, width: number, height: number) => {
    const canvas = document.querySelector("#game canvas")?.getBoundingClientRect()
    if (canvas === undefined) throw new Error("The game canvas is not ready")
    const scale = canvas.width / 430
    return { x: canvas.left + x * scale, y: canvas.top + y * scale, width: width * scale, height: height * scale }
  }
  const size = BOARD_LAYOUT.tileSize
  window.__demo = {
    logical,
    slot: (index) => {
      const center = boardSlotCenter(Math.floor(index! / 5), index! % 5)
      return logical(center.x - size / 2, center.y - size / 2, size, size)
    },
    row: (index) => {
      const first = boardSlotCenter(index!, 0)
      const last = boardSlotCenter(index!, 4)
      return logical(first.x - size / 2, first.y - size / 2, last.x - first.x + size, size)
    },
  }
}
