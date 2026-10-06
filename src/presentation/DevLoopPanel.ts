import type { LetterTile } from "../core/board"
import { TILES_PER_ROW } from "../core/board"
import { findBestLoops, type LoopSplit } from "../core/minimumMoves"
import type { WerdolPuzzle } from "../core/puzzle"

// A developer aid: draws the board as a graph of letters, where each arrow is
// one misplaced tile (from the letter it holds to the letter it wants), and
// colours the arrows by the best grouping into loops. A loop of n arrows
// takes n - 1 swaps, so more loops means fewer moves.

const SVG_NS = "http://www.w3.org/2000/svg"
const SIZE = 320
const CENTER = SIZE / 2
const RING_RADIUS = 118
const NODE_RADIUS = 15
const LOOP_STYLES = [
  { minLength: 5, color: "#D4537E", dash: "10 4", label: "loop of 5+" },
  { minLength: 4, color: "#D85A30", dash: "2 3", label: "loop of 4" },
  { minLength: 3, color: "#7F77DD", dash: "6 3", label: "loop of 3" },
  { minLength: 2, color: "#1D9E75", dash: "", label: "pair" },
] as const

interface PanelState {
  puzzleKey: string
  remaining: number
}

let root: HTMLElement | undefined
let previous: PanelState | undefined

const slotName = (slot: number): string => `row ${Math.floor(slot / TILES_PER_ROW) + 1} col ${(slot % TILES_PER_ROW) + 1}`
const styleFor = (length: number) => LOOP_STYLES.find((style) => length >= style.minLength) ?? LOOP_STYLES[LOOP_STYLES.length - 1]!

function expectedLetters(puzzle: WerdolPuzzle): string[] {
  return puzzle.rows.flatMap((row) => [...row.intendedGuess])
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function svgElement(tag: string, attributes: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag)
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)))
  return node
}

function drawGraph(expected: readonly string[], current: readonly string[], split: LoopSplit): SVGElement {
  const svg = svgElement("svg", { viewBox: `0 0 ${SIZE} ${SIZE}`, role: "img", "aria-label": "Letter loops for the current board" })
  const defs = svgElement("defs", {})
  const marker = svgElement("marker", { id: "werdol-loop-arrow", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" })
  marker.append(svgElement("path", { d: "M2 1L8 5L2 9", fill: "none", stroke: "context-stroke", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }))
  defs.append(marker)
  svg.append(defs)

  // Every letter of the puzzle keeps its place on the ring for the whole game.
  const letters = [...new Set(expected)].sort()
  const position = new Map(letters.map((letter, index) => {
    const angle = (index / letters.length) * Math.PI * 2 - Math.PI / 2
    return [letter, { x: CENTER + Math.cos(angle) * RING_RADIUS, y: CENTER + Math.sin(angle) * RING_RADIUS }] as const
  }))
  const loopLengthBySlot = new Map<number, number>()
  split.loops.forEach((loop) => loop.forEach((slot) => loopLengthBySlot.set(slot, loop.length)))

  const busy = new Set<string>()
  const drawnBetween = new Map<string, number>()
  expected.forEach((wanted, slot) => {
    const held = current[slot]
    if (held === undefined || held === wanted) return
    const from = position.get(held)
    const to = position.get(wanted)
    if (!from || !to) return
    busy.add(held)
    busy.add(wanted)
    // Arrows between the same two letters fan out so each stays visible.
    const sameDirection = drawnBetween.get(`${held}>${wanted}`) ?? 0
    drawnBetween.set(`${held}>${wanted}`, sameDirection + 1)
    const bend = 12 + sameDirection * 16
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy) || 1
    const control = { x: (from.x + to.x) / 2 - (dy / length) * bend, y: (from.y + to.y) / 2 + (dx / length) * bend }
    const edgePoint = (node: { x: number; y: number }) => {
      const towards = Math.hypot(control.x - node.x, control.y - node.y) || 1
      return { x: node.x + ((control.x - node.x) / towards) * (NODE_RADIUS + 2), y: node.y + ((control.y - node.y) / towards) * (NODE_RADIUS + 2) }
    }
    const start = edgePoint(from)
    const end = edgePoint(to)
    const style = styleFor(loopLengthBySlot.get(slot) ?? 2)
    const path = svgElement("path", {
      d: `M${start.x.toFixed(1)} ${start.y.toFixed(1)} Q${control.x.toFixed(1)} ${control.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
      fill: "none",
      stroke: style.color,
      "stroke-width": 1.6,
      "stroke-dasharray": style.dash,
      "marker-end": "url(#werdol-loop-arrow)",
    })
    const title = svgElement("title", {})
    title.textContent = `${held} at ${slotName(slot)} wants ${wanted}`
    path.append(title)
    svg.append(path)
  })

  letters.forEach((letter) => {
    const point = position.get(letter)!
    const group = svgElement("g", { opacity: busy.has(letter) ? 1 : 0.3 })
    group.append(svgElement("circle", { cx: point.x, cy: point.y, r: NODE_RADIUS, fill: "#f3eedf", stroke: "#756d5e", "stroke-width": 1 }))
    const label = svgElement("text", { x: point.x, y: point.y, "text-anchor": "middle", "dominant-baseline": "central", "font-family": "Arial, sans-serif", "font-size": 13, "font-weight": 700, fill: "#211f1a" })
    label.textContent = letter
    group.append(label)
    svg.append(group)
  })
  return svg
}

function describeLoop(loop: readonly number[], current: readonly string[]): string {
  const letters = loop.map((slot) => current[slot]).join(" → ")
  if (loop.length === 2) return `Pair ${letters}: swap ${slotName(loop[0]!)} with ${slotName(loop[1]!)}`
  return `Loop of ${loop.length} (${letters}): ${loop.length - 1} moves, starting ${slotName(loop[0]!)}`
}

/** Finds a swap that brings the board one move closer, preferring the one that lights the most tiles. */
function bestSwap(puzzle: WerdolPuzzle, expected: readonly string[], tiles: readonly LetterTile[], remaining: number): string {
  let best: { first: number; second: number; lit: number } | undefined
  const misplaced = expected.map((_wanted, slot) => slot).filter((slot) => tiles[slot]?.letter !== expected[slot])
  for (const first of misplaced) {
    for (const second of misplaced) {
      if (second <= first || tiles[first]!.letter === tiles[second]!.letter) continue
      const next = [...tiles]
      next[first] = tiles[second]!
      next[second] = tiles[first]!
      if (findBestLoops(puzzle, next).moves !== remaining - 1) continue
      const lit = (next[first]!.letter === expected[first] ? 1 : 0) + (next[second]!.letter === expected[second] ? 1 : 0)
      if (!best || lit > best.lit) best = { first, second, lit }
    }
  }
  if (!best) return "No move needed."
  const effect = best.lit === 0 ? "lights nothing, but splits a loop" : `lights ${best.lit}`
  return `Swap ${slotName(best.first)} (${tiles[best.first]!.letter}) with ${slotName(best.second)} (${tiles[best.second]!.letter}): ${effect}.`
}

/** Shows or refreshes the panel for the board as it stands. Pass `afterMove` when a swap has just been made. */
export function updateDevLoopPanel(puzzle: WerdolPuzzle, tiles: readonly LetterTile[], afterMove = false): void {
  if (typeof document === "undefined") return
  const expected = expectedLetters(puzzle)
  const current = tiles.slice(0, expected.length).map((tile) => tile.letter)
  const split = findBestLoops(puzzle, tiles)
  const puzzleKey = `${puzzle.target}|${expected.join("")}`
  const misplaced = expected.filter((wanted, slot) => current[slot] !== wanted).length

  let verdict = "Each arrow is a misplaced tile: from the letter it holds to the letter it wants."
  if (afterMove && previous?.puzzleKey === puzzleKey) {
    const change = split.moves - previous.remaining
    if (change < 0) verdict = "Good move: one step closer."
    else if (change === 0) verdict = "Wasted move: no closer than before (costs 1)."
    else verdict = "Costly move: it joined two loops (costs 2)."
  }
  previous = { puzzleKey, remaining: split.moves }

  if (!root) {
    root = element("aside", "werdol-dev-loops")
    document.body.append(root)
  }
  const wasCollapsed = root.classList.contains("collapsed")
  root.replaceChildren()
  root.classList.toggle("collapsed", wasCollapsed)

  const header = element("div", "werdol-dev-loops-header")
  header.append(element("strong", "", "Loops"))
  const toggle = element("button", "", wasCollapsed ? "show" : "hide")
  toggle.type = "button"
  toggle.addEventListener("click", () => {
    const collapsed = root?.classList.toggle("collapsed") ?? false
    toggle.textContent = collapsed ? "show" : "hide"
  })
  header.append(toggle)
  root.append(header)

  const body = element("div", "werdol-dev-loops-body")
  body.append(element("p", "werdol-dev-loops-count", `${misplaced} misplaced − ${split.loops.length} loops = ${split.moves} moves to finish`))
  body.append(element("p", afterMove ? "werdol-dev-loops-verdict strong" : "werdol-dev-loops-verdict", verdict))
  body.append(drawGraph(expected, current, split))

  const legend = element("p", "werdol-dev-loops-legend")
  LOOP_STYLES.slice().reverse().forEach((style) => {
    const swatch = element("span", "werdol-dev-loops-swatch")
    swatch.style.borderTop = `2px ${style.dash ? "dashed" : "solid"} ${style.color}`
    legend.append(swatch, document.createTextNode(`${style.label}  `))
  })
  body.append(legend)

  const list = element("ul", "werdol-dev-loops-list")
  split.loops.slice().sort((first, second) => first.length - second.length).forEach((loop) => list.append(element("li", "", describeLoop(loop, current))))
  body.append(list)

  if (split.moves > 0) {
    const hint = element("p", "werdol-dev-loops-hint")
    const hintButton = element("button", "", "Best move?")
    hintButton.type = "button"
    hintButton.addEventListener("click", () => {
      hint.textContent = bestSwap(puzzle, expected, tiles, split.moves)
    })
    hint.append(hintButton)
    body.append(hint)
  }
  root.append(body)
}

/** Removes the panel, for screens that have no board. */
export function hideDevLoopPanel(): void {
  root?.remove()
  root = undefined
  previous = undefined
}
