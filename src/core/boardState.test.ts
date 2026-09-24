import { describe, expect, it } from "vitest"
import { createScrambledBoard } from "./board"
import { createWerdolPuzzle } from "./puzzle"
import { countCorrectOccupancy, letterMatchesOriginalTileLetter, swapOccupancy, tilesFromOccupancy } from "./boardState"

describe("board state", () => {
  it("swaps letter identities and derives the same tile model used by the game", () => {
    const puzzle = createWerdolPuzzle(() => 0.25)
    const board = createScrambledBoard(puzzle, () => 0.5)
    const starting = board.occupancy
    const next = swapOccupancy(starting, 0, 1)
    const tiles = tilesFromOccupancy(next, board.letters)

    expect(next[0]).toBe(starting[1])
    expect(next[1]).toBe(starting[0])
    expect(tiles.map((tile) => tile.id)).toEqual(next)
    expect(letterMatchesOriginalTileLetter(board.boardTiles, starting, board.letters, 20)).toBe(true)
    expect(countCorrectOccupancy(board.boardTiles, starting, board.letters)).toBe(
      starting.reduce((count, _letterId, slotIndex) => count + (letterMatchesOriginalTileLetter(board.boardTiles, starting, board.letters, slotIndex) ? 1 : 0), 0),
    )
  })
})
