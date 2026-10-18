import { BINGO, BLANK, RACK_SIZE, TILE_VALUE, letterValue } from "./letters";

export interface SolvedWord {
  word: string;
  score: number;
}

const wordSet = new Set<string>();
let words: string[] = [];
/** Bitmask of the distinct letters each word uses, for a cheap reject. */
let masks = new Uint32Array(0);
/** Raw tile sum of each word, blanks not yet accounted for. */
let rawScores = new Int32Array(0);
let twoLetter: string[] = [];

/** Tile value by letter index (0 = A). */
const VALUE = new Int32Array(26);
for (let i = 0; i < 26; i += 1) {
  VALUE[i] = TILE_VALUE[String.fromCharCode(65 + i)] ?? 0;
}

export function dictionaryReady(): boolean {
  return words.length > 0;
}

export function wordCount(): number {
  return words.length;
}

export async function loadDictionary(
  url = "./data/enable1.txt",
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`the word list returned ${response.status}`);
  const text = await response.text();

  wordSet.clear();
  const list: string[] = [];
  for (const line of text.split("\n")) {
    const word = line.trim();
    if (word.length < 2 || word.length > RACK_SIZE) continue;
    if (!/^[a-z]+$/.test(word)) continue;
    if (wordSet.has(word)) continue;
    wordSet.add(word);
    list.push(word);
  }

  words = list;
  masks = new Uint32Array(list.length);
  rawScores = new Int32Array(list.length);
  for (let i = 0; i < list.length; i += 1) {
    const word = list[i];
    let mask = 0;
    let raw = 0;
    for (let k = 0; k < word.length; k += 1) {
      const index = word.charCodeAt(k) - 97;
      mask |= 1 << index;
      raw += VALUE[index];
    }
    masks[i] = mask;
    rawScores[i] = raw;
  }

  twoLetter = list
    .filter((word) => word.length === 2)
    .sort(
      (a, b) =>
        letterValue(a[0]) +
          letterValue(a[1]) -
          (letterValue(b[0]) + letterValue(b[1])) || a.localeCompare(b),
    );

  solveCache.clear();
}

export function isWord(word: string): boolean {
  return wordSet.has(word.toLowerCase());
}

/**
 * Every word the rack can make, best first.
 *
 * A blank (`_`) plays as any letter and scores nothing, so a word's score is
 * its raw tile sum minus the value of every letter a blank had to cover.
 */
export function solve(rack: string[]): SolvedWord[] {
  const signature = [...rack].sort().join("");
  const cached = solveCache.get(signature);
  if (cached) return cached;

  const have = new Int32Array(26);
  let blanks = 0;
  let rackMask = 0;
  for (const tile of rack) {
    if (tile === BLANK) {
      blanks += 1;
      continue;
    }
    const index = tile.charCodeAt(0) - 65;
    have[index] += 1;
    rackMask |= 1 << index;
  }

  const rackLength = rack.length;
  const found: SolvedWord[] = [];

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const length = word.length;
    if (length > rackLength) continue;

    const outside = masks[i] & ~rackMask;
    if (outside !== 0) {
      if (blanks === 0) continue;
      let missing = 0;
      let bits = outside;
      while (bits !== 0) {
        bits &= bits - 1;
        missing += 1;
      }
      if (missing > blanks) continue;
    }

    let deficit = 0;
    let surplus = 0;
    let touched = 0;
    for (let k = 0; k < length; k += 1) {
      const index = word.charCodeAt(k) - 97;
      need[index] += 1;
      touched += 1;
      if (need[index] > have[index]) {
        deficit += 1;
        surplus += VALUE[index];
        if (deficit > blanks) break;
      }
    }

    if (deficit <= blanks) {
      const score = rawScores[i] - surplus + (length === RACK_SIZE ? BINGO : 0);
      found.push({ word, score });
    }

    for (let k = 0; k < touched; k += 1) need[word.charCodeAt(k) - 97] = 0;
  }

  found.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
  solveCache.set(signature, found);
  return found;
}

/** Cheap two-letter words first — the ones worth drilling. */
export function twoLetterLesson(seed: number, count: number): string[] {
  const pool = twoLetter;
  if (pool.length === 0) return [];
  const size = Math.min(count, pool.length);
  const span = pool.length - size + 1;
  const start = span > 0 ? seed % span : 0;
  return pool.slice(start, start + size);
}

const solveCache = new Map<string, SolvedWord[]>();
const need = new Int32Array(26);
