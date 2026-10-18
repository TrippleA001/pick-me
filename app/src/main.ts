import "./style.css";
import { BLANK, letterValue, scorePlaced } from "./game/letters";
import type { Placed } from "./game/letters";
import { DIFFICULTY_LABEL, botPick } from "./game/bot";
import type { Difficulty } from "./game/bot";
import {
  HP_START,
  newDuel,
  outcomeOf,
  rackFor,
  resolveRound,
  wordToPlaced,
} from "./game/duel";
import type { DuelState, RoundResult, Side } from "./game/duel";
import { buildStudyCard } from "./game/coach";
import { hash32, mulberry32, todaySeed } from "./game/rng";
import { isWord, loadDictionary, solve, wordCount } from "./game/words";
import { readBoard, saveScore, signInUrl, whoAmI } from "./startng";
import type { BoardEntry, StartNgPlayer } from "./startng";

/**
 * Only this clock is ranked. More time is genuinely an easier game, so a run
 * played on a longer clock is kept off the leaderboard.
 */
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

type Screen = "boot" | "title" | "match" | "result";

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

const TIERS: Difficulty[] = ["rookie", "club", "pro"];
const TIER_BLURB: Record<Difficulty, string> = {
  rookie: "weak words",
  club: "strong words",
  pro: "the best word",
};

interface Built {
  slot: number;
  letter: string;
}

let difficulty: Difficulty = "club";
let clockMs = RANKED_MS;
let matchRanked = true;
let duel: DuelState | null = null;
let rack: string[] = [];
let built: Built[] = [];
let used: boolean[] = [];
let phase: "play" | "reveal" | "done" = "play";
let botWord = "";
let roundNo = 1;
let roundOwner: Side = "you";
let timerEnd = 0;
let rafId = 0;

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
}

/* ---------------------------------------------------------------- match --- */

function startMatch(daily: boolean): void {
  const seed = daily
    ? hash32(`daily:${todaySeed()}`)
    : Math.floor(Math.random() * 4294967296);
  duel = newDuel(seed, daily ? `DAILY ${todaySeed()}` : "EXHIBITION");
  matchRanked = clockMs === RANKED_MS;
  show("match");
  startRound();
}

function startRound(): void {
  if (!duel) return;
  if (duel.over) {
    showResult();
    return;
  }

  rack = rackFor(duel.seed, duel.round);
  built = [];
  used = rack.map(() => false);
  botWord = "";
  phase = "play";
  roundNo = duel.round;
  roundOwner = duel.owner;

  const youRow = el("your-word");
  const themRow = el("their-word");
  youRow.innerHTML = "";
  themRow.innerHTML = "";
  youRow.classList.remove("won", "lost");
  themRow.classList.remove("won", "lost");
  el("your-score").textContent = "";
  el("their-score").textContent = "";
  el("verdict").innerHTML = "";
  setNotice("");
  el("next-row").classList.add("hidden");

  renderHud();
  renderRound();
  renderRack();
  renderWord();
  renderWall();
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

function stopTimer(): void {
  cancelAnimationFrame(rafId);
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
  clearWord();
  setNotice("Out of time.");
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
      setNotice(`${word.toUpperCase()} is not in the word list.`);
      return;
    }
  }

  phase = "reveal";
  stopTimer();
  setControls(false);

  const rng = mulberry32(hash32(`${duel.seed}:bot:${duel.round}`));
  botWord = botPick(rack, difficulty, rng);
  window.setTimeout(reveal, 420 + rng() * 460);
}

function reveal(): void {
  if (!duel) return;

  const yours: Placed[] = built.map((item) => ({
    letter: item.letter,
    tile: rack[item.slot],
  }));
  const theirs = wordToPlaced(botWord, rack);
  const { state, result } = resolveRound(duel, rack, yours, botWord);

  const youRow = el("your-word");
  const themRow = el("their-word");
  renderShown(youRow, yours);
  renderShown(themRow, theirs);
  el("your-score").textContent = String(result.yourScore);
  el("their-score").textContent = String(result.theirScore);

  const ownerIsYou = result.owner === "you";
  window.setTimeout(() => markRow(ownerIsYou ? youRow : themRow, "locked"), 240);
  window.setTimeout(() => markRow(ownerIsYou ? themRow : youRow, "locked"), 760);

  window.setTimeout(() => {
    const won = result.winner === "you" ? youRow : themRow;
    const lost = result.winner === "you" ? themRow : youRow;
    markRow(won, "win");
    markRow(lost, "dead");
    won.classList.add("won");
    lost.classList.add("lost");
    youRow.classList.add(result.winner === "you" ? "won" : "lost");
    themRow.classList.add(result.winner === "them" ? "won" : "lost");
    el("your-score").classList.add(result.winner === "you" ? "good" : "bad");
    el("their-score").classList.add(result.winner === "them" ? "good" : "bad");

    duel = state;
    phase = "done";
    renderHud();
    renderVerdict(result);
    renderWall();
    el("next-row").classList.remove("hidden");
    el("btn-next").textContent = state.over ? "See the study card" : "Next round";
  }, 1340);
}

function markRow(row: HTMLElement, cls: string): void {
  for (const child of Array.from(row.children)) child.classList.add(cls);
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
  built.push({ slot, letter: rack[slot] });
  used[slot] = true;
  renderRack();
  renderWord();
}

function tapBlank(slot: number, letter: string): void {
  if (phase !== "play" || used[slot]) return;
  built.push({ slot, letter });
  used[slot] = true;
  renderRack();
  renderWord();
}

function untap(index: number): void {
  if (phase !== "play") return;
  const item = built[index];
  if (!item) return;
  used[item.slot] = false;
  built.splice(index, 1);
  renderRack();
  renderWord();
}

function clearWord(): void {
  built = [];
  used = rack.map(() => false);
  renderRack();
  renderWord();
}

function shuffleRack(): void {
  if (phase !== "play") return;
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
  renderRack();
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
  const exact = rack.findIndex(
    (tile, index) => !used[index] && tile === letter,
  );
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
  el("them-tag").textContent = DIFFICULTY_LABEL[difficulty];
  el("you-tag").classList.toggle("owner", roundOwner === "you");
  el("them-tag").classList.toggle("owner", roundOwner === "them");
}

function tileNode(item: { letter: string; tile: string }): HTMLButtonElement {
  const button = document.createElement("button");
  const isBlank = item.tile === BLANK;
  button.className = "tile" + (isBlank ? " blank" : "");
  button.innerHTML =
    `<span class="tl">${item.letter}</span>` +
    `<span class="tv">${isBlank ? "0" : letterValue(item.letter)}</span>`;
  return button;
}

function renderShown(
  host: HTMLElement,
  shown: { letter: string; tile: string }[],
): void {
  host.innerHTML = "";
  for (const item of shown) host.appendChild(tileNode(item));
}

function renderRack(): void {
  const host = el("rack");
  host.innerHTML = "";
  rack.forEach((tile, index) => {
    const isBlank = tile === BLANK;
    const button = document.createElement("button");
    button.className =
      "tile rack-tile" + (used[index] ? " used" : "") + (isBlank ? " blank" : "");
    button.innerHTML =
      `<span class="tl">${isBlank ? "★" : tile}</span>` +
      `<span class="tv">${isBlank ? "0" : letterValue(tile)}</span>`;
    button.addEventListener("click", () => tapTile(index));
    host.appendChild(button);
  });
}

function renderWord(): void {
  const host = el("your-word");
  host.innerHTML = "";
  built.forEach((item, index) => {
    const node = tileNode({ letter: item.letter, tile: rack[item.slot] });
    node.addEventListener("click", () => untap(index));
    host.appendChild(node);
  });
}

function renderVerdict(result: RoundResult): void {
  const youWon = result.winner === "you";
  const lines: string[] = [];
  lines.push(
    `<div class="verdict-line ${youWon ? "good" : "bad"}">` +
      `${youWon ? "YOUR WORD STANDS" : "THEIR WORD STANDS"} — ` +
      `${youWon ? result.yourScore : result.theirScore} to ` +
      `${youWon ? result.theirScore : result.yourScore}</div>`,
  );
  if (result.youBingo) lines.push(`<div class="verdict-sub">Bingo — all seven tiles. +50.</div>`);
  lines.push(
    `<div class="verdict-sub">${youWon ? `${result.damage} damage dealt` : `${result.damage} damage taken`}</div>`,
  );
  if (result.yourScore === result.theirScore) {
    lines.push(`<div class="verdict-sub">A draw — the turn owns it.</div>`);
  }
  if (result.best) {
    const found = result.yourScore >= result.best.score;
    lines.push(
      `<div class="oracle${found ? " hit" : ""}">Best available: ` +
        `<b>${result.best.word.toUpperCase()}</b> · ${result.best.score}` +
        `${found ? " — you found it" : ""}</div>`,
    );
  }
  el("verdict").innerHTML = lines.join("");
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

function setNotice(text: string): void {
  const node = el("notice");
  node.textContent = text;
  node.classList.remove("shake");
  if (text) {
    void node.offsetWidth;
    node.classList.add("shake");
  }
}

/* --------------------------------------------------------------- result --- */

function showResult(): void {
  if (!duel) return;
  const state = duel;
  const outcome = outcomeOf(state);
  const card = buildStudyCard(state.history, state.seed);

  const title =
    outcome === "you"
      ? "YOU SURVIVED"
      : outcome === "them"
        ? "DISMANTLED"
        : "STALEMATE";
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
  if (shown.face) el<HTMLImageElement>("player-face").src = shown.face;
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
  // The player may sign in or out on start.ng and come back to this tab.
  document.addEventListener("visibilitychange", () => {
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
    __pm?: Record<string, unknown>;
  }
}

/** Local-only observability, so the shipped build cannot reach the solver. */
function installDevHook(): void {
  const host = location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return;
  window.__pm = {
    duel: () => duel,
    rack: () => rack,
    built: () => built,
    phase: () => phase,
    difficulty: () => difficulty,
    solve,
    rackFor,
    botPick,
    scorePlaced,
    wordToPlaced,
    newDuel,
    outcomeOf,
    resolveRound,
    startMatch,
    setDifficulty: (tier: Difficulty) => {
      difficulty = tier;
    },
    clock: () => clockMs,
    setClock: (ms: number) => {
      clockMs = ms;
    },
    timeUp,
    ranked: () => matchRanked,
  };
}

init();
installDevHook();
void boot();
