/**
 * The table: two racks, two words, and the clash.
 *
 * Both players are dealt the same letters, so both racks are on the table and
 * both are readable — that the trays match is the whole premise of the game.
 * What stays secret is the selection: their tiles leave their tray when they
 * play and land face-down, so you watch a word arrive without ever reading it.
 *
 * At time up the words dissolve, turn to face each other, and clash.
 */
import * as THREE from "three";
import { BLANK } from "../game/letters";
import type { Arena } from "./arena";
import {
  BODY_MINE,
  BODY_THEIRS,
  STEP,
  TILE,
  disposePiece,
  makePiece,
  setPieceLook,
  strikePiece,
  type Piece,
} from "./piece";

/* ---------------------------------------------------------------- timing --- */

const D_DISSOLVE = 0.9;
const D_FLIP = 1.05;
const D_HOLD = 0.45;
const D_CLOSE = 0.7;
const D_IMPACT = 0.18;
const D_SETTLE = 2.6;
const D_REVEAL = 0.55;

/** Time from the start of the clash to the hit — the beat before the scores land. */
export const CLASH_LEAD_MS = (D_DISSOLVE + D_FLIP + D_HOLD + D_CLOSE) * 1000;

/** While a word is a secret the body is opaque; at the face-off it goes glass. */
const GHOST = 0.1;
const GLASS_BODY = 0.32;
const GLASS_LETTER = 1;

const TILT = -0.44;
const TILE_Y = 0.54;
const GRAVITY = 30;

/* ---------------------------------------------------------------- layout --- */

const RACK_Z = 4.6;
const RACK_SCALE = 0.78;
const MINE_Z = 1.9;
const THEIRS_Z = -1.9;
const THEIR_RACK_Z = -4.6;
const MEET_Z = 0.42;

type Side = "you" | "them";
export type Stage =
  | "idle"
  | "dissolve"
  | "flip"
  | "hold"
  | "close"
  | "impact"
  | "flying"
  | "done";

export interface BuiltTile {
  letter: string;
  slot: number;
}

export interface TableHooks {
  onRackTap(slot: number): void;
  onWordTap(index: number): void;
}

/** A tile that has been laid on the board and can be choreographed. */
interface Actor {
  piece: Piece;
  side: Side;
  from: THREE.Vector3;
  to: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  flying: boolean;
  /** The resting turn, which puts this row's face toward its owner's side. */
  faceTurn: number;
}

/** A tile on its way from a rack to the board. */
interface Hop {
  piece: Piece;
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromScale: number;
  toScale: number;
  time: number;
  duration: number;
}

/** A tile on its way out of their tray, turning its face away as it lands. */
interface Deal {
  piece: Piece;
  from: THREE.Vector3;
  to: THREE.Vector3;
  time: number;
  delay: number;
  duration: number;
}

const easeIn = (p: number) => p * p;
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) ** 2);

export class Table {
  private arena: Arena;
  private hooks: TableHooks;

  private mineGroup = new THREE.Group();
  private theirsGroup = new THREE.Group();
  private rackGroup = new THREE.Group();
  private theirRackGroup = new THREE.Group();

  private mine: Actor[] = [];
  private theirs: Actor[] = [];
  private rackPieces: Piece[] = [];
  private theirRack: string[] = [];
  private theirRackPieces: Piece[] = [];
  private theirRackUsed: boolean[] = [];
  private hops: Hop[] = [];
  private deals: Deal[] = [];

  private stage: Stage = "idle";
  private stageTime = 0;
  private waveTime = -1;
  private revealTime = -1;
  private winner: Side = "you";
  private onImpact: (() => void) | null = null;
  private onSettled: (() => void) | null = null;
  private onDealt: (() => void) | null = null;
  private shake = 0;
  private enabled = true;

  private rackPicks = new Map<THREE.Object3D, number>();
  private wordPicks = new Map<THREE.Object3D, number>();

  constructor(arena: Arena, hooks: TableHooks) {
    this.arena = arena;
    this.hooks = hooks;
    arena.board.add(
      this.theirsGroup,
      this.mineGroup,
      this.rackGroup,
      this.theirRackGroup,
    );
    arena.onFrame((dt) => this.update(dt));
    arena.onTap((hits) => this.resolveTap(hits));
  }

  /* ------------------------------------------------------------- picking --- */

  private resolveTap(hits: THREE.Object3D[]): void {
    if (!this.enabled) return;
    for (const hit of hits) {
      let node: THREE.Object3D | null = hit;
      while (node) {
        const slot = this.rackPicks.get(node);
        if (slot !== undefined) {
          this.hooks.onRackTap(slot);
          return;
        }
        const index = this.wordPicks.get(node);
        if (index !== undefined) {
          this.hooks.onWordTap(index);
          return;
        }
        node = node.parent;
      }
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  private slotX(index: number, count: number, scale: number): number {
    const step = STEP * scale;
    const width = count * step - (step - TILE * scale);
    return -width / 2 + (TILE * scale) / 2 + index * step;
  }

  /* ----------------------------------------------------------------- rack --- */

  setRack(rack: string[], used: boolean[]): void {
    if (this.rackPieces.length !== rack.length) {
      this.clearRack();
      rack.forEach((letter, index) => {
        const piece = makePiece(letter, BODY_MINE);
        piece.root.scale.setScalar(RACK_SCALE);
        piece.root.position.set(
          this.slotX(index, rack.length, RACK_SCALE),
          TILE_Y - 0.06,
          RACK_Z,
        );
        piece.root.rotation.x = TILT;
        this.rackGroup.add(piece.root);
        this.rackPieces.push(piece);
        this.rackPicks.set(piece.root, index);
      });
    }
    this.rackPieces.forEach((piece, index) => {
      const spent = used[index];
      const scale = spent ? RACK_SCALE * 0.86 : RACK_SCALE;
      if (this.hops.every((hop) => hop.piece !== piece)) piece.root.scale.setScalar(scale);
      const on = spent ? 0.16 : 1;
      setPieceLook(piece, on, on);
      piece.root.position.y = TILE_Y - 0.06 - (spent ? 0.22 : 0);
    });
  }

  private clearRack(): void {
    for (const piece of this.rackPieces) {
      this.rackGroup.remove(piece.root);
      disposePiece(piece);
    }
    this.rackPieces = [];
    this.rackPicks.clear();
  }

  /* ------------------------------------------------------------ their rack --- */

  /**
   * Their tray, on the far side and facing you. It holds the same letters as
   * yours — that is the rule of the game, and there is nothing to hide in it.
   */
  setTheirRack(rack: string[]): void {
    this.clearTheirRack();
    this.theirRack = rack.slice();
    this.theirRackUsed = rack.map(() => false);

    rack.forEach((letter, index) => {
      const piece = makePiece(letter, BODY_THEIRS);
      piece.root.scale.setScalar(RACK_SCALE);
      piece.root.position.set(
        this.slotX(index, rack.length, RACK_SCALE),
        TILE_Y - 0.06,
        THEIR_RACK_Z,
      );
      piece.root.rotation.x = TILT;
      setPieceLook(piece, 0.95, 0.95);
      this.theirRackGroup.add(piece.root);
      this.theirRackPieces.push(piece);
    });
  }

  private clearTheirRack(): void {
    for (const piece of this.theirRackPieces) {
      this.theirRackGroup.remove(piece.root);
      disposePiece(piece);
    }
    this.theirRackPieces = [];
    this.theirRack = [];
    this.theirRackUsed = [];
  }

  /**
   * Spend a tile from their tray for a given letter. Real tiles go before
   * blanks, which is the same order the solver spends them in.
   */
  private takeTheirTile(letter: string): number {
    const exact = this.theirRack.findIndex(
      (tile, index) => !this.theirRackUsed[index] && tile === letter,
    );
    const pick =
      exact >= 0
        ? exact
        : this.theirRack.findIndex(
            (tile, index) => !this.theirRackUsed[index] && tile === BLANK,
          );
    if (pick < 0) return -1;
    this.theirRackUsed[pick] = true;
    // The tray gap is the tell that they took a tile; the tile itself is gone.
    setPieceLook(this.theirRackPieces[pick], 0.02, 0.02);
    return pick;
  }

  /** Empty the trays at time up, which reads as the round closing. */
  private fadeRacks(): void {
    for (const piece of this.rackPieces) {
      setPieceLook(piece, 0.12, 0.12);
      piece.root.position.y = TILE_Y - 0.3;
    }
    this.rackPicks.clear();
    for (const piece of this.theirRackPieces) {
      setPieceLook(piece, 0.08, 0.08);
    }
  }

  /* ------------------------------------------------------------ your word --- */

  /**
   * Lay your word on the board. The last tile, when it is new, hops out of the
   * rack so the tap feels like it moved something.
   */
  setWord(built: BuiltTile[]): void {
    const grew = built.length > this.mine.length;
    const addedIndex = grew ? built.length - 1 : -1;

    for (const actor of this.mine) {
      this.mineGroup.remove(actor.piece.root);
      disposePiece(actor.piece);
    }
    this.mine = [];
    this.wordPicks.clear();

    built.forEach((item, index) => {
      const piece = makePiece(item.letter, BODY_MINE);
      const target = new THREE.Vector3(
        this.slotX(index, built.length, 1),
        TILE_Y,
        MINE_Z,
      );
      piece.root.rotation.x = TILT;
      piece.root.position.copy(target);
      this.mineGroup.add(piece.root);
      this.wordPicks.set(piece.root, index);

      const actor: Actor = {
        piece,
        side: "you",
        from: target.clone(),
        // The charge: your word leans in toward the middle at the clash.
        to: new THREE.Vector3(target.x, target.y, MEET_Z),
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        flying: false,
        faceTurn: 0,
      };
      this.mine.push(actor);

      if (index === addedIndex) {
        const source = this.rackPieces[item.slot];
        const from = source
          ? source.root.position.clone()
          : target.clone().setZ(RACK_Z);
        this.hops.push({
          piece,
          from,
          to: target.clone(),
          fromScale: RACK_SCALE,
          toScale: 1,
          time: 0,
          duration: 0.3,
        });
        piece.root.position.copy(from);
        piece.root.scale.setScalar(RACK_SCALE);
      }
    });
  }

  /* ----------------------------------------------------------- their word --- */

  /**
   * They play. Each tile lifts out of their tray, turns its face away as it
   * travels, and lands on the board back-up — so the word arrives where you
   * can see it arrive, and stays unreadable until the clash.
   */
  dealTheirs(word: string, onDealt: () => void): void {
    this.clearTheirs();
    const letters = word.split("");
    // Spend the tray first, so each tile can lift from the slot it left.
    const sources = letters.map((letter) => this.takeTheirTile(letter));

    const stride = 0.09;
    letters.forEach((letter, index) => {
      const piece = makePiece(letter, BODY_THEIRS);
      const target = new THREE.Vector3(
        this.slotX(index, letters.length, 1),
        TILE_Y,
        THEIRS_Z,
      );
      piece.root.rotation.x = TILT;
      piece.root.rotation.y = 0;
      this.theirsGroup.add(piece.root);

      const source = sources[index];
      const from =
        source >= 0
          ? this.theirRackPieces[source].root.position.clone()
          : target.clone().setZ(THEIR_RACK_Z);
      piece.root.position.copy(from);

      this.theirs.push({
        piece,
        side: "them",
        from: target.clone(),
        to: new THREE.Vector3(target.x, target.y, -MEET_Z),
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        flying: false,
        faceTurn: Math.PI,
      });
      this.deals.push({
        piece,
        from,
        to: target.clone(),
        time: 0,
        delay: index * stride,
        duration: 0.42,
      });
    });

    if (letters.length === 0) {
      onDealt();
      return;
    }
    this.onDealt = onDealt;
  }

  private clearTheirs(): void {
    for (const actor of this.theirs) {
      this.theirsGroup.remove(actor.piece.root);
      disposePiece(actor.piece);
    }
    this.theirs = [];
    this.deals = [];
    this.onDealt = null;
  }

  /* ---------------------------------------------------------------- clash --- */

  /**
   * Run the whole beat. `onImpact` fires exactly when the scores should land,
   * which is the moment after the words hit — not a frame earlier.
   */
  runClash(winner: Side, onImpact: () => void, onSettled: () => void): void {
    this.enabled = false;
    this.winner = winner;
    this.onImpact = onImpact;
    this.onSettled = onSettled;
    this.stage = "dissolve";
    this.stageTime = 0;
    this.fadeRacks();
  }

  private all(): Actor[] {
    return [...this.theirs, ...this.mine];
  }

  private setLook(body: number, letter: number): void {
    for (const actor of this.all()) setPieceLook(actor.piece, body, letter);
  }

  private resolveClash(): void {
    this.stage = "impact";
    this.stageTime = 0;
    this.waveTime = 0;
    this.revealTime = -1;
    this.shake = 0.5;
    this.arena.impactLight.intensity = 110;

    for (const actor of this.all()) {
      if (actor.side === this.winner) {
        actor.piece.body.emissive.set("#4f7118");
        continue;
      }
      // The loser comes off the board: solid, struck through, thrown and spun.
      strikePiece(actor.piece);
      setPieceLook(actor.piece, 1, 1);
      actor.flying = true;
      const outward = actor.side === "you" ? 1 : -1;
      actor.vel.set(
        (Math.random() - 0.5) * 4,
        7.5 + Math.random() * 3.5,
        outward * (6 + Math.random() * 3.5),
      );
      actor.spin.set(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 10,
      );
    }

    this.onImpact?.();
    this.onImpact = null;
  }

  /* ----------------------------------------------------------------- loop --- */

  private update(dt: number): void {
    for (const hop of this.hops) {
      hop.time += dt;
      const p = Math.min(1, hop.time / hop.duration);
      const e = easeOut(p);
      hop.piece.root.position.lerpVectors(hop.from, hop.to, e);
      hop.piece.root.position.y += Math.sin(p * Math.PI) * 0.7;
      hop.piece.root.scale.setScalar(
        hop.fromScale + (hop.toScale - hop.fromScale) * e,
      );
    }
    this.hops = this.hops.filter((hop) => hop.time < hop.duration);

    this.stepDeals(dt);

    if (this.stage === "idle") return;
    this.stageTime += dt;

    // The ring runs on its own clock so it keeps fading through the settle.
    if (this.waveTime >= 0) {
      this.waveTime += dt;
      const w = Math.min(1, this.waveTime / 0.55);
      this.arena.shockwave.scale.setScalar(1 + w * 5);
      this.arena.shockwave.material.opacity = 0.8 * (1 - w) ** 1.5;
    }

    // The flash and the board shake both decay from the hit.
    this.arena.impactLight.intensity = Math.max(
      0,
      this.arena.impactLight.intensity - dt * 260,
    );
    this.shake = Math.max(0, this.shake - dt * 1.7);
    this.arena.setShake(this.shake);

    if (this.stage === "dissolve") {
      // Time up: the words dissolve where they stand, still facing their owners.
      const p = Math.min(1, this.stageTime / D_DISSOLVE);
      const e = easeInOut(p);
      this.setLook(1 - (1 - GHOST) * e, 1 - (1 - GHOST) * e);
      if (p >= 1) {
        this.stage = "flip";
        this.stageTime = 0;
      }
      return;
    }

    if (this.stage === "flip") {
      // Both words turn to face each other: yours turns its back to you, theirs
      // turns its face to you. Their bodies go to glass as they turn, which is
      // what lets you read the far side of your own word, mirrored.
      const p = Math.min(1, this.stageTime / D_FLIP);
      const e = easeOut(p);
      this.setLook(
        GHOST + (GLASS_BODY - GHOST) * e,
        GHOST + (GLASS_LETTER - GHOST) * e,
      );
      const hop = Math.sin(p * Math.PI) * 0.7;
      for (const actor of this.all()) {
        // Turn through 180 degrees, from each row's resting facing to the other.
        const end = Math.PI - actor.faceTurn;
        actor.piece.root.rotation.y = actor.faceTurn + (end - actor.faceTurn) * e;
        actor.piece.root.position.y = TILE_Y + hop;
      }
      if (p >= 1) {
        this.stage = "hold";
        this.stageTime = 0;
        for (const actor of this.all()) actor.piece.root.position.y = TILE_Y;
      }
      return;
    }

    if (this.stage === "hold") {
      // The stand-off. Nothing moves; the two words just look at each other.
      if (this.stageTime >= D_HOLD) {
        this.stage = "close";
        this.stageTime = 0;
      }
      return;
    }

    if (this.stage === "close") {
      const p = Math.min(1, this.stageTime / D_CLOSE);
      const e = easeIn(p);
      for (const actor of this.all()) {
        actor.piece.root.position.lerpVectors(actor.from, actor.to, e);
        const lean = e * 0.18;
        actor.piece.root.rotation.x = TILT + (actor.side === "you" ? -lean : lean);
      }
      if (p >= 1) this.resolveClash();
      return;
    }

    if (this.stage === "impact") {
      if (this.stageTime > D_IMPACT) {
        this.stage = "flying";
        this.stageTime = 0;
        this.revealTime = 0;
      }
      return;
    }

    if (this.stage === "flying" || this.stage === "done") {
      if (this.revealTime >= 0) {
        this.revealTime += dt;
        const r = easeOut(Math.min(1, this.revealTime / D_REVEAL));
        for (const actor of this.all()) {
          if (actor.side !== this.winner) continue;
          // The word that survived turns back to you and solidifies. After the
          // flip every row sits at PI - faceTurn; facing you is zero.
          const start = Math.PI - actor.faceTurn;
          const sign = actor.side === "you" ? -1 : 1;
          actor.piece.root.rotation.y = start * (1 - r);
          actor.piece.root.rotation.x = TILT + sign * 0.18 * (1 - r);
          setPieceLook(actor.piece, GLASS_BODY + (1 - GLASS_BODY) * r, GLASS_LETTER);
        }
      }

      const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.007);
      for (const actor of this.all()) {
        if (actor.side === this.winner) {
          actor.piece.body.emissiveIntensity = pulse;
          continue;
        }
        if (!actor.flying) continue;
        actor.vel.y -= GRAVITY * dt;
        actor.piece.root.position.addScaledVector(actor.vel, dt);
        actor.piece.root.rotation.x += actor.spin.x * dt;
        actor.piece.root.rotation.y += actor.spin.y * dt;
        actor.piece.root.rotation.z += actor.spin.z * dt;
      }
      if (this.stage === "flying" && this.stageTime > D_SETTLE) {
        this.stage = "done";
        this.onSettled?.();
        this.onSettled = null;
      }
    }
  }

  /** Advance the tiles leaving their tray, and say so when the last has landed. */
  private stepDeals(dt: number): void {
    if (this.deals.length === 0) return;
    for (const deal of this.deals) {
      deal.time += dt;
      if (deal.time <= deal.delay) continue;
      const p = Math.min(1, (deal.time - deal.delay) / deal.duration);
      const e = easeInOut(p);
      deal.piece.root.position.lerpVectors(deal.from, deal.to, e);
      deal.piece.root.position.y += Math.sin(p * Math.PI) * 0.9;
      // Turns its face away as it travels, so the board never shows the word.
      deal.piece.root.rotation.y = Math.PI * e;
    }
    if (this.deals.some((deal) => deal.time < deal.delay + deal.duration)) return;
    this.deals = [];
    const done = this.onDealt;
    this.onDealt = null;
    done?.();
  }

  /** The clash is over when the tiles have finished tumbling. */
  isSettled(): boolean {
    return this.stage === "done";
  }

  /** Which beat is playing. Read-only; used by the local dev hook. */
  get moment(): Stage {
    return this.stage;
  }

  /* ---------------------------------------------------------------- reset --- */

  /** Clear the board for the next round. */
  reset(): void {
    for (const actor of this.all()) {
      const group = actor.side === "you" ? this.mineGroup : this.theirsGroup;
      group.remove(actor.piece.root);
      disposePiece(actor.piece);
    }
    this.mine = [];
    this.theirs = [];
    this.hops = [];
    this.deals = [];
    this.wordPicks.clear();
    this.clearRack();
    this.clearTheirRack();
    this.stage = "idle";
    this.stageTime = 0;
    this.waveTime = -1;
    this.revealTime = -1;
    this.onImpact = null;
    this.onSettled = null;
    this.onDealt = null;
    this.shake = 0;
    this.enabled = true;
    this.arena.setShake(0);
    this.arena.impactLight.intensity = 0;
    this.arena.shockwave.material.opacity = 0;
    this.arena.world.position.set(0, 0, 0);
  }
}
