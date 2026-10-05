export const SEED_LIMIT = 1_000_000

export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0
  return ((Math.trunc(seed) % SEED_LIMIT) + SEED_LIMIT) % SEED_LIMIT
}

export function seedFromCurrentTime(date = new Date()): number {
  return date.getHours() * 10_000 + date.getMinutes() * 100 + date.getSeconds()
}

export function nextPuzzleSeed(seed: number): number {
  return normalizeSeed(normalizeSeed(seed) + 1)
}

export function createSeededRandom(seed: number, stream = 0): () => number {
  // Scramble the starting state so neighbouring seeds give unrelated streams.
  let state = scramble((normalizeSeed(seed) + 1 + stream * 1009) >>> 0)
  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}

function scramble(value: number): number {
  let mixed = value
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85ebca6b)
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35)
  return (mixed ^ (mixed >>> 16)) >>> 0
}
