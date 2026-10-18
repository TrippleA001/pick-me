import { defineConfig } from "vite";

// base "./" keeps every emitted path relative, which start.ng requires.
export default defineConfig({
  base: "./",
  build: { outDir: "dist" },
});
