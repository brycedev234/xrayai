import type { Specimen } from "@/lib/demo/specimenTypes";
import { ORGANS, RIBS, SILHOUETTE, VERTEBRAE, VESSELS, type Pt } from "./anatomy";
import type { SpecimenLayout } from "./layout";

export const PALETTE = {
  bone: "216,230,242",
  phosphor: "127,227,255",
  infra: "255,47,109",
  amber: "255,181,71",
};

export type FocusKey = "liquidity" | "concentration" | "creator" | "cluster" | "flow" | null;

export interface RenderState {
  scan: Specimen;
  layout: SpecimenLayout;
  focus: FocusKey;
  hoveredCell: string | null;
  reducedMotion: boolean;
  /** Reveal clock in seconds. Defaults to the animation clock; set separately to hold or replay the assembly. */
  revealT?: number;
  /** Periodic faint scan sweep once revealed. Defaults to true. */
  idleSweep?: boolean;
}

/** Reveal timeline, in seconds from mount. */
export const TIMELINE = {
  beam: [0, 1.6],
  bones: [0.1, 1.6],
  brain: [1.0, 1.9],
  heart: [1.3, 2.2],
  vessels: [1.6, 2.6],
  cells: [1.9, 3.0],
  tumor: [2.5, 4.4],
} as const;

const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const phaseOf = (t: number, [a, b]: readonly [number, number]) => easeOut((t - a) / (b - a));

let cachedPaths: { silhouette: Path2D[]; head: Path2D } | null = null;
export function anatomyPaths() {
  if (!cachedPaths) {
    const head = new Path2D();
    head.ellipse(500, 132, 74, 90, 0, 0, Math.PI * 2);
    cachedPaths = { silhouette: SILHOUETTE.map((s) => new Path2D(s.d)), head };
  }
  return cachedPaths;
}

interface Particle {
  vessel: number;
  offset: number;
  speed: number;
  kind: "buy" | "sell" | "cluster";
  size: number;
}

export function createParticles(scan: Specimen): Particle[] {
  let sellShare: number;
  let density: number;
  if (scan.flow) {
    // Live scan: particle mix follows observed 24h buy/sell counts. Unknown flow stays sparse and neutral.
    const { buys, sells } = scan.flow;
    const total = (buys ?? 0) + (sells ?? 0);
    sellShare = buys !== null && sells !== null && total > 0 ? sells / total : 0;
    density = buys === null && sells === null ? 0.3 : Math.min(1.6, 0.45 + total / 4000);
  } else {
    const trades = scan.raw.trades;
    sellShare = trades.filter((t) => t.side === "sell").length / Math.max(1, trades.length);
    density = Math.min(1.6, 0.6 + trades.length / 400);
  }
  const out: Particle[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  VESSELS.forEach((v, vi) => {
    const count = Math.round((v.points.length / 9) * density * (v.cluster ? 1.4 : 1));
    for (let i = 0; i < count; i++) {
      out.push({
        vessel: vi,
        offset: rand(),
        speed: (v.cluster ? 0.09 : 0.06) + rand() * 0.06,
        kind: v.cluster ? "cluster" : rand() < sellShare ? "sell" : "buy",
        size: 1.2 + rand() * 1.8,
      });
    }
  });
  return out;
}

function heartPath(cx: number, cy: number, s: number): Path2D {
  // Anatomical-ish heart: asymmetric lobed mass tilted to the left.
  const p = new Path2D();
  p.moveTo(cx + 8 * s, cy - 40 * s);
  p.bezierCurveTo(cx + 44 * s, cy - 50 * s, cx + 58 * s, cy - 6 * s, cx + 40 * s, cy + 22 * s);
  p.bezierCurveTo(cx + 26 * s, cy + 44 * s, cx - 4 * s, cy + 60 * s, cx - 22 * s, cy + 56 * s);
  p.bezierCurveTo(cx - 46 * s, cy + 48 * s, cx - 56 * s, cy + 10 * s, cx - 44 * s, cy - 16 * s);
  p.bezierCurveTo(cx - 34 * s, cy - 40 * s, cx - 14 * s, cy - 36 * s, cx + 8 * s, cy - 40 * s);
  return p;
}

function tumorRadius(theta: number, t: number, R: number): number {
  return (
    R *
    (1 +
      0.13 * Math.sin(3 * theta + t * 0.7) +
      0.08 * Math.sin(5 * theta - t * 1.1 + 1.3) +
      0.05 * Math.sin(9 * theta + t * 0.5) +
      0.03 * Math.sin(14 * theta - t * 1.7))
  );
}

function severityRgb(sev: string): string {
  return sev === "elevated" ? PALETTE.infra : sev === "watch" ? PALETTE.amber : PALETTE.phosphor;
}

export function drawSpecimen(
  ctx: CanvasRenderingContext2D,
  t: number,
  state: RenderState,
  particles: Particle[],
) {
  const { scan, layout, focus } = state;
  const dim = (key: FocusKey) => (focus && focus !== key ? 0.35 : 1);
  const rt = state.revealT ?? t;
  ctx.clearRect(0, 0, 1000, 1000);

  // Body haze
  const haze = ctx.createRadialGradient(500, 560, 40, 500, 560, 520);
  haze.addColorStop(0, `rgba(${PALETTE.phosphor},0.07)`);
  haze.addColorStop(0.6, `rgba(${PALETTE.phosphor},0.025)`);
  haze.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, 1000, 1000);

  const beamDone = rt > TIMELINE.beam[1];
  const beamY = -40 + phaseOf(rt, TIMELINE.beam) * 1080;
  ctx.save();
  if (!beamDone) {
    ctx.beginPath();
    ctx.rect(0, 0, 1000, beamY);
    ctx.clip();
  }

  /* ---- Skeleton & silhouette ---- */
  const bones = phaseOf(rt, TIMELINE.bones);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = `rgba(${PALETTE.phosphor},0.45)`;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = `rgba(${PALETTE.bone},${0.42 * bones})`;
  ctx.lineWidth = 2;
  const paths = anatomyPaths();
  for (const p of paths.silhouette) ctx.stroke(p);
  ctx.stroke(paths.head);
  ctx.shadowBlur = 0;

  // Skull
  ctx.strokeStyle = `rgba(${PALETTE.bone},${0.16 * bones})`;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.ellipse(500, 124, 62, 74, 0, Math.PI * 0.92, Math.PI * 2.08);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(458, 196);
  ctx.quadraticCurveTo(500, 222, 542, 196);
  ctx.stroke();

  // Spine
  for (const v of VERTEBRAE) {
    const a = (v.y > 880 ? 0.06 : 0.14) * bones;
    ctx.fillStyle = `rgba(${PALETTE.bone},${a})`;
    ctx.strokeStyle = `rgba(${PALETTE.bone},${a * 1.8})`;
    ctx.lineWidth = 1;
    const w = v.y > 600 ? 34 : 28;
    ctx.beginPath();
    ctx.roundRect(v.x - w / 2, v.y - 9, w, 18, 6);
    ctx.fill();
    ctx.stroke();
  }

  // Clavicles
  ctx.strokeStyle = `rgba(${PALETTE.bone},${0.26 * bones})`;
  ctx.lineWidth = 7;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(500 + side * 20, 292);
    ctx.bezierCurveTo(500 + side * 80, 282, 500 + side * 130, 306, 500 + side * 186, 298);
    ctx.stroke();
  }

  // Ribs (outer bone + bright cortex line)
  for (const r of RIBS) {
    const path = new Path2D();
    path.moveTo(r.a.x, r.a.y);
    path.bezierCurveTo(r.c1.x, r.c1.y, r.c2.x, r.c2.y, r.b.x, r.b.y);
    ctx.strokeStyle = `rgba(${PALETTE.bone},${0.08 * bones})`;
    ctx.lineWidth = 11;
    ctx.stroke(path);
    ctx.strokeStyle = `rgba(${PALETTE.bone},${0.24 * bones})`;
    ctx.lineWidth = 1.6;
    ctx.stroke(path);
  }

  // Pelvis
  ctx.strokeStyle = `rgba(${PALETTE.bone},${0.18 * bones})`;
  ctx.lineWidth = 8;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(500 + side * 22, 880);
    ctx.bezierCurveTo(500 + side * 60, 820, 500 + side * 150, 812, 500 + side * 158, 870);
    ctx.stroke();
  }

  /* ---- Brain (creator) ---- */
  const brainIn = phaseOf(rt, TIMELINE.brain) * dim("creator");
  if (brainIn > 0) {
    const B = ORGANS.brain;
    const creatorSev = scan.diagnostics.find((d) => d.key === "creator")?.severity ?? "stable";
    const sevRgb = severityRgb(creatorSev);
    ctx.strokeStyle = `rgba(${PALETTE.phosphor},${0.12 * brainIn})`;
    ctx.lineWidth = 1;
    for (const [i, j] of layout.brainLinks) {
      const a = layout.brain[i];
      const b = layout.brain[j];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Hemispheres
    ctx.strokeStyle = `rgba(${PALETTE.phosphor},${0.3 * brainIn})`;
    ctx.lineWidth = 1.4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(B.x + side * 30, B.y - 14, 30, 46, side * 0.12, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const n of layout.brain) {
      const flicker = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 + n.phase * 3));
      const dep = n.deployment !== undefined ? scan.raw.creator.priorDeployments[n.deployment] : undefined;
      const rgb = dep ? (dep.liquidityRetained < 0.1 ? sevRgb : PALETTE.phosphor) : PALETTE.phosphor;
      const r = dep ? 3.4 : 1.6;
      ctx.fillStyle = `rgba(${rgb},${(dep ? 0.9 : 0.55) * flicker * brainIn})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (dep) {
        ctx.strokeStyle = `rgba(${rgb},${0.35 * brainIn})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 4 + flicker * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /* ---- Bloodstream (transaction flow) ---- */
  const vesselIn = phaseOf(rt, TIMELINE.vessels);
  if (vesselIn > 0) {
    const flowDim = dim("flow");
    for (const v of VESSELS) {
      const rgb = v.cluster ? PALETTE.infra : PALETTE.phosphor;
      const vd = v.cluster ? dim("cluster") : flowDim;
      const len = Math.floor(v.points.length * vesselIn);
      if (len < 2) continue;
      ctx.beginPath();
      ctx.moveTo(v.points[0].x, v.points[0].y);
      for (let i = 1; i < len; i++) ctx.lineTo(v.points[i].x, v.points[i].y);
      ctx.strokeStyle = `rgba(${rgb},${0.09 * vd})`;
      ctx.lineWidth = v.width * 2.2;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${rgb},${0.32 * vd})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "lighter";
    const speedScale = state.reducedMotion ? 0.15 : 1;
    for (const p of particles) {
      const v = VESSELS[p.vessel];
      const pos = (p.offset + t * p.speed * speedScale) % 1;
      if (pos > vesselIn) continue;
      const pt = v.points[Math.floor(pos * (v.points.length - 1))];
      const rgb = p.kind === "cluster" ? PALETTE.infra : p.kind === "sell" ? PALETTE.amber : PALETTE.phosphor;
      const vd = p.kind === "cluster" ? dim("cluster") : dim("flow");
      const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, p.size * 4);
      g.addColorStop(0, `rgba(${rgb},${0.95 * vd})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, p.size * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---- Heart (liquidity) ---- */
  const heartIn = phaseOf(rt, TIMELINE.heart) * dim("liquidity");
  if (heartIn > 0) {
    const H = ORGANS.heart;
    const liq = scan.diagnostics.find((d) => d.key === "liquidity");
    const rgb = severityRgb(liq?.severity ?? "stable");
    const health = 1 - (liq?.intensity ?? 50) / 100;
    const bpm = 52 + (1 - health) * 60;
    const beatT = (t * bpm) / 60;
    const frac = beatT % 1;
    const beat = state.reducedMotion ? 0.3 : Math.exp(-frac * 9) + 0.55 * Math.exp(-Math.abs(frac - 0.22) * 22);
    const s = (0.92 + beat * 0.08) * heartIn;
    const path = heartPath(H.x, H.y, s);
    const g = ctx.createRadialGradient(H.x - 6, H.y + 4, 4, H.x, H.y, 70 * s);
    g.addColorStop(0, `rgba(${rgb},${0.55 * heartIn})`);
    g.addColorStop(0.55, `rgba(${rgb},${0.16 * heartIn})`);
    g.addColorStop(1, `rgba(${rgb},0.02)`);
    ctx.fillStyle = g;
    ctx.shadowColor = `rgba(${rgb},0.8)`;
    ctx.shadowBlur = 24 + beat * 26;
    ctx.fill(path);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(${rgb},${0.75 * heartIn})`;
    ctx.lineWidth = 1.4;
    ctx.stroke(path);
    // Chambers
    ctx.strokeStyle = `rgba(${rgb},${0.3 * heartIn})`;
    ctx.beginPath();
    ctx.moveTo(H.x + 4 * s, H.y - 30 * s);
    ctx.quadraticCurveTo(H.x - 8 * s, H.y + 6 * s, H.x - 18 * s, H.y + 46 * s);
    ctx.stroke();
    // Beat rings
    if (!state.reducedMotion) {
      const ring = frac;
      ctx.strokeStyle = `rgba(${rgb},${0.35 * (1 - ring) * heartIn})`;
      ctx.beginPath();
      ctx.ellipse(H.x, H.y + 6, 50 + ring * 46, 50 + ring * 40, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /* ---- Cells (holders) ---- */
  const cellsIn = phaseOf(rt, TIMELINE.cells) * dim("concentration");
  if (cellsIn > 0) {
    const n = layout.cells.length;
    layout.cells.forEach((c, i) => {
      const local = Math.min(1, Math.max(0, cellsIn * 1.6 - (i / n) * 0.6));
      if (local <= 0) return;
      const drift = state.reducedMotion ? 0 : 1;
      const x = c.x + Math.sin(t * 0.5 + c.phase) * 3.5 * drift;
      const y = c.y + Math.cos(t * 0.42 + c.phase * 1.3) * 3 * drift;
      const hovered = state.hoveredCell === c.address;
      const r = c.r * (0.4 + 0.6 * local) * (hovered ? 1.25 : 1);
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      g.addColorStop(0, `rgba(${PALETTE.phosphor},${0.02 * local})`);
      g.addColorStop(1, `rgba(${PALETTE.phosphor},${(hovered ? 0.3 : 0.12) * local})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${PALETTE.phosphor},${(hovered ? 1 : 0.5) * local})`;
      ctx.lineWidth = hovered ? 1.6 : 0.9;
      ctx.stroke();
      ctx.fillStyle = `rgba(${PALETTE.bone},${0.7 * local})`;
      ctx.beginPath();
      ctx.arc(x + r * 0.18, y - r * 0.12, Math.max(1, r * 0.22), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /* ---- Tumor (wallet cluster) ---- */
  const tumorIn = phaseOf(rt, TIMELINE.tumor);
  if (tumorIn > 0 && scan.primaryCluster) {
    const T = ORGANS.tumor;
    const td = dim("cluster");
    const pulse = state.reducedMotion ? 0 : Math.sin(t * 1.6) * 0.5 + 0.5;
    const R = T.r * (0.25 + 0.75 * tumorIn) * (0.97 + pulse * 0.05);
    const intensity = 0.6 + scan.primaryCluster.confidence * 0.4;

    // Inflamed halo
    const halo = ctx.createRadialGradient(T.x, T.y, R * 0.3, T.x, T.y, R * 1.9);
    halo.addColorStop(0, `rgba(${PALETTE.infra},${0.22 * tumorIn * td * intensity})`);
    halo.addColorStop(1, `rgba(${PALETTE.infra},0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(T.x, T.y, R * 1.9, 0, Math.PI * 2);
    ctx.fill();

    // Lobed mass
    ctx.globalCompositeOperation = "lighter";
    for (let k = 0; k < 9; k++) {
      const a = k * 0.7 + t * 0.15;
      const d = R * (0.25 + 0.3 * Math.sin(k * 1.9 + t * 0.4) ** 2);
      const lx = T.x + Math.cos(a) * d;
      const ly = T.y + Math.sin(a) * d;
      const lr = R * (0.45 + 0.1 * Math.sin(t + k));
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      g.addColorStop(0, `rgba(${PALETTE.infra},${0.11 * tumorIn * td})`);
      g.addColorStop(1, `rgba(${PALETTE.infra},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    // Irregular membranes
    for (const [scale, alpha, width] of [
      [1, 0.75, 1.4],
      [1.22, 0.25, 1],
      [1.5, 0.1, 1],
    ] as const) {
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) {
        const th = (i / 96) * Math.PI * 2;
        const rr = tumorRadius(th, t * (scale === 1 ? 1 : 0.6) + scale, R * scale);
        const x = T.x + Math.cos(th) * rr;
        const y = T.y + Math.sin(th) * rr * 0.92;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(${PALETTE.infra},${alpha * tumorIn * td})`;
      ctx.lineWidth = width;
      if (scale === 1) {
        ctx.shadowColor = `rgba(${PALETTE.infra},0.9)`;
        ctx.shadowBlur = 18 + pulse * 12;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Hatching inside the mass (radiograph density)
    ctx.save();
    ctx.beginPath();
    ctx.arc(T.x, T.y, R * 0.95, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = `rgba(${PALETTE.infra},${0.08 * tumorIn * td})`;
    ctx.lineWidth = 1;
    for (let k = -12; k <= 12; k++) {
      ctx.beginPath();
      ctx.moveTo(T.x + k * 9 - 120, T.y - 120);
      ctx.lineTo(T.x + k * 9 + 120, T.y + 120);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();

  // Fade the film out toward the bottom edge.
  ctx.globalCompositeOperation = "destination-out";
  const fade = ctx.createLinearGradient(0, 860, 0, 1000);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 860, 1000, 140);
  ctx.globalCompositeOperation = "source-over";

  /* ---- Scanner beam ---- */
  if (!beamDone) drawBeam(ctx, beamY, 1);
  else if (!state.reducedMotion && state.idleSweep !== false) {
    const cycle = 9;
    const local = ((t - TIMELINE.beam[1]) % cycle) / 2.6;
    if (local < 1) drawBeam(ctx, -20 + local * 1040, 0.22);
  }
}

export function drawBeam(ctx: CanvasRenderingContext2D, y: number, strength: number) {
  const g = ctx.createLinearGradient(0, y - 90, 0, y + 6);
  g.addColorStop(0, `rgba(${PALETTE.phosphor},0)`);
  g.addColorStop(0.85, `rgba(${PALETTE.phosphor},${0.12 * strength})`);
  g.addColorStop(1, `rgba(${PALETTE.phosphor},${0.5 * strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, y - 90, 1000, 96);
  ctx.fillStyle = `rgba(230,250,255,${0.9 * strength})`;
  ctx.shadowColor = `rgba(${PALETTE.phosphor},1)`;
  ctx.shadowBlur = 20 * strength;
  ctx.fillRect(0, y, 1000, 1.5);
  ctx.shadowBlur = 0;
}

export function hitCell(layout: SpecimenLayout, p: Pt, t: number): string | null {
  for (const c of layout.cells) {
    const x = c.x + Math.sin(t * 0.5 + c.phase) * 3.5;
    const y = c.y + Math.cos(t * 0.42 + c.phase * 1.3) * 3;
    if (Math.hypot(p.x - x, p.y - y) <= Math.max(c.r, 7) + 3) return c.address;
  }
  return null;
}

/** Raw-data phase: faint outline, repeated beams, and data points lighting up as each beam passes them. */
export function drawIngest(ctx: CanvasRenderingContext2D, t: number, layout: SpecimenLayout, reducedMotion: boolean) {
  const period = 2.4;
  const beamY = ((t % period) / period) * 1100 - 50;
  const passes = Math.floor(t / period);
  const paths = anatomyPaths();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = `rgba(${PALETTE.bone},${0.1 + Math.min(0.12, passes * 0.03)})`;
  for (const p of paths.silhouette) ctx.stroke(p);
  ctx.stroke(paths.head);

  const points: { x: number; y: number; tag?: string }[] = [
    ...layout.cells.map((c, i) => ({ x: c.x, y: c.y, tag: i % 9 === 0 ? c.address.slice(0, 4) + "…" : undefined })),
    ...layout.clusterNodes.map((n, i) => ({ x: n.x, y: n.y, tag: i % 4 === 0 ? `${(n.pct * 100).toFixed(2)}%` : undefined })),
    ...layout.brain.filter((_, i) => i % 2 === 0).map((b) => ({ x: b.x, y: b.y })),
    ...VESSELS.flatMap((v) => v.points.filter((_, i) => i % 9 === 0)),
  ];
  ctx.font = "15px 'JetBrains Mono', monospace";
  for (const p of points) {
    const firstPass = ((p.y + 50) / 1100) * period;
    if (t < firstPass) continue;
    const since = (t - firstPass) % period;
    const flash = reducedMotion ? 0 : Math.exp(-since * 5);
    const a = 0.35 + 0.65 * flash;
    ctx.fillStyle = `rgba(${PALETTE.phosphor},${a})`;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    if (p.tag) {
      ctx.fillStyle = `rgba(${PALETTE.bone},${0.25 + 0.5 * flash})`;
      ctx.fillText(p.tag, p.x + 8, p.y + 5);
    }
  }
  if (!reducedMotion) drawBeam(ctx, beamY, 0.85);
}
