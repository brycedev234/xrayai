"use client";

import { useMemo, useRef } from "react";
import { createRng } from "@/lib/demo/random";
import type { RelationshipKind } from "@/data/mockScan";
import { PALETTE } from "../xray/renderer";
import { LiveCanvas } from "./LiveCanvas";

/** When each relationship kind starts and finishes being discovered, on the 0-1 progress scale. */
export const DISCOVERY: Record<RelationshipKind, [number, number]> = {
  funder: [0.2, 0.4],
  timing: [0.36, 0.52],
  transfer: [0.48, 0.62],
  deployer: [0.58, 0.7],
  behavior: [0.66, 0.76],
};
export const BOUNDARY: [number, number] = [0.7, 0.95];

interface NetNode {
  bx: number;
  by: number;
  tx: number;
  ty: number;
  phase: number;
  r: number;
  cluster: boolean;
  label: string;
}

interface NetEdge {
  a: number;
  b: number;
  kind: RelationshipKind;
  at: number;
}

const FUNDER = -1;
const DEPLOYER = -2;

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

function buildNetwork(total: number, clusterSize: number, counts: Record<RelationshipKind, number>) {
  const rng = createRng(0x51ab);
  const nodes: NetNode[] = [];
  const GOLD = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < total; i++) {
    const cluster = i < clusterSize;
    const d = cluster ? 0.035 + Math.sqrt(i) * 0.042 : 0;
    nodes.push({
      bx: rng.range(0.06, 0.94),
      by: rng.range(0.08, 0.92),
      tx: 0.54 + Math.cos(i * GOLD) * d * 1.15,
      ty: 0.52 + Math.sin(i * GOLD) * d,
      phase: rng.range(0, Math.PI * 2),
      r: cluster ? rng.range(3.6, 6.4) : rng.range(1.6, 3.4),
      cluster,
      label: `W-${String(i + 1).padStart(2, "0")}`,
    });
  }
  const edges: NetEdge[] = [];
  const at = (kind: RelationshipKind, i: number, n: number) => {
    const [s, e] = DISCOVERY[kind];
    return s + ((e - s) * i) / Math.max(1, n - 1);
  };
  for (let i = 0; i < counts.funder; i++) edges.push({ a: FUNDER, b: i, kind: "funder", at: at("funder", i, counts.funder) });
  const timed = Array.from({ length: counts.timing }, (_, i) => (i * 3) % clusterSize);
  for (let i = 1; i < timed.length; i++) edges.push({ a: timed[i - 1], b: timed[i], kind: "timing", at: at("timing", i, timed.length) });
  for (let i = 0; i < counts.transfer; i++) {
    const a = (i * 4 + 1) % clusterSize;
    const b = (a + 2 + (i % 3)) % clusterSize;
    edges.push({ a, b, kind: "transfer", at: at("transfer", i, counts.transfer) });
  }
  for (let i = 0; i < counts.deployer; i++) edges.push({ a: DEPLOYER, b: (i * 5 + 2) % clusterSize, kind: "deployer", at: at("deployer", i, counts.deployer) });
  for (let i = 0; i < counts.behavior; i++) {
    const a = (i * 2 + 3) % clusterSize;
    edges.push({ a, b: (a + 5) % clusterSize, kind: "behavior", at: at("behavior", i, counts.behavior) });
  }
  return { nodes, edges };
}

interface Props {
  progress: React.MutableRefObject<number>;
  clusterSize: number;
  counts: Record<RelationshipKind, number>;
  compact: boolean;
  reducedMotion: boolean;
}

export function WalletNetwork({ progress, clusterSize, counts, compact, reducedMotion }: Props) {
  const net = useMemo(() => buildNetwork(compact ? 38 : 78, clusterSize, counts), [compact, clusterSize, counts]);
  const hover = useRef<{ x: number; y: number } | null>(null);

  return (
    <LiveCanvas
      label="Wallet network forming a connected cluster"
      onPointerMove={(x, y) => (hover.current = { x, y })}
      onPointerLeave={() => (hover.current = null)}
      draw={(ctx, t, w, h) => {
        const p = progress.current;
        const tt = reducedMotion ? 0 : t;
        const gather = smooth((p - 0.12) / 0.5);
        const pos = (i: number): [number, number] => {
          if (i === FUNDER) return [w * 0.88, h * 0.16];
          if (i === DEPLOYER) return [w * 0.12, h * 0.14];
          const n = net.nodes[i];
          const wob = n.cluster ? 1 - gather * 0.7 : 1;
          const fx = n.bx + Math.sin(tt * 0.22 + n.phase) * 0.012 * wob;
          const fy = n.by + Math.cos(tt * 0.19 + n.phase * 1.7) * 0.014 * wob;
          if (!n.cluster) return [fx * w, fy * h];
          return [(fx + (n.tx - fx) * gather) * w, (fy + (n.ty - fy) * gather) * h];
        };

        // Hover target
        let hovered = -99;
        if (hover.current) {
          let best = 18;
          net.nodes.forEach((_, i) => {
            const [x, y] = pos(i);
            const d = Math.hypot(x - hover.current!.x, y - hover.current!.y);
            if (d < best) {
              best = d;
              hovered = i;
            }
          });
        }

        // Faint proximity mesh among ordinary wallets
        ctx.lineWidth = 1;
        for (let i = clusterSize; i < net.nodes.length; i++) {
          const [x1, y1] = pos(i);
          for (let j = i + 1; j < net.nodes.length; j++) {
            const [x2, y2] = pos(j);
            const d = Math.hypot(x1 - x2, y1 - y2);
            if (d < 70) {
              ctx.strokeStyle = `rgba(${PALETTE.phosphor},${0.06 * (1 - d / 70)})`;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
            }
          }
        }

        const cx = 0.54 * w;
        const cy = 0.52 * h;

        // Radar sweep around the forming group
        if (p > 0.15 && !reducedMotion) {
          const a = t * 0.9;
          const R = Math.min(w, h) * 0.42;
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
          grad.addColorStop(0, `rgba(${PALETTE.infra},${0.08 * Math.min(1, (p - 0.15) * 4)})`);
          grad.addColorStop(1, `rgba(${PALETTE.infra},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, R, a, a + 0.5);
          ctx.closePath();
          ctx.fill();
        }

        // Organic boundary (the mass)
        const bIn = smooth((p - BOUNDARY[0]) / (BOUNDARY[1] - BOUNDARY[0]));
        if (bIn > 0) {
          const pts = Array.from({ length: clusterSize }, (_, i) => pos(i));
          const steps = 120;
          const radius: number[] = [];
          for (let k = 0; k < steps; k++) {
            const th = (k / steps) * Math.PI * 2;
            let r = 0;
            for (const [x, y] of pts) {
              const proj = (x - cx) * Math.cos(th) + (y - cy) * Math.sin(th);
              const perp = Math.abs(-(x - cx) * Math.sin(th) + (y - cy) * Math.cos(th));
              if (perp < 52) r = Math.max(r, proj + Math.sqrt(52 * 52 - perp * perp) * 0.75);
            }
            radius.push(Math.max(r, 26) + 10);
          }
          // Smooth the outline
          const sm = radius.map((_, k) => {
            let s = 0;
            for (let d = -10; d <= 10; d++) s += radius[(k + d + steps) % steps];
            return s / 21;
          });
          for (const [scale, alpha, fill] of [
            [1.28, 0.12, false],
            [1, 0.7, true],
          ] as const) {
            ctx.beginPath();
            for (let k = 0; k <= steps; k++) {
              const th = (k / steps) * Math.PI * 2;
              const wobble = 1 + 0.04 * Math.sin(th * 5 + tt * 0.8) + 0.025 * Math.sin(th * 9 - tt * 1.1);
              const r = sm[k % steps] * scale * wobble * (0.6 + 0.4 * bIn);
              const x = cx + Math.cos(th) * r;
              const y = cy + Math.sin(th) * r;
              if (k === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.closePath();
            if (fill) {
              const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(...sm) * 1.1);
              g.addColorStop(0, `rgba(${PALETTE.infra},${0.16 * bIn})`);
              g.addColorStop(1, `rgba(${PALETTE.infra},${0.03 * bIn})`);
              ctx.fillStyle = g;
              ctx.fill();
              ctx.shadowColor = `rgba(${PALETTE.infra},0.9)`;
              ctx.shadowBlur = 16 + 8 * Math.sin(tt * 1.4);
            }
            ctx.strokeStyle = `rgba(${PALETTE.infra},${alpha * bIn})`;
            ctx.lineWidth = fill ? 1.3 : 1;
            ctx.setLineDash(fill ? [] : [3, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;
          }
        }

        // Relationship edges
        const linked = new Set<number>();
        for (const e of net.edges) {
          const local = smooth((p - e.at) / 0.06);
          if (local <= 0) continue;
          linked.add(e.b);
          if (e.a >= 0) linked.add(e.a);
          const [x1, y1] = pos(e.a);
          const [x2, y2] = pos(e.b);
          const active = hovered >= 0 && (e.a === hovered || e.b === hovered);
          const dimmed = hovered >= 0 && net.nodes[hovered]?.cluster && !active;
          const ex = x1 + (x2 - x1) * local;
          const ey = y1 + (y2 - y1) * local;
          const base = e.kind === "behavior" ? 0.3 : e.kind === "funder" ? 0.45 : 0.7;
          ctx.strokeStyle = `rgba(${PALETTE.infra},${(dimmed ? 0.08 : active ? 1 : base) * local})`;
          ctx.lineWidth = active ? 2 : e.kind === "transfer" ? 1.5 : 1;
          ctx.setLineDash(e.kind === "timing" ? [2, 5] : e.kind === "deployer" ? [7, 5] : []);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.setLineDash([]);
          // Leading spark while the edge is drawing
          if (local < 1) {
            ctx.fillStyle = `rgba(255,220,230,${0.9 * (1 - local)})`;
            ctx.beginPath();
            ctx.arc(ex, ey, 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // External funder and deployer
        for (const [id, name, kind] of [
          [FUNDER, "COMMON FUNDER", "funder"],
          [DEPLOYER, "DEPLOYER", "deployer"],
        ] as const) {
          const a = smooth((p - DISCOVERY[kind][0] + 0.04) / 0.08);
          if (a <= 0) continue;
          const [x, y] = pos(id);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.PI / 4);
          ctx.strokeStyle = `rgba(${PALETTE.infra},${a})`;
          ctx.fillStyle = `rgba(3,5,10,${a})`;
          ctx.lineWidth = 1.4;
          ctx.fillRect(-8, -8, 16, 16);
          ctx.strokeRect(-8, -8, 16, 16);
          ctx.restore();
          ctx.font = "10px 'JetBrains Mono', monospace";
          ctx.fillStyle = `rgba(${PALETTE.infra},${0.85 * a})`;
          ctx.textAlign = id === FUNDER ? "right" : "left";
          ctx.fillText(name, x + (id === FUNDER ? -16 : 16), y + 4);
          ctx.textAlign = "left";
        }

        // Wallet nodes
        net.nodes.forEach((n, i) => {
          const [x, y] = pos(i);
          const red = n.cluster && linked.has(i);
          const rgb = red ? PALETTE.infra : PALETTE.phosphor;
          const isHover = hovered === i;
          const r = n.r * (isHover ? 1.4 : 1);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
          g.addColorStop(0, `rgba(${rgb},${red ? 0.35 : 0.16})`);
          g.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(${rgb},${red ? 0.95 : 0.7})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          if (isHover) {
            ctx.strokeStyle = `rgba(${rgb},0.9)`;
            ctx.beginPath();
            ctx.arc(x, y, r + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.font = "11px 'JetBrains Mono', monospace";
            ctx.fillStyle = `rgba(${PALETTE.bone},0.9)`;
            const links = net.edges.filter((e) => (e.a === i || e.b === i) && p >= e.at).length;
            ctx.fillText(`${n.label} · ${red ? `${links} links` : "no links"}`, x + 12, y - 10);
          }
        });
      }}
    />
  );
}
