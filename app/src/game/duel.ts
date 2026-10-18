import { BLANK, RACK_SIZE, drawRack, scorePlaced, vowelCount } from "./letters";
import type { Placed } from "./letters";
import { hash32, mulberry32 } from "./rng";
import { solve } from "./words";
import type { SolvedWord } from "./words";

export type Side = "you" | "them";

export const HP_START = 60;
export const ROUND_CAP = 15;
export const DAMAGE_MIN = 3;
/** A rack is only served if it can make at least one word worth this much. */
export const RACK_QUALITY_MIN = 12;

export interface RoundResult {
  index: number;
  rack: string[];
  owner: Side;
  yourWord: string;
  yourScore: number;
  theirWord: string;
  theirScore: number;
  winner: Side;
  damage: number;
  best: SolvedWord | null;
  youBingo: boolean;
  themBingo: boolean;
}

export interface DuelState {
  seed: number;
  label: string;
  round: number;
  owner: Side;
  hpYou: number;
  hpThem: number;
  history: RoundResult[];
  over: boolean;
}

export function newDuel(seed: number, label: string): DuelState {
  return {
    seed,
    label,
    round: 1,
    owner: "you",
    hpYou: HP_START,
    hpThem: HP_START,
    history: [],
    over: false,
  };
}

/** Both sides are dealt the same seven tiles, from the same seeded bag. */
export function rackFor(seed: number, round: number): string[] {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const rack = drawRack(mulberry32(hash32(`${seed}:${round}:${attempt}`)));
    if (vowelCount(rack) < 2) continue;
    const best = solve(rack)[0];
    if (best && best.score >= RACK_QUALITY_MIN) return rack;
  }
  return drawRack(mulberry32(hash32(`${seed}:${round}:fallback`)));
}

/** Turn a word string into tiles, spending real tiles before blanks. */
export function wordToPlaced(word: string, rack: string[]): Placed[] {
  const pool = rack.slice();
  const placed: Placed[] = [];
  for (const rawLetter of word.toUpperCase()) {
    let index = pool.indexOf(rawLetter);
    if (index >= 0) {
      placed.push({ letter: rawLetter, tile: pool[index] });
      pool.splice(index, 1);
      continue;
    }
    index = pool.indexOf(BLANK);
    if (index < 0) return placed;
    placed.push({ letter: rawLetter, tile: BLANK });
    pool.splice(index, 1);
  }
  return placed;
}

export function resolveRound(
  state: DuelState,
  rack: string[],
  yours: Placed[],
  theirWord: string,
): { state: DuelState; result: RoundResult } {
  const theirPlaced = wordToPlaced(theirWord, rack);
  const yourScore = scorePlaced(yours);
  const theirScore = scorePlaced(theirPlaced);

  const winner: Side =
    yourScore > theirScore ? "you" : theirScore > yourScore ? "them" : state.owner;
  const damage = Math.max(DAMAGE_MIN, Math.abs(yourScore - theirScore));

  const result: RoundResult = {
    index: state.round,
    rack: rack.slice(),
    owner: state.owner,
    yourWord: yours.map((item) => item.letter).join(""),
    yourScore,
    theirWord: theirPlaced.map((item) => item.letter).join(""),
    theirScore,
    winner,
    damage,
    best: solve(rack)[0] ?? null,
    youBingo: yours.length === RACK_SIZE,
    themBingo: theirPlaced.length === RACK_SIZE,
  };

  const next: DuelState = {
    ...state,
    round: state.round + 1,
    owner: state.owner === "you" ? "them" : "you",
    history: [...state.history, result],
  };
  if (winner === "you") next.hpThem = Math.max(0, next.hpThem - damage);
  else next.hpYou = Math.max(0, next.hpYou - damage);
  next.over = next.hpYou <= 0 || next.hpThem <= 0 || next.round > ROUND_CAP;

  return { state: next, result };
}

export function outcomeOf(state: DuelState): Side | "draw" {
  if (state.hpYou <= 0 && state.hpThem <= 0) return "draw";
  if (state.hpYou <= 0) return "them";
  if (state.hpThem <= 0) return "you";
  if (state.hpYou > state.hpThem) return "you";
  if (state.hpThem > state.hpYou) return "them";
  return "draw";
}
