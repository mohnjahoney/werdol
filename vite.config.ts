import { defineConfig } from "vitest/config"

export default defineConfig({
  base: "./",
  build: { chunkSizeWarningLimit: 2_000 },
  test: { environment: "node" },
})
