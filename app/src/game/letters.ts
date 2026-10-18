import type { RNG } from "./rng";

export const RACK_SIZE = 7;
export const BINGO = 50;
export const BLANK = "_";

/** Standard English tile distribution. */
export const TILE_COUNT: Record<string, number> = {
  A: 9,
  B: 2,
  C: 2,
  D: 4,
  E: 12,
  F: 2,
  G: 3,
  H: 2,
  I: 9,
  J: 1,
  K: 1,
  L: 4,
  M: 2,
  N: 6,
  O: 8,
  P: 2,
  Q: 1,
  R: 6,
  S: 4,
  T: 6,
  U: 4,
  V: 2,
  W: 2,
  X: 1,
  Y: 2,
  Z: 1,
  [BLANK]: 2,
};

export const TILE_VALUE: Record<string, number> = {
  A: 1,
  B: 3,
  C: 3,
  D: 2,
  E: 1,
  F: 4,
  G: 2,
  H: 4,
  I: 1,
  J: 8,
  K: 5,
  L: 1,
  M: 3,
  N: 1,
  O: 1,
  P: 3,
  Q: 10,
  R: 1,
  S: 1,
  T: 1,
  U: 1,
  V: 4,
  W: 4,
  X: 8,
  Y: 4,
  Z: 10,
  [BLANK]: 0,
};

/** A tile as it sits in a formed word: the letter shown, and the tile used. */
export interface Placed {
  letter: string;
  tile: string;
}

export function isVowel(tile: string): boolean {
  return tile === "A" || tile === "E" || tile === "I" || tile === "O" || tile === "U";
}

export function letterValue(letter: string): number {
  return TILE_VALUE[letter.toUpperCase()] ?? 0;
}

export function vowelCount(rack: string[]): number {
  let n = 0;
  for (const tile of rack) if (isVowel(tile)) n += 1;
  return n;
}

/** Score a word already laid down. Blanks score nothing; seven tiles earns the bingo. */
export function scorePlaced(placed: Placed[]): number {
  let score = 0;
  for (const item of placed) {
    if (item.tile !== BLANK) score += letterValue(item.letter);
  }
  if (placed.length === RACK_SIZE) score += BINGO;
  return score;
}

export function drawRack(rng: RNG): string[] {
  const bag: string[] = [];
  for (const tile of Object.keys(TILE_COUNT)) {
    for (let i = 0; i < TILE_COUNT[tile]; i += 1) bag.push(tile);
  }
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = bag[i];
    bag[i] = bag[j];
    bag[j] = swap;
  }
  return bag.slice(0, RACK_SIZE);
}
