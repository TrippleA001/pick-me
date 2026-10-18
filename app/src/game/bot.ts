import type { RNG } from "./rng";
import { solve } from "./words";
import type { SolvedWord } from "./words";

export type Difficulty = "rookie" | "sharp" | "pro";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  rookie: "ROOKIE",
  sharp: "SHARP",
  pro: "PRO",
};

function pick(pool: SolvedWord[], rng: RNG): string {
  return pool[Math.floor(rng() * pool.length)].word;
}

/**
 * The opponent is the same solver, throttled by how close it aims to the best
 * play available. Pro is exactly the oracle, so the only way to beat it is to
 * find the best word yourself.
 */
export function botPick(
  rack: string[],
  difficulty: Difficulty,
  rng: RNG,
): string {
  const solved = solve(rack);
  if (solved.length === 0) return "";
  if (difficulty === "pro") return solved[0].word;

  const best = solved[0].score;

  if (difficulty === "sharp") {
    const pool = solved.filter((word) => word.score >= best * 0.8);
    return pick(pool, rng);
  }

  let pool = solved.filter(
    (word) => word.score >= best * 0.35 && word.score <= best * 0.7,
  );
  if (pool.length === 0) pool = solved.filter((word) => word.score >= best * 0.35);
  if (pool.length === 0) pool = solved;
  return pick(pool, rng);
}
