/**
 * Fixed anatomy of the specimen, in a 1000 x 1000 coordinate space shared by
 * the canvas renderer and the SVG interaction layer.
 */

export type Pt = { x: number; y: number };

export const ORGANS = {
  brain: { x: 500, y: 128, r: 70 },
  heart: { x: 452, y: 448, r: 54 },
  tumor: { x: 618, y: 700, r: 92 },
} as const;

export const TORSO_BOUNDS = { top: 300, bottom: 905, left: 330, right: 670 };

/** Half-width of the torso interior at a given y, used to keep cells inside the body. */
export function torsoHalfWidth(y: number): number {
  if (y < 300) return 0;
  if (y < 340) return 120 + (y - 300) * 1.3;
  if (y < 560) return 172 - (y - 340) * 0.06;
  if (y < 740) return 159 - (y - 560) * 0.16;
  return 130 + (y - 740) * 0.18;
}

/** Catmull-Rom spline through control points, resampled to evenly spaced points. */
export function spline(points: Pt[], step = 6): Pt[] {
  const dense: Pt[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let t = 0; t < 1; t += 0.05) {
      const t2 = t * t;
      const t3 = t2 * t;
      dense.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  dense.push(points[points.length - 1]);
  const out: Pt[] = [dense[0]];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i];
    let seg = Math.hypot(b.x - a.x, b.y - a.y);
    let t0 = 0;
    while (carry + seg >= step) {
      const need = step - carry;
      t0 += need / Math.hypot(b.x - a.x, b.y - a.y);
      out.push({ x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 });
      seg -= need;
      carry = 0;
    }
    carry += seg;
  }
  return out;
}

export interface Vessel {
  id: string;
  points: Pt[];
  width: number;
  /** Vessels marked `cluster` carry flow into the tumor. */
  cluster?: boolean;
}

const H = ORGANS.heart;
const T = ORGANS.tumor;

export const VESSELS: Vessel[] = [
  {
    id: "aorta",
    width: 7,
    points: spline([
      { x: H.x + 22, y: H.y - 40 },
      { x: 488, y: 352 },
      { x: 530, y: 330 },
      { x: 532, y: 380 },
      { x: 518, y: 520 },
      { x: 514, y: 680 },
      { x: 508, y: 790 },
      { x: 470, y: 860 },
      { x: 440, y: 930 },
    ]),
  },
  {
    id: "iliac-r",
    width: 4,
    points: spline([
      { x: 508, y: 790 },
      { x: 548, y: 860 },
      { x: 572, y: 935 },
    ]),
  },
  {
    id: "carotid-l",
    width: 4,
    points: spline([
      { x: 488, y: 352 },
      { x: 484, y: 290 },
      { x: 478, y: 230 },
      { x: 470, y: 182 },
    ]),
  },
  {
    id: "carotid-r",
    width: 4,
    points: spline([
      { x: 530, y: 330 },
      { x: 520, y: 282 },
      { x: 524, y: 226 },
      { x: 532, y: 182 },
    ]),
  },
  {
    id: "subclavian-l",
    width: 4,
    points: spline([
      { x: 488, y: 352 },
      { x: 420, y: 318 },
      { x: 330, y: 330 },
      { x: 286, y: 400 },
      { x: 262, y: 560 },
      { x: 250, y: 660 },
    ]),
  },
  {
    id: "subclavian-r",
    width: 4,
    points: spline([
      { x: 530, y: 330 },
      { x: 590, y: 318 },
      { x: 672, y: 332 },
      { x: 714, y: 400 },
      { x: 738, y: 560 },
      { x: 750, y: 660 },
    ]),
  },
  {
    id: "pulmonary-l",
    width: 3,
    points: spline([
      { x: H.x - 30, y: H.y - 20 },
      { x: 392, y: 400 },
      { x: 372, y: 470 },
      { x: 392, y: 540 },
      { x: H.x - 14, y: H.y + 40 },
    ]),
  },
  {
    id: "pulmonary-r",
    width: 3,
    points: spline([
      { x: H.x + 40, y: H.y - 10 },
      { x: 590, y: 410 },
      { x: 628, y: 480 },
      { x: 590, y: 540 },
      { x: 520, y: 520 },
      { x: H.x + 34, y: H.y + 30 },
    ]),
  },
  {
    id: "feeder",
    width: 5,
    cluster: true,
    points: spline([
      { x: 516, y: 600 },
      { x: 548, y: 628 },
      { x: 578, y: 662 },
      { x: T.x - 12, y: T.y - 8 },
    ]),
  },
  {
    id: "feeder-2",
    width: 3,
    cluster: true,
    points: spline([
      { x: 512, y: 740 },
      { x: 548, y: 748 },
      { x: T.x - 30, y: T.y + 34 },
    ]),
  },
];

export interface Rib {
  side: -1 | 1;
  a: Pt;
  c1: Pt;
  c2: Pt;
  b: Pt;
}

export const RIBS: Rib[] = (() => {
  const ribs: Rib[] = [];
  for (let k = 0; k < 9; k++) {
    const y = 336 + k * 38;
    const reach = 150 + Math.sin((k / 8) * Math.PI) * 26 - k * 3;
    for (const side of [-1, 1] as const) {
      ribs.push({
        side,
        a: { x: 500 + side * 14, y },
        c1: { x: 500 + side * (reach * 0.55), y: y - 34 },
        c2: { x: 500 + side * (reach + 18), y: y - 4 },
        b: { x: 500 + side * (reach - 6), y: y + 58 + k * 2 },
      });
    }
  }
  return ribs;
})();

/** Outer silhouette: head, neck, shoulders, upper arms and torso. */
export const SILHOUETTE: { type: "path"; d: string }[] = [
  {
    type: "path",
    d: [
      "M 466 214 C 470 240 468 258 456 270",
      "C 420 288 330 296 290 322",
      "C 252 346 236 392 230 460",
      "C 224 540 222 610 218 690",
      "M 290 470 C 300 560 316 640 344 720",
      "C 356 760 352 820 338 880",
      "C 330 910 326 930 324 960",
      "M 534 214 C 530 240 532 258 544 270",
      "C 580 288 670 296 710 322",
      "C 748 346 764 392 770 460",
      "C 776 540 778 610 782 690",
      "M 710 470 C 700 560 684 640 656 720",
      "C 644 760 648 820 662 880",
      "C 670 910 674 930 676 960",
    ].join(" "),
  },
];

/** Vertebra centers down the spine. */
export const VERTEBRAE: Pt[] = Array.from({ length: 26 }, (_, i) => ({ x: 500, y: 238 + i * 26 }));
