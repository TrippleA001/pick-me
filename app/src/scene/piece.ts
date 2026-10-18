/**
 * One tile: a glass body with the letter printed on its face.
 *
 * The letter being a decal on a single face is the whole reason the clash
 * works. Turn the tile around and the body hides the letter; make the body
 * translucent and you read that same letter through it, mirrored, the way it
 * would look in your hand.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BLANK, letterValue } from "../game/letters";

export const TILE = 1;
export const THICK = 0.3;
export const GAP = 0.16;
export const STEP = TILE + GAP;

const faceCache = new Map<string, THREE.CanvasTexture>();

/** Letter and value, drawn once per (letter, value, colour, struck) combination. */
export function faceTexture(
  letter: string,
  value: number,
  colour: string,
  strike: boolean,
): THREE.CanvasTexture {
  const cacheKey = `${letter}|${value}|${colour}|${strike}`;
  const cached = faceCache.get(cacheKey);
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colour;
  ctx.font = "bold 152px 'Arial Black', Arial, sans-serif";
  ctx.fillText(letter, size / 2, size / 2 - 10);

  if (strike) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = 15;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(34, size / 2 - 10);
    ctx.lineTo(size - 34, size / 2 - 10);
    ctx.stroke();
  }

  ctx.font = "bold 46px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#8b97a5";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(String(value), size - 24, size - 16);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  faceCache.set(cacheKey, texture);
  return texture;
}

const bodyGeometry = new RoundedBoxGeometry(TILE, TILE, THICK, 3, 0.09);
const faceGeometry = new THREE.PlaneGeometry(TILE * 0.92, TILE * 0.92);

/** Body colours: your tiles carry a green cast, theirs a cold one. */
export const BODY_MINE = "#1c2416";
export const BODY_THEIRS = "#1b2129";
export const BODY_DEAD = "#2a1416";

export interface Piece {
  root: THREE.Group;
  box: THREE.Mesh;
  body: THREE.MeshStandardMaterial;
  face: THREE.MeshBasicMaterial;
  letter: string;
  value: number;
}

export function makePiece(letter: string, colour: string): Piece {
  // A blank shows as a star and is worth nothing until it is played as a letter.
  const shown = letter === BLANK ? "★" : letter;
  const value = letter === BLANK ? 0 : letterValue(letter);
  const root = new THREE.Group();

  const body = new THREE.MeshStandardMaterial({
    color: colour,
    roughness: 0.72,
    metalness: 0.08,
    emissive: new THREE.Color("#000000"),
    transparent: true,
    opacity: 1,
  });
  const box = new THREE.Mesh(bodyGeometry, body);
  box.castShadow = true;
  box.receiveShadow = true;
  root.add(box);

  const face = new THREE.MeshBasicMaterial({
    map: faceTexture(shown, value, "#eef2f6", false),
    transparent: true,
    side: THREE.DoubleSide,
  });
  const decal = new THREE.Mesh(faceGeometry, face);
  decal.position.z = THICK / 2 + 0.014;
  root.add(decal);

  return { root, box, body, face, letter, value };
}

export function disposePiece(piece: Piece): void {
  piece.body.dispose();
  piece.face.dispose();
}

/**
 * One knob for the whole tile. A ghosted tile writes no depth and casts no
 * shadow, so it reads as something not yet revealed rather than as glass.
 * `body` is what hides the word: keep it opaque and the letter on the far face
 * stays out of sight however the tile is turned.
 */
export function setPieceLook(piece: Piece, body: number, letter: number): void {
  const solid = body > 0.95;
  piece.body.opacity = body;
  piece.face.opacity = letter;
  piece.body.depthWrite = solid;
  piece.face.depthWrite = solid;
  piece.box.castShadow = solid;
}

/** Restrike a piece as the loser: red letter, struck through, dead body. */
export function strikePiece(piece: Piece): void {
  piece.face.map = faceTexture(piece.letter, piece.value, "#ff6b6b", true);
  piece.face.needsUpdate = true;
  piece.body.color.set(BODY_DEAD);
}
