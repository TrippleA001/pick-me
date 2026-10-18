/**
 * Copies the built game from app/dist to the repo root.
 *
 * start.ng serves the first index.html it finds at the top of the repo, so the
 * built game has to sit at the root while the Vite source stays in app/.
 */
import { existsSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const repoRoot = path.resolve(appDir, "..");
const distDir = path.join(appDir, "dist");

const published = ["index.html", "assets", "data", "startng.json", "cover.png"];

let copied = 0;
for (const name of published) {
  const from = path.join(distDir, name);
  if (!existsSync(from)) {
    console.warn(`sync: dist/${name} is missing, skipped`);
    continue;
  }
  const to = path.join(repoRoot, name);
  await rm(to, { recursive: true, force: true });
  await cp(from, to, { recursive: true });
  copied += 1;
}

console.log(`sync: ${copied} of ${published.length} entries copied from app/dist to the repo root`);
