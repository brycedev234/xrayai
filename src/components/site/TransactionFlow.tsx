"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEMO_SCAN } from "@/data/mockScan";
import { createRng } from "@/lib/demo/random";
import { useInViewport, useReducedMotion } from "@/hooks/useInViewport";
import { PALETTE } from "../xray/renderer";
import { LiveCanvas } from "./LiveCanvas";
import { EASE, SectionHead } from "./SectionHead";

type P = { x: number; y: number };

const SOURCES = 9;
const DESTS = 6;
const RELATED = [1, 2, 3]; // destination indexes that belong to the connected group
const NEW_WALLETS = [1, 6];
const EVENT_SOURCE = 4;
const EVENT_PERIOD = 9;
const EVENT_TRACE = 3.2;

interface Particle {
  src: number;
  dst: number;
  offset: number;
  speed: number;
  size: number;
  hot: boolean;
}

function bezier(a: P, b: P, t: number, vertical: boolean): P {
  const mt = 1 - t;
  const c1 = vertical ? { x: a.x, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: a.y };
  const c2 = vertical ? { x: b.x, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: b.y };
  return {
    x: mt ** 3 * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t ** 3 * b.x,
    y: mt ** 3 * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t ** 3 * b.y,
  };
}

function strokeCurve(ctx: CanvasRenderingContext2D, a: P, b: P, vertical: boolean, upTo = 1) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  const steps = 32;
  for (let i = 1; i <= Math.ceil(steps * upTo); i++) {
    const p = bezier(a, b, Math.min(upTo, i / steps), vertical);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

export function TransactionFlow() {
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const visible = useInViewport(wrapRef, "0px");
  const eventStart = useRef<number | null>(null);
  const [eventOn, setEventOn] = useState(false);
  const ev = DEMO_SCAN.flow.largeMovement;

  const particles = useMemo<Particle[]>(() => {
    const rng = createRng(0xf10e);
    return Array.from({ length: 64 }, () => {
      const dst = rng.int(0, DESTS - 1);
      const size = Math.pow(rng.next(), 2.4);
      return {
        src: rng.int(0, SOURCES - 1),
        dst,
        offset: rng.next(),
        speed: 0.05 + rng.next() * 0.05,
        size,
        hot: RELATED.includes(dst) && size > 0.45,
      };
    });
  }, []);

  // Large-movement event loop, only while the section is on screen.
  useEffect(() => {
    if (!visible || reduced) return;
    let hide: ReturnType<typeof setTimeout>;
    const fire = () => {
      eventStart.current = performance.now();
      setEventOn(true);
      hide = setTimeout(() => setEventOn(false), (EVENT_TRACE + 2.6) * 1000);
    };
    const first = setTimeout(fire, 1800);
    const loop = setInterval(fire, EVENT_PERIOD * 1000);
    return () => {
      clearTimeout(first);
      clearTimeout(hide);
      clearInterval(loop);
    };
  }, [visible, reduced]);

  return (
    <section id="flow" className="relative px-4 pt-28 sm:px-8 sm:pt-40">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHead
            eyebrow="FLOW ANALYSIS / 04"
            lines={["WATCH CAPITAL", "MOVE."]}
            copy={
              <>
                Transactions aren&rsquo;t rows in a table anymore. X-RAY reconstructs capital movement through the organism.
              </>
            }
          />
          <div className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[10px] tracking-[0.18em] text-mute">
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-phosphor" /> ROUTINE MOVEMENT
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-infra" /> UNUSUAL SIZE / RELATED
            </span>
            <span>SIZE = TRANSACTION VALUE</span>
          </div>
        </div>
      </div>

      <div ref={wrapRef} className="relative mx-auto mt-14 max-w-[1600px] border-y border-white/[0.06]">
        <div className="aspect-[3/4.4] w-full sm:aspect-[16/8] lg:aspect-[21/8]">
          <LiveCanvas
            label="Capital flowing from wallets through the token and pool to connected wallets"
            draw={(ctx, t, w, h) => {
              const vertical = w < 640;
              const tt = reduced ? 0 : t;
              const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
              // Column positions
              const col = (k: number, i: number, n: number): P => {
                const along = [0.09, 0.37, 0.63, 0.91][k];
                const spread = n === 1 ? 0.5 : lerp(0.14, 0.86, i / (n - 1));
                return vertical ? { x: spread * w, y: along * h } : { x: along * w, y: spread * h };
              };
              const srcs = Array.from({ length: SOURCES }, (_, i) => col(0, i, SOURCES));
              const token = col(1, 0, 1);
              const pool = col(2, 0, 1);
              const dsts = Array.from({ length: DESTS }, (_, i) => {
                const p = col(3, i, DESTS);
                // Pull related wallets slightly together
                if (RELATED.includes(i)) return vertical ? { ...p, y: p.y + 6 } : { ...p, x: p.x - 10 };
                return p;
              });

              const evT = eventStart.current ? (performance.now() - eventStart.current) / 1000 : 99;
              const evOn = evT < EVENT_TRACE + 2.6;
              const trace = Math.min(1, evT / EVENT_TRACE);

              // Column headers
              ctx.font = "10px 'JetBrains Mono', monospace";
              ctx.fillStyle = `rgba(93,111,134,0.9)`;
              ctx.textAlign = "center";
              const headers = ["WALLETS", "TOKEN", "LIQUIDITY POOL", "CONNECTED WALLETS"];
              headers.forEach((label, k) => {
                const p = col(k, 0, 1);
                if (vertical) {
                  ctx.textAlign = "left";
                  ctx.fillText(label, 10, p.y - 22);
                } else ctx.fillText(label, p.x, 22);
              });
              ctx.textAlign = "left";

              // Vessels
              ctx.lineWidth = 1;
              for (const s of srcs) {
                ctx.strokeStyle = `rgba(${PALETTE.phosphor},0.12)`;
                strokeCurve(ctx, s, token, vertical);
              }
              dsts.forEach((d, i) => {
                ctx.strokeStyle = RELATED.includes(i) ? `rgba(${PALETTE.infra},0.22)` : `rgba(${PALETTE.phosphor},0.12)`;
                strokeCurve(ctx, pool, d, vertical);
              });
              ctx.lineWidth = 6;
              ctx.strokeStyle = `rgba(${PALETTE.phosphor},0.08)`;
              strokeCurve(ctx, token, pool, vertical);
              ctx.lineWidth = 1;
              ctx.strokeStyle = `rgba(${PALETTE.phosphor},0.35)`;
              strokeCurve(ctx, token, pool, vertical);

              // Related-wallet envelope
              const rel = RELATED.map((i) => dsts[i]);
              const rc = { x: rel.reduce((s, p) => s + p.x, 0) / rel.length, y: rel.reduce((s, p) => s + p.y, 0) / rel.length };
              const spanX = vertical ? Math.abs(rel[2].x - rel[0].x) / 2 + 26 : 30;
              const spanY = vertical ? 30 : Math.abs(rel[2].y - rel[0].y) / 2 + 26;
              ctx.strokeStyle = `rgba(${PALETTE.infra},${0.35 + (evOn ? 0.3 : 0)})`;
              ctx.setLineDash([3, 5]);
              ctx.beginPath();
              ctx.ellipse(rc.x, rc.y, spanX * (1 + 0.03 * Math.sin(tt * 1.3)), spanY * (1 + 0.03 * Math.cos(tt * 1.1)), 0, 0, Math.PI * 2);
              ctx.stroke();
              ctx.setLineDash([]);

              // Event trace: light the full path from origin to the related wallets
              if (evOn) {
                const fade = evT > EVENT_TRACE + 1.4 ? Math.max(0, 1 - (evT - EVENT_TRACE - 1.4) / 1.2) : 1;
                const seg = (k: number) => Math.min(1, Math.max(0, trace * 3 - k));
                ctx.shadowColor = `rgba(${PALETTE.infra},1)`;
                ctx.shadowBlur = 14;
                ctx.strokeStyle = `rgba(${PALETTE.infra},${0.95 * fade})`;
                ctx.lineWidth = 2;
                if (seg(0) > 0) strokeCurve(ctx, srcs[EVENT_SOURCE], token, vertical, seg(0));
                if (seg(1) > 0) strokeCurve(ctx, token, pool, vertical, seg(1));
                if (seg(2) > 0) for (const i of RELATED) strokeCurve(ctx, pool, dsts[i], vertical, seg(2));
                ctx.shadowBlur = 0;
                // Head particle
                if (trace < 1) {
                  const k = Math.min(2, Math.floor(trace * 3));
                  const local = trace * 3 - k;
                  const heads =
                    k === 0
                      ? [bezier(srcs[EVENT_SOURCE], token, local, vertical)]
                      : k === 1
                        ? [bezier(token, pool, local, vertical)]
                        : RELATED.map((i) => bezier(pool, dsts[i], local, vertical));
                  for (const hp of heads) {
                    const g = ctx.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, 16);
                    g.addColorStop(0, `rgba(255,220,230,1)`);
                    g.addColorStop(0.3, `rgba(${PALETTE.infra},0.8)`);
                    g.addColorStop(1, `rgba(${PALETTE.infra},0)`);
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(hp.x, hp.y, 16, 0, Math.PI * 2);
                    ctx.fill();
                  }
                }
              }

              // Particles along WALLET → TOKEN → POOL → CONNECTED WALLET
              ctx.globalCompositeOperation = "lighter";
              for (const p of particles) {
                const s = (p.offset + tt * p.speed) % 1;
                const k = Math.min(2, Math.floor(s * 3));
                const local = s * 3 - k;
                const pt =
                  k === 0 ? bezier(srcs[p.src], token, local, vertical) : k === 1 ? bezier(token, pool, local, vertical) : bezier(pool, dsts[p.dst], local, vertical);
                const rgb = p.hot && k === 2 ? PALETTE.infra : PALETTE.phosphor;
                const r = 1.4 + p.size * 4.6;
                const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 2.6);
                g.addColorStop(0, `rgba(${rgb},0.95)`);
                g.addColorStop(1, `rgba(${rgb},0)`);
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, r * 2.6, 0, Math.PI * 2);
                ctx.fill();
              }
              ctx.globalCompositeOperation = "source-over";

              // Nodes
              const node = (p: P, r: number, rgb: string, ring = false) => {
                ctx.fillStyle = `rgba(3,5,10,1)`;
                ctx.strokeStyle = `rgba(${rgb},0.9)`;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = `rgba(${rgb},0.9)`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(1.5, r * 0.35), 0, Math.PI * 2);
                ctx.fill();
                if (ring) {
                  ctx.strokeStyle = `rgba(${rgb},0.25)`;
                  ctx.beginPath();
                  ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
                  ctx.stroke();
                }
              };
              ctx.font = "9px 'JetBrains Mono', monospace";
              srcs.forEach((s, i) => {
                const isEvent = i === EVENT_SOURCE && evOn;
                node(s, isEvent ? 7 : 5, isEvent ? PALETTE.infra : PALETTE.phosphor, isEvent);
                if (NEW_WALLETS.includes(i)) {
                  ctx.fillStyle = `rgba(${PALETTE.phosphor},0.6)`;
                  ctx.fillText("NEW WALLET", vertical ? s.x - 22 : s.x + 12, vertical ? s.y + 20 : s.y + 3);
                }
              });
              // Token: hexagon
              ctx.strokeStyle = `rgba(${PALETTE.bone},0.85)`;
              ctx.fillStyle = "rgba(3,5,10,1)";
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              for (let i = 0; i <= 6; i++) {
                const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
                const x = token.x + Math.cos(a) * 18;
                const y = token.y + Math.sin(a) * 18;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              }
              ctx.fill();
              ctx.stroke();
              ctx.font = "10px 'JetBrains Mono', monospace";
              ctx.fillStyle = `rgba(${PALETTE.bone},0.9)`;
              ctx.textAlign = "center";
              ctx.fillText(`$${DEMO_SCAN.token.symbol}`, token.x, token.y + 36);
              // Pool: pulsing heart-like reservoir
              const beat = reduced ? 0 : Math.exp(-((tt * 1.1) % 1) * 6);
              const pr = 20 + beat * 4;
              const pg = ctx.createRadialGradient(pool.x, pool.y, 2, pool.x, pool.y, pr * 2.2);
              pg.addColorStop(0, `rgba(${PALETTE.phosphor},0.35)`);
              pg.addColorStop(1, `rgba(${PALETTE.phosphor},0)`);
              ctx.fillStyle = pg;
              ctx.beginPath();
              ctx.arc(pool.x, pool.y, pr * 2.2, 0, Math.PI * 2);
              ctx.fill();
              node(pool, pr, PALETTE.phosphor, true);
              ctx.fillStyle = `rgba(${PALETTE.bone},0.9)`;
              ctx.fillText("LP", pool.x, pool.y + 4);
              ctx.textAlign = "left";
              dsts.forEach((d, i) => {
                const related = RELATED.includes(i);
                node(d, related ? 6.5 : 5, related ? PALETTE.infra : PALETTE.phosphor, related && evOn && trace >= 1);
              });
              ctx.font = "9px 'JetBrains Mono', monospace";
              ctx.fillStyle = `rgba(${PALETTE.infra},0.75)`;
              if (vertical) ctx.fillText("RELATED WALLET ×3", rc.x - 46, rc.y + 44);
              else {
                ctx.textAlign = "center";
                ctx.fillText("RELATED WALLET ×3", rc.x, rc.y + spanY + 16);
                ctx.textAlign = "left";
              }

              // Live event labels, deterministic from the clock
              const LABELS = ["BUY", "SELL", "BUY", "TRANSFER", "BUY", "LP", "SELL", "FUND"];
              ctx.font = "10px 'JetBrains Mono', monospace";
              for (let back = 0; back < 3; back++) {
                const idx = Math.floor(tt / 0.9) - back;
                if (idx < 0) continue;
                const age = tt - idx * 0.9;
                if (age > 2.2) continue;
                const rng = createRng(idx * 7919 + 13);
                const label = LABELS[rng.int(0, LABELS.length - 1)];
                const anchor =
                  label === "LP" ? pool : label === "TRANSFER" || label === "FUND" ? dsts[rng.int(0, DESTS - 1)] : srcs[rng.int(0, SOURCES - 1)];
                const a = age < 0.3 ? age / 0.3 : Math.max(0, 1 - (age - 0.3) / 1.9);
                const rgb = label === "SELL" ? PALETTE.amber : label === "FUND" ? PALETTE.infra : PALETTE.phosphor;
                const x = anchor.x + (vertical ? 14 : -10);
                const y = anchor.y - 16 - age * 10;
                const tw = ctx.measureText(label).width + 10;
                ctx.fillStyle = `rgba(3,5,10,${0.85 * a})`;
                ctx.fillRect(x - 5, y - 10, tw, 15);
                ctx.strokeStyle = `rgba(${rgb},${0.6 * a})`;
                ctx.strokeRect(x - 5, y - 10, tw, 15);
                ctx.fillStyle = `rgba(${rgb},${a})`;
                ctx.fillText(label, x, y + 1);
              }
            }}
          />
        </div>

        <div className="relative min-h-[150px] px-4 pt-4 sm:absolute sm:right-8 sm:top-10 sm:min-h-0 sm:p-0">
        <AnimatePresence>
          {eventOn && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="glass pointer-events-none w-full rounded-[2px] border-infra/30 p-4 sm:w-[230px]"
              role="status"
            >
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] text-infra">
                <span className="blink h-1.5 w-1.5 rounded-full bg-infra" />
                {ev.label}
              </div>
              <div className="mt-3 font-mono text-[13px] text-bone">{ev.from}</div>
              <div className="mt-1 font-display text-[24px] font-bold text-bone">{ev.amount}</div>
              <div className="mt-2 font-mono text-[11px] tracking-[0.14em] text-infra">→ {ev.destinations} CONNECTED WALLETS</div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
