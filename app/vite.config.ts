import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// base "./" keeps every emitted path relative, which start.ng requires.
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    rollupOptions: {
      // index.html is the game — the 3D board, which is what start.ng serves.
      // 2d.html is the same game drawn in the DOM; it stays built as the
      // fallback for a device that cannot give us a WebGL context.
      input: {
        main: here("index.html"),
        game2d: here("2d.html"),
      },
    },
  },
});
