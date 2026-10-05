import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { extname, join, resolve } from "node:path"

interface NgramConfig {
  yearStart: number
  yearEnd: number
  smoothing: number
  frequencyMode: "raw_percent"
  batchSize: number
  delaySeconds: number
  wordSource: "ALLOWED_WORDS"
  sampleSize: number
  randomSample: boolean
  outputStem: string
}

interface NgramResponse {
  ngram: string
  timeseries: number[]
}

const projectRoot = resolve(import.meta.dirname, "..")
const configPath = join(projectRoot, "ngram-config.json")
const config = JSON.parse(readFileSync(configPath, "utf8")) as NgramConfig
const answerWords = JSON.parse(readFileSync(join(projectRoot, "src/core/wordlists/nytAnswers.json"), "utf8")) as string[]
const additionalGuesses = JSON.parse(readFileSync(join(projectRoot, "src/core/wordlists/nytAdditionalGuesses.json"), "utf8")) as string[]
const sourceWords = [...answerWords, ...additionalGuesses].map((word) => word.toLowerCase())
const words = config.randomSample ? shuffled(sourceWords).slice(0, config.sampleSize) : sourceWords.slice(0, config.sampleSize)

if (words.length === 0) throw new Error("No words selected for the Ngram experiment")
if (config.sampleSize > sourceWords.length) throw new Error(`Requested ${config.sampleSize} words, but the source only contains ${sourceWords.length}`)
if (config.frequencyMode !== "raw_percent") throw new Error("This script expects frequencyMode=raw_percent")

const years = Array.from({ length: config.yearEnd - config.yearStart + 1 }, (_, index) => config.yearStart + index)
const batches = Array.from({ length: Math.ceil(words.length / config.batchSize) }, (_, index) => words.slice(index * config.batchSize, (index + 1) * config.batchSize))
const results = new Map<string, number[]>()

for (const [index, batch] of batches.entries()) {
  const params = new URLSearchParams({
    content: batch.join(","),
    year_start: String(config.yearStart),
    year_end: String(config.yearEnd),
    corpus: "en-2019",
    smoothing: String(config.smoothing),
  })
  const response = await fetch(`https://books.google.com/ngrams/json?${params}`)
  if (!response.ok) throw new Error(`Ngram request failed (${response.status}) for batch ${index + 1}`)
  const data = (await response.json()) as NgramResponse[]
  data.forEach((entry) => results.set(entry.ngram, entry.timeseries.map((value) => value * 100)))
  console.log(`Completed batch ${index + 1}/${batches.length}`)
  if (index < batches.length - 1) await new Promise((resolve) => setTimeout(resolve, config.delaySeconds * 1000))
}

const output = words.map((word) => ({
  word,
  frequencies: Object.fromEntries(years.map((year, index) => [year, results.get(word)?.[index] ?? null])),
}))
const outputDirectory = join(projectRoot, "docs")
const baseOutputPath = join(outputDirectory, `${config.outputStem}.json`)
const outputPath = chooseOutputPath(baseOutputPath)

writeFileSync(outputPath, `${JSON.stringify({ config, corpus: "en-2019", source: config.wordSource, words: output }, null, 2)}\n`)
console.log(`Wrote ${output.length} words to ${outputPath}`)

function shuffled(items: string[]): string[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = result[index]
    result[index] = result[swapIndex] as string
    result[swapIndex] = current as string
  }
  return result
}

function chooseOutputPath(basePath: string): string {
  if (!existsSync(basePath)) return basePath
  const extension = extname(basePath)
  const stem = basePath.slice(0, -extension.length)
  for (let index = 1; index <= 99; index += 1) {
    const candidate = `${stem}-${String(index).padStart(2, "0")}${extension}`
    if (!existsSync(candidate)) return candidate
  }
  throw new Error(`Could not find an available output filename for ${basePath}`)
}
