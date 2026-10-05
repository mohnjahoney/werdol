import { evaluateGuess, type LetterResult } from "./evaluateGuess"
import { ALLOWED_WORDS, ANSWER_WORDS } from "./words"

export const ROW_COUNT = 4
export const MAX_LETTER_COPIES = 6

export interface WerdolRow {
  intendedGuess: string
  pattern: LetterResult[]
}

export interface WerdolPuzzle {
  target: string
  rows: WerdolRow[]
  wordsConsidered?: number
}

export interface PuzzleSetup {
  seed?: number
  requireTargetLetterInEachRow?: boolean
  requireGreenTileInEachRow?: boolean
  minGreenTiles?: number
  minYellowTiles?: number
  useAnswerWordsForRows?: boolean
  wordListMode?: "easy" | "hard"
}

export function createWerdolPuzzle(random = Math.random, setup: PuzzleSetup = {}): WerdolPuzzle {
  const useSmallList = setup.wordListMode === "easy" || (setup.wordListMode === undefined && setup.useAnswerWordsForRows === true)
  const wordList = setup.wordListMode === "hard" ? ALLOWED_WORDS : ANSWER_WORDS
  const guessWords = useSmallList ? ANSWER_WORDS : ALLOWED_WORDS
  let wordsConsidered = 0

  for (let attempt = 0; attempt < wordList.length; attempt += 1) {
    const target = choose(wordList, random)
    const result = createRows(target, guessWords, random, setup)
    wordsConsidered += result.wordsConsidered + 1
    if (result.rows === undefined) continue
    if (exceedsLetterCap(result.rows.map((row) => row.word))) continue

    return {
      target,
      wordsConsidered,
      rows: result.rows.map(({ word, pattern }) => ({
        intendedGuess: word,
        pattern,
      })),
    }
  }

  throw new Error(`Could not create a puzzle with the current constraints after ${wordList.length} attempts`)
}

function createRows(
  target: string,
  guessWords: readonly string[],
  random: () => number,
  setup: PuzzleSetup,
): { rows: Array<{ word: string; pattern: LetterResult[] }> | undefined; wordsConsidered: number } {
  const patterns = new Set<string>()
  const candidates: Array<{ word: string; pattern: LetterResult[] }> = []
  let wordsConsidered = 0

  for (const word of shuffled(guessWords, random)) {
    wordsConsidered += 1
    if (word === target) continue

    const pattern = evaluateGuess(word, target)
    if (setup.requireTargetLetterInEachRow && !pattern.some((result) => result !== "absent")) continue
    if (setup.requireGreenTileInEachRow && !pattern.some((result) => result === "correct")) continue

    const signature = pattern.join("")
    if (patterns.has(signature)) continue

    patterns.add(signature)
    candidates.push({ word, pattern })

    if (candidates.length >= ROW_COUNT) {
      const guesses = chooseRows(candidates, setup)
      if (meetsTileMinimums(guesses, setup.minGreenTiles ?? 0, setup.minYellowTiles ?? 0)) {
        return { rows: guesses, wordsConsidered }
      }
    }
  }

  return { rows: undefined, wordsConsidered }
}

function chooseRows(
  candidates: Array<{ word: string; pattern: LetterResult[] }>,
  setup: PuzzleSetup,
): Array<{ word: string; pattern: LetterResult[] }> {
  const guesses = candidates.slice(0, ROW_COUNT)
  const minGreenTiles = setup.minGreenTiles ?? 0
  const minYellowTiles = setup.minYellowTiles ?? 0
  const consideredWords = new Set(guesses.map((guess) => guess.word))

  while (!meetsTileMinimums(guesses, minGreenTiles, minYellowTiles)) {
    const removableIndex = guesses.reduce((leastHelpfulIndex, guess, index, rows) => {
      if (tileHelpfulness(guess) < tileHelpfulness(rows[leastHelpfulIndex]!)) return index
      return leastHelpfulIndex
    }, 0)
    const remainingPatterns = new Set(guesses.map((guess, index) => index === removableIndex ? "" : guess.pattern.join("")))
    const replacement = candidates
      .filter((candidate) => !consideredWords.has(candidate.word))
      .filter((candidate) => !remainingPatterns.has(candidate.pattern.join("")))
      .sort((first, second) => tileHelpfulness(second) - tileHelpfulness(first))[0]

    if (replacement === undefined) return guesses
    consideredWords.add(replacement.word)
    guesses[removableIndex] = replacement
  }

  return guesses
}

function meetsTileMinimums(
  guesses: Array<{ word: string; pattern: LetterResult[] }>,
  minGreenTiles: number,
  minYellowTiles: number,
): boolean {
  const counts = guesses.reduce(
    (totals, guess) => {
      guess.pattern.forEach((result) => {
        if (result === "correct") totals.green += 1
        if (result === "present") totals.yellow += 1
      })
      return totals
    },
    { green: 0, yellow: 0 },
  )
  return counts.green >= minGreenTiles && counts.yellow >= minYellowTiles
}

/** A board dominated by one letter plays as a slog of interchangeable tiles. */
function exceedsLetterCap(words: readonly string[]): boolean {
  const counts = new Map<string, number>()
  for (const letter of words.join("")) counts.set(letter, (counts.get(letter) ?? 0) + 1)
  return [...counts.values()].some((count) => count > MAX_LETTER_COPIES)
}

function tileHelpfulness(guess: { pattern: LetterResult[] }): number {
  return guess.pattern.filter((result) => result === "correct" || result === "present").length
}

function choose<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)]
  if (item === undefined) throw new Error("Cannot choose from an empty list")
  return item
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = result[index]
    result[index] = result[swapIndex] as T
    result[swapIndex] = current as T
  }
  return result
}
