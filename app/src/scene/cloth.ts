/**
 * The board cloths.
 *
 * Ankara and adire are real Nigerian textiles, so these are procedural
 * evocations in the register of each — a saturated wax-print grid, and an
 * indigo resist-dye repeat — not reproductions of any particular pattern.
 * They are meant to be swapped for real scans.
 */
import * as THREE from "three";

export type Fabric = "ankara" | "adire";

/** Ankara, in the register of a wax print: a saturated ground, bold flat motifs. */
function ankaraCloth(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  const ground = "#b8391f";
  const gold = "#e8a723";
  const teal = "#12705f";
  const cream = "#f4ede1";

  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, size, size);

  const cells = 4;
  const cell = size / cells;

  for (let gy = 0; gy < cells; gy += 1) {
    for (let gx = 0; gx < cells; gx += 1) {
      const cx = gx * cell + cell / 2;
      const cy = gy * cell + cell / 2;
      const half = (gx + gy) % 2 === 0;

      if (half) {
        // A gold disc ringed in teal, with a cream eye.
        ctx.fillStyle = teal;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = gold;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.27, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = cream;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.1, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // A cream diamond, gold-centred, teal-edged.
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = teal;
        ctx.fillRect(-cell * 0.24, -cell * 0.24, cell * 0.48, cell * 0.48);
        ctx.fillStyle = cream;
        ctx.fillRect(-cell * 0.16, -cell * 0.16, cell * 0.32, cell * 0.32);
        ctx.fillStyle = gold;
        ctx.fillRect(-cell * 0.05, -cell * 0.05, cell * 0.1, cell * 0.1);
        ctx.restore();
      }

      // Gold studs at the cell corners, which is what ties the repeat together.
      ctx.fillStyle = gold;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        ctx.beginPath();
        ctx.arc(gx * cell + dx * cell, gy * cell + dy * cell, cell * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Adire, in the register of Yoruba indigo resist-dye: resisted rings and crosses. */
function adireCloth(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  const ground = "#1c2a63";
  const mid = "#4a5da3";
  const pale = "#9fb2e4";
  const milk = "#dbe6fa";

  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, size, size);

  const cells = 4;
  const cell = size / cells;

  for (let gy = 0; gy < cells; gy += 1) {
    for (let gx = 0; gx < cells; gx += 1) {
      const cx = gx * cell + cell / 2;
      const cy = gy * cell + cell / 2;
      const half = (gx + gy) % 2 === 0;

      if (half) {
        // Resisted rings, each one a little looser than the last.
        const rings: Array<[number, string, number]> = [
          [0.36, mid, 0.09],
          [0.26, pale, 0.07],
          [0.15, milk, 0.06],
        ];
        for (const [radius, colour, width] of rings) {
          ctx.strokeStyle = colour;
          ctx.lineWidth = cell * width;
          ctx.beginPath();
          ctx.arc(cx, cy, cell * radius, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = milk;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.04, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // A resisted cross with a cluster of dots in each quadrant.
        ctx.strokeStyle = pale;
        ctx.lineWidth = cell * 0.12;
        ctx.beginPath();
        ctx.moveTo(cx - cell * 0.3, cy);
        ctx.lineTo(cx + cell * 0.3, cy);
        ctx.moveTo(cx, cy - cell * 0.3);
        ctx.lineTo(cx, cy + cell * 0.3);
        ctx.stroke();

        ctx.fillStyle = mid;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = milk;
        for (const [dx, dy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ]) {
          ctx.beginPath();
          ctx.arc(cx + dx * cell * 0.32, cy + dy * cell * 0.32, cell * 0.05, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export const CLOTHS: Record<Fabric, THREE.CanvasTexture> = {
  ankara: ankaraCloth(),
  adire: adireCloth(),
};
for (const cloth of Object.values(CLOTHS)) cloth.repeat.set(4.5, 2);

export const FABRIC_LABEL: Record<Fabric, string> = {
  ankara: "Ankara",
  adire: "Adire",
};

export const FABRIC_BLURB: Record<Fabric, string> = {
  ankara: "wax print",
  adire: "indigo resist",
};

/**
 * A small preview of the cloth, for the setup screen. Drawn from the same
 * canvas the board uses, so the swatch can never drift from the table.
 */
export function fabricSwatch(fabric: Fabric, size: number): HTMLCanvasElement {
  const source = CLOTHS[fabric].image as CanvasImageSource;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(source, 0, 0, size, size);
  return canvas;
}
