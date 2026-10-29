// Prints the board for a seed and a scripted demo solve: wasted swaps, then the solver's swaps.
// Run: npm run demo:solution -- <seed>            (one seed)
//      npm run demo:solution -- scan [maxMoves]   (seeds whose demo solve is short)
import { createScrambledBoard } from "../src/core/board"
import { tilesFromOccupancy, swapOccupancy } from "../src/core/boardState"
import { countOptimalMoves, findNextSwap } from "../src/core/minimumMoves"
import { createWerdolPuzzle } from "../src/core/puzzle"
import { createSeededRandom } from "../src/core/seededRandom"

const WASTED_SWAPS = 2
const EXTRA_MOVES = 3 // "out of moves" shows at minimum + 3 moves unless that move solves it

function plan(seed: number) {
  // Same settings the scene uses (see MainScene.create).
  const puzzle = createWerdolPuzzle(createSeededRandom(seed, 1), { minGreenTiles: 4, minYellowTiles: 4, wordListMode: "easy" })
  const board = createScrambledBoard(puzzle, createSeededRandom(seed, 2))
  let occupancy = board.occupancy
  const tiles = () => tilesFromOccupancy(occupancy, board.letters)
  const minimum = countOptimalMoves(puzzle, tiles())
  const swaps: Array<[number, number, string]> = []
  const wasted = (slot: number) => slot % 5 === 0 || slot % 5 === 4 // outer tiles, easy to read as "wrong"
  for (let n = 0; n < WASTED_SWAPS; n += 1) {
    const remaining = countOptimalMoves(puzzle, tiles())
    const choice = [...Array(20).keys()].flatMap((a) => [...Array(20).keys()].map((b) => [a, b] as const))
      .filter(([a, b]) => !swaps.some(([x, y]) => x === a || y === a || x === b || y === b))
      .filter(([a, b]) => a < b && wasted(a) && wasted(b) && Math.floor(a / 5) !== Math.floor(b / 5))
      .find(([a, b]) => countOptimalMoves(puzzle, tilesFromOccupancy(swapOccupancy(occupancy, a, b), board.letters)) === remaining)
    if (choice === undefined) return undefined
    occupancy = swapOccupancy(occupancy, choice[0], choice[1])
    swaps.push([choice[0], choice[1], "wasted"])
  }
  for (let next = findNextSwap(puzzle, tiles()); next !== undefined; next = findNextSwap(puzzle, tiles())) {
    occupancy = swapOccupancy(occupancy, next.firstSlot, next.secondSlot)
    swaps.push([next.firstSlot, next.secondSlot, "solve"])
  }
  const grid = board.tiles.map((tile) => tile.letter)
  return { seed, target: puzzle.target, rows: puzzle.rows.map((row) => row.intendedGuess), grid, minimum, swaps, fits: swaps.length <= minimum + EXTRA_MOVES }
}

if (process.argv[2] === "scan") {
  const maxMoves = Number(process.argv[3] ?? 8)
  for (let seed = 0; seed < 400; seed += 1) {
    const result = plan(seed)
    if (result?.fits && result.swaps.length <= maxMoves + WASTED_SWAPS) console.log(seed, result.target, result.rows.join(","), `min=${result.minimum}`, `swaps=${result.swaps.length}`)
  }
} else {
  const result = plan(Number(process.argv[2] ?? 0))
  if (result === undefined) throw new Error("No scripted solve for that seed")
  const board = Array.from({ length: 5 }, (_row, r) => result.grid.slice(r * 5, r * 5 + 5).join("")).join("\n")
  console.log(`seed ${result.seed}  target ${result.target}  rows ${result.rows.join(" ")}  minimum ${result.minimum}  fits budget: ${result.fits}\n${board}`)
  console.log(JSON.stringify(result.swaps))
}
