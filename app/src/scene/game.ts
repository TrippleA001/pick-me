/**
 * The 3D game.
 *
 * The same rules, bot, clock and dictionary as the 2D game; the difference is
 * that the board is a real board. You lay your word on it, their word is dealt
 * back-to-you on the far side, and at time up the two words turn to face each
 * other and clash.
 *
 * This is the game start.ng serves. 2d.html is the same game drawn in the DOM,
 * and is where a device without WebGL ends up (see scene/entry.ts).
 */
import { BLANK, letterValue } from "../game/letters";
import type { Placed } from "../game/letters";
import { DIFFICULTY_LABEL, botPick } from "../game/bot";
import type { Difficulty } from "../game/bot";
import {
  HP_START,
  newDuel,
  outcomeOf,
  rackFor,
  resolveRound,
} from "../game/duel";
import type { DuelState, RoundResult, Side } from "../game/duel";
import { buildStudyCard } from "../game/coach";
import { hash32, mulberry32, todaySeed } from "../game/rng";
import { isWord, loadDictionary, solve, wordCount } from "../game/words";
import { readBoard, saveScore, signInUrl, whoAmI } from "../startng";
import type { BoardEntry, StartNgPlayer } from "../startng";
import { createArena } from "./arena";
import { FABRIC_BLURB, FABRIC_LABEL, fabricSwatch } from "./cloth";
import type { Fabric } from "./cloth";
import { Table, CLASH_LEAD_MS, type BuiltTile } from "./table";

/** Only this clock is ranked: more time is an easier game. */
const RANKED_MS = 20000;

interface Clock {
  name: string;
  blurb: string;
  ms: number;
}

const CLOCKS: Clock[] = [
  { name: "No wahala", blurb: "60 seconds", ms: 60000 },
  { name: "Small wahala", blurb: "40 seconds", ms: 40000 },
  { name: "Serious wahala", blurb: "20 seconds", ms: RANKED_MS },
];

const TIERS: Difficulty[] = ["rookie", "sharp", "pro"];
const FABRICS: Fabric[] = ["ankara", "adire"];
const TIER_BLURB: Record<Difficulty, string> = {
  rookie: "weak words",
  sharp: "strong words",
  pro: "the best word",
};

type Screen = "boot" | "title" | "match" | "result";
type Phase = "play" | "clash" | "done";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

const screens: Record<Screen, HTMLElement> = {
  boot: el("boot"),
  title: el("title"),
  match: el("match"),
  result: el("result"),
};

const arena = createArena(el("stage"));
const table = new Table(arena, {
  onRackTap: (slot) => tapTile(slot),
  onWordTap: (index) => untap(index),
});

let difficulty: Difficulty = "sharp";
let fabric: Fabric = "ankara";
let clockMs = RANKED_MS;
let matchRanked = true;
let duel: DuelState | null = null;
let rack: string[] = [];
let built: BuiltTile[] = [];
let used: boolean[] = [];
let phase: Phase = "play";
let botWord = "";
let noticeText = "";
let roundNo = 1;
let roundOwner: Side = "you";
let timerEnd = 0;
let rafId = 0;
let pendingState: DuelState | null = null;

function show(screen: Screen): void {
  (Object.keys(screens) as Screen[]).forEach((key) => {
    screens[key].classList.toggle("hidden", key !== screen);
  });
}

/* ---------------------------------------------------------------- title --- */

function buildTitle(): void {
  const row = el("diff-row");
  row.innerHTML = "";
  for (const tier of TIERS) {
    const button = document.createElement("button");
    button.className = "pick-option" + (tier === difficulty ? " on" : "");
    button.innerHTML = `<b>${DIFFICULTY_LABEL[tier]}</b><span>${TIER_BLURB[tier]}</span>`;
    button.addEventListener("click", () => {
      difficulty = tier;
      buildTitle();
    });
    row.appendChild(button);
  }

  const clockRow = el("clock-row");
  clockRow.innerHTML = "";
  for (const clock of CLOCKS) {
    const button = document.createElement("button");
    button.className = "pick-option" + (clock.ms === clockMs ? " on" : "");
    button.innerHTML = `<b>${clock.name}</b><span>${clock.blurb}</span>`;
    button.addEventListener("click", () => {
      clockMs = clock.ms;
      buildTitle();
    });
    clockRow.appendChild(button);
  }

  // The board is a setup choice, not a mid-game control, so it lives here.
  const fabricRow = el("fabric-row");
  fabricRow.innerHTML = "";
  for (const kind of FABRICS) {
    const button = document.createElement("button");
    button.className = "pick-option with-swatch" + (kind === fabric ? " on" : "");
    const swatch = fabricSwatch(kind, 30);
    swatch.className = "swatch";
    swatch.setAttribute("aria-hidden", "true");
    button.appendChild(swatch);
    const label = document.createElement("div");
    label.innerHTML = `<b>${FABRIC_LABEL[kind]}</b><span>${FABRIC_BLURB[kind]}</span>`;
    button.appendChild(label);
    button.addEventListener("click", () => {
      fabric = kind;
      arena.setFabric(kind);
      buildTitle();
    });
    fabricRow.appendChild(button);
  }
}

/* ---------------------------------------------------------------- match --- */

function startMatch(daily: boolean): void {
  const seed = daily
    ? hash32(`daily:${todaySeed()}`)
    : Math.floor(Math.random() * 4294967296);
  duel = newDuel(seed, daily ? `DAILY ${todaySeed()}` : "EXHIBITION");
  matchRanked = clockMs === RANKED_MS;
  arena.setFabric(fabric);
  show("match");
  startRound();
}

function startRound(): void {
  if (!duel) return;
  if (duel.over) {
    showResult();
    return;
  }

  table.reset();
  rack = rackFor(duel.seed, duel.round);
  built = [];
  used = rack.map(() => false);
  botWord = "";
  phase = "play";
  roundNo = duel.round;
  roundOwner = duel.owner;

  table.setRack(rack, used);
  table.setTheirRack(rack);
  table.setWord(built);

  el("verdict").innerHTML = "";
  renderScores(null);
  el("next-row").classList.add("hidden");

  renderHud();
  renderRound();
  renderWall();
  setNotice("");
  setControls(true);
  beginTimer();
}

function beginTimer(): void {
  timerEnd = performance.now() + clockMs;
  cancelAnimationFrame(rafId);
  const tick = () => {
    if (phase !== "play") return;
    const left = Math.max(0, timerEnd - performance.now());
    const fill = el("timer-fill");
    fill.style.width = `${(left / clockMs) * 100}%`;
    fill.classList.toggle("low", left < 5000);
    if (left <= 0) {
      timeUp();
      return;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

/** The clock plays whatever is on the board, so a slow tap is not a lost word. */
function timeUp(): void {
  if (phase !== "play") return;
  const word = built.map((item) => item.letter).join("");
  if (word.length >= 2 && isWord(word)) {
    setNotice("Out of time — your word counts.");
    play(false);
    return;
  }
  setNotice(
    word.length >= 2
      ? `Out of time — ${word} is not in the word list.`
      : "Out of time.",
  );
  play(true);
}

function play(pass: boolean): void {
  if (phase !== "play" || !duel) return;

  const word = built.map((item) => item.letter).join("");
  if (!pass) {
    if (word.length < 2) {
      setNotice("Two letters, minimum.");
      return;
    }
    if (!isWord(word)) {
      setNotice(`${word} is not in the word list.`);
      return;
    }
  }

  phase = "clash";
  cancelAnimationFrame(rafId);
  setControls(false);
  setNotice("");

  const rng = mulberry32(hash32(`${duel.seed}:bot:${duel.round}`));
  botWord = botPick(rack, difficulty, rng);

  const yours: Placed[] = pass
    ? []
    : built.map((item) => ({
        letter: item.letter,
        tile: rack[item.slot],
      }));
  const { state, result } = resolveRound(duel, rack, yours, botWord);
  pendingState = state;

  // They play off their own tray first, then the clash runs — so the word
  // arrives rather than appearing.
  table.setEnabled(false);
  table.dealTheirs(result.theirWord, () => {
    table.runClash(
      result.winner,
      () => landImpact(result),
      () => finishRound(),
    );
  });
}

/** Runs at the exact moment of the hit, when the scores should appear. */
function landImpact(result: RoundResult): void {
  duel = pendingState;
  pendingState = null;
  phase = "done";

  renderScores(result);
  renderHud();
  renderVerdict(result);
  renderWall();
}

function finishRound(): void {
  if (!duel) return;
  const next = el("btn-next");
  next.textContent = duel.over ? "See the study card" : "Next round";
  el("next-row").classList.remove("hidden");
}

function nextRound(): void {
  if (!duel) return;
  if (duel.over) {
    showResult();
    return;
  }
  startRound();
}

/* -------------------------------------------------------------- controls --- */

function tapTile(slot: number): void {
  if (phase !== "play" || used[slot]) return;
  if (rack[slot] === BLANK) {
    openBlankPicker(slot);
    return;
  }
  noticeText = "";
  built.push({ slot, letter: rack[slot] });
  used[slot] = true;
  table.setRack(rack, used);
  table.setWord(built);
  renderReadout();
}

function tapBlank(slot: number, letter: string): void {
  if (phase !== "play" || used[slot]) return;
  noticeText = "";
  built.push({ slot, letter });
  used[slot] = true;
  table.setRack(rack, used);
  table.setWord(built);
  renderReadout();
}

function untap(index: number): void {
  if (phase !== "play") return;
  const item = built[index];
  if (!item) return;
  noticeText = "";
  used[item.slot] = false;
  built.splice(index, 1);
  table.setRack(rack, used);
  table.setWord(built);
  renderReadout();
}

function clearWord(): void {
  if (phase !== "play") return;
  noticeText = "";
  built = [];
  used = rack.map(() => false);
  table.setRack(rack, used);
  table.setWord(built);
  renderReadout();
}

function shuffleRack(): void {
  if (phase !== "play") return;
  noticeText = "";
  const slots = rack
    .map((_, index) => index)
    .filter((index) => !used[index] && rack[index] !== BLANK);
  const letters = slots.map((index) => rack[index]);
  for (let i = letters.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = letters[i];
    letters[i] = letters[j];
    letters[j] = swap;
  }
  slots.forEach((slot, index) => {
    rack[slot] = letters[index];
  });
  table.setRack(rack, used);
  renderReadout();
}

function openBlankPicker(slot: number): void {
  const host = el("blank-picker");
  host.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "picker-grid";
  for (let code = 65; code < 91; code += 1) {
    const letter = String.fromCharCode(code);
    const button = document.createElement("button");
    button.className = "tile rack-tile";
    button.innerHTML = `<span class="tl">${letter}</span><span class="tv">${letterValue(letter)}</span>`;
    button.addEventListener("click", () => {
      host.classList.add("hidden");
      tapBlank(slot, letter);
    });
    grid.appendChild(button);
  }

  const cancel = document.createElement("button");
  cancel.className = "ghost";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => host.classList.add("hidden"));

  host.appendChild(grid);
  host.appendChild(cancel);
  host.classList.remove("hidden");
}

function onKey(event: KeyboardEvent): void {
  if (phase !== "play" || !duel) return;
  if (screens.match.classList.contains("hidden")) return;
  if (!el("blank-picker").classList.contains("hidden")) return;

  if (event.key === "Enter") {
    play(false);
    return;
  }
  if (event.key === "Backspace") {
    event.preventDefault();
    if (built.length > 0) untap(built.length - 1);
    return;
  }
  if (event.key === "Escape") {
    clearWord();
    return;
  }
  if (!/^[a-zA-Z]$/.test(event.key)) return;

  const letter = event.key.toUpperCase();
  const exact = rack.findIndex((tile, index) => !used[index] && tile === letter);
  if (exact >= 0) {
    tapTile(exact);
    return;
  }
  const blank = rack.findIndex((tile, index) => !used[index] && tile === BLANK);
  if (blank >= 0) tapBlank(blank, letter);
}

/* ------------------------------------------------------------- rendering --- */

function renderHud(): void {
  if (!duel) return;
  el("hp-you").style.width = `${(Math.max(0, duel.hpYou) / HP_START) * 100}%`;
  el("hp-them").style.width = `${(Math.max(0, duel.hpThem) / HP_START) * 100}%`;
  el("round-label").textContent = `ROUND ${roundNo} · ${duel.label}`;
  const owner = el("owner-label");
  owner.textContent = roundOwner === "you" ? "TIES GO TO YOU" : "TIES GO TO THEM";
  owner.className = roundOwner === "you" ? "you" : "them";
}

function renderRound(): void {
  el("them-name").textContent = DIFFICULTY_LABEL[difficulty];
}

/** The two round totals, with a label each so neither number is anonymous. */
function renderScores(result: RoundResult | null): void {
  const you = el("score-you");
  const them = el("score-them");
  if (!result) {
    el("your-score").textContent = "";
    el("their-score").textContent = "";
    you.className = "score";
    them.className = "score";
    return;
  }
  el("your-score").textContent = String(result.yourScore);
  el("their-score").textContent = String(result.theirScore);
  you.className = `score ${result.winner === "you" ? "win" : "lose"}`;
  them.className = `score ${result.winner === "them" ? "win" : "lose"}`;
}

function renderVerdict(result: RoundResult): void {
  const youWon = result.winner === "you";
  const draw = result.yourScore === result.theirScore;

  // One headline, then one quiet line of facts — nothing stacked.
  const head = draw
    ? "DEAD HEAT — THE TURN TAKES IT"
    : youWon
      ? "YOUR WORD STANDS"
      : "THEIR WORD STANDS";

  const facts: string[] = [
    `<span class="fact">${result.damage} damage to ${youWon ? "them" : "you"}</span>`,
  ];
  if (result.youBingo) facts.push(`<span class="fact">bingo · all seven · +50</span>`);
  if (result.themBingo) facts.push(`<span class="fact">they bingoed</span>`);
  if (result.best && result.yourScore < result.best.score) {
    facts.push(
      `<span class="fact">best play <b>${result.best.word.toUpperCase()}</b> ` +
        `${result.best.score}</span>`,
    );
  }

  el("verdict").innerHTML =
    `<div class="verdict-line ${youWon ? "good" : "bad"}">${head}</div>` +
    `<div class="facts">${facts.join("<i>·</i>")}</div>`;
}

function renderWall(): void {
  const host = el("wall");
  if (!duel) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = duel.history
    .slice(-8)
    .map((round) => {
      const youWon = round.winner === "you";
      return (
        `<div class="chip ${youWon ? "good" : "bad"}">` +
        `<span class="chip-r">R${round.index}</span>` +
        `<span class="chip-y">${round.yourWord.toUpperCase() || "—"} ${round.yourScore}</span>` +
        `<span class="chip-x">${round.theirWord.toUpperCase() || "—"} ${round.theirScore}</span>` +
        `</div>`
      );
    })
    .join("");
}

function setControls(on: boolean): void {
  for (const id of ["btn-shuffle", "btn-clear", "btn-pass", "btn-play"]) {
    el<HTMLButtonElement>(id).disabled = !on;
  }
}

/** A transient message outranks the dictionary readout until you edit again. */
function setNotice(text: string): void {
  noticeText = text;
  const node = el("readout");
  node.classList.remove("shake");
  if (text) {
    void node.offsetWidth;
    node.classList.add("shake");
  }
  renderReadout();
}

/** What the dictionary thinks of the word on the board — but never its score. */
function renderReadout(): void {
  const host = el("readout");
  if (noticeText) {
    host.textContent = noticeText;
    host.className = "readout bad";
    return;
  }
  const word = built.map((item) => item.letter).join("");
  if (phase !== "play" || word.length === 0) {
    host.textContent = "";
    host.className = "readout";
    return;
  }
  if (word.length < 2) {
    host.textContent = `${word} — two letters minimum`;
    host.className = "readout bad";
    return;
  }
  if (!isWord(word)) {
    host.textContent = `${word} — not in the word list`;
    host.className = "readout bad";
    return;
  }
  host.textContent = `${word} ✓`;
  host.className = "readout ok";
}

/* --------------------------------------------------------------- result --- */

function showResult(): void {
  if (!duel) return;
  const state = duel;
  const outcome = outcomeOf(state);
  const card = buildStudyCard(state.history, state.seed);

  const title =
    outcome === "you" ? "YOU SURVIVED" : outcome === "them" ? "DISMANTLED" : "STALEMATE";
  const tone = outcome === "you" ? "good" : outcome === "them" ? "bad" : "";

  const blocks: string[] = [];
  if (card.bestWord) {
    blocks.push(
      `<div class="report-block"><div class="report-h">Best word of the match</div>` +
        `<div class="word-row"><span class="mini-tile hit">${card.bestWord.word.toUpperCase()}` +
        `<i>${card.bestWord.score}</i></span></div></div>`,
    );
  }
  if (card.tips.length > 0) {
    blocks.push(
      `<div class="report-block"><div class="report-h">How it went</div><ul>` +
        card.tips.map((tip) => `<li>${tip}</li>`).join("") +
        `</ul></div>`,
    );
  }
  if (card.missed.length > 0) {
    blocks.push(
      `<div class="report-block"><div class="report-h">Best words you missed</div>` +
        `<div class="word-row">` +
        card.missed
          .map(
            (word) =>
              `<span class="mini-tile">${word.word.toUpperCase()}<i>${word.score}</i></span>`,
          )
          .join("") +
        `</div></div>`,
    );
  }
  if (card.learning.length > 0) {
    blocks.push(
      `<div class="report-block"><div class="report-h">Two-letter words to learn</div>` +
        `<div class="word-row">` +
        card.learning.map((word) => `<span class="mini-tile">${word.toUpperCase()}</span>`).join("") +
        `</div></div>`,
    );
  }

  const career = recordRun(state, outcome);

  screens.result.innerHTML =
    `<h2 class="result-title ${tone}">${title}</h2>` +
    `<div class="result-sub">${state.round - 1} rounds · ${state.hpYou} to ${state.hpThem} health</div>` +
    `<div class="run-note" id="run-note"></div>` +
    blocks.join("") +
    `<button class="primary" id="btn-again">Duel again</button>` +
    `<button class="ghost" id="btn-menu">Change opponent</button>`;

  show("result");
  el("btn-again").addEventListener("click", () => startMatch(false));
  el("btn-menu").addEventListener("click", () => show("title"));
  void submitRun(career);
}

const CAREER_KEY = "pick-me.career";
const STAT_LABELS: Record<string, string> = {
  pro_wins: "beat pro",
  best_word: "best word",
  best_margin: "best round",
};
const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

interface Career {
  proWins: number;
  bestWord: number;
  bestMargin: number;
}

let me: StartNgPlayer | null = null;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

function loadCareer(): Career {
  try {
    const raw = localStorage.getItem(CAREER_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Career>;
      return {
        proWins: Math.max(0, saved.proWins ?? 0),
        bestWord: Math.max(0, saved.bestWord ?? 0),
        bestMargin: Math.max(0, saved.bestMargin ?? 0),
      };
    }
  } catch {
    /* a corrupt value is not worth failing over */
  }
  return { proWins: 0, bestWord: 0, bestMargin: 0 };
}

function storeCareer(career: Career): void {
  try {
    localStorage.setItem(CAREER_KEY, JSON.stringify(career));
  } catch {
    /* private mode, no storage */
  }
}

/** Career bests, persisted locally; start.ng keeps the best run it is sent. */
function recordRun(state: DuelState, outcome: string): Career {
  const career = loadCareer();
  // A longer clock is an easier game, so it never touches the ranked bests.
  if (!matchRanked) return career;
  if (outcome === "you" && difficulty === "pro") career.proWins += 1;
  for (const round of state.history) {
    career.bestWord = Math.max(career.bestWord, round.yourScore);
    if (round.winner === "you") {
      career.bestMargin = Math.max(career.bestMargin, round.damage);
    }
  }
  storeCareer(career);
  return career;
}

function renderPlayerCard(user: StartNgPlayer | null, guest: StartNgPlayer | null): void {
  const shown = user ?? guest;
  if (!shown) return;
  const face = el<HTMLImageElement>("player-face");
  // start.ng serves the avatar; if it does not resolve, drop the frame rather
  // than showing a broken image.
  face.onerror = () => {
    face.hidden = true;
  };
  if (shown.face) {
    face.src = shown.face;
    face.hidden = false;
  } else {
    face.hidden = true;
  }
  el("player-name").textContent = shown.name;
  el("player-account").textContent = user?.account ? `@${user.account}` : "Not signed in";
  const button = el<HTMLButtonElement>("player-sign-in");
  button.hidden = !!user;
  button.onclick = () => {
    location.href = signInUrl();
  };
  el("player-card").hidden = false;
}

async function refreshPlayer(): Promise<void> {
  const reply = await whoAmI();
  if (!reply) return;
  me = reply.user ?? null;
  renderPlayerCard(reply.user, reply.guest);
  void loadBoard();
}

async function loadBoard(): Promise<void> {
  const entries = await readBoard(10);
  if (!entries) return;
  const list = el("board-list");
  if (entries.length === 0) {
    list.innerHTML = `<li class="board-empty">No runs saved yet.</li>`;
    el("board-card").hidden = false;
    return;
  }
  list.innerHTML = entries
    .map((entry: BoardEntry) => {
      const mine = !!me && me.id !== undefined && entry.player_id === me.id;
      const stats = Object.keys(STAT_LABELS)
        .map((key) => `${STAT_LABELS[key]} ${entry.stats[key] ?? 0}`)
        .join(" · ");
      return (
        `<li class="${mine ? "me" : ""}">` +
        `<span class="board-rank">${entry.rank}</span>` +
        `<span class="board-name">${escapeHtml(entry.name)}</span>` +
        `<span class="board-stats">${stats}</span>` +
        `</li>`
      );
    })
    .join("");
  el("board-card").hidden = false;
}

async function submitRun(career: Career): Promise<void> {
  const note = el("run-note");
  if (!matchRanked) {
    note.textContent = "Not ranked — only 20-second runs count.";
    return;
  }
  if (career.bestWord === 0) return;
  if (!me) {
    note.textContent = "Sign in to save your score.";
    return;
  }
  const reply = await saveScore({
    pro_wins: career.proWins,
    best_word: career.bestWord,
    best_margin: career.bestMargin,
  });
  if (!reply) {
    note.textContent = "Could not reach start.ng.";
    return;
  }
  if (reply.ok === false) {
    note.textContent = reply.error ?? "That run was not saved.";
    return;
  }
  const improved = !!reply.result?.improved;
  note.textContent = improved
    ? `New best — you are #${reply.result?.rank}.`
    : `Not your best this time (#${reply.result?.rank}).`;
  note.classList.toggle("good", improved);
  void loadBoard();
}

/* ----------------------------------------------------------------- boot --- */

function init(): void {
  el("btn-start").addEventListener("click", () => startMatch(false));
  el("btn-daily").addEventListener("click", () => {
    difficulty = "pro";
    buildTitle();
    startMatch(true);
  });
  el("btn-shuffle").addEventListener("click", shuffleRack);
  el("btn-clear").addEventListener("click", clearWord);
  el("btn-pass").addEventListener("click", () => play(true));
  el("btn-play").addEventListener("click", () => play(false));
  el("btn-next").addEventListener("click", nextRound);
  window.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", () => {
    // Freeze the board in a hidden tab. The clock is wall-clock, so this is not
    // a way to buy time — it only stops a clash burning frames in the dark.
    arena.setPaused(document.hidden);
    if (!document.hidden) void refreshPlayer();
  });
  window.addEventListener("focus", () => void refreshPlayer());
}

async function boot(): Promise<void> {
  try {
    await loadDictionary();
    el("dict-note").textContent = `${wordCount().toLocaleString()} words · ENABLE list`;
    buildTitle();
    show("title");
    void refreshPlayer();
    void loadBoard();
  } catch (error) {
    el("boot-msg").textContent = `Could not load the word list — ${(error as Error).message}`;
  }
}

declare global {
  interface Window {
    __pm3?: Record<string, unknown>;
  }
}

/** Local-only observability, so the shipped build cannot reach the solver. */
function installDevHook(): void {
  const host = location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return;
  window.__pm3 = {
    duel: () => duel,
    rack: () => rack,
    built: () => built,
    phase: () => phase,
    difficulty: () => difficulty,
    botWord: () => botWord,
    solve,
    rackFor,
    botPick,
    startMatch,
    setDifficulty: (tier: Difficulty) => {
      difficulty = tier;
    },
    clock: () => clockMs,
    setClock: (ms: number) => {
      clockMs = ms;
    },
    // A tap has to go through the same path the pointer does, so drive it here.
    tapTile,
    untap,
    play,
    timeUp,
    ranked: () => matchRanked,
    nextRound,
    clashLeadMs: CLASH_LEAD_MS,
    arena: () => arena,
    table: () => table,
    // Freeze the board for a moment so a frame can be inspected. It always
    // releases, so a live game can never be left stranded mid-clash.
    freeze: (ms = 3500) => {
      arena.setPaused(true);
      window.setTimeout(() => arena.setPaused(false), Math.min(ms, 15000));
    },
  };
}

init();
installDevHook();
void boot();
