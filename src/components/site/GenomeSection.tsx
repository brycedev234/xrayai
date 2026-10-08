"use client";

import { motion } from "framer-motion";
import { useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useInViewport";
import { EASE, SectionHead } from "./SectionHead";
import { LiveCanvas } from "./LiveCanvas";

type Value = "ACTIVE" | "REVOKED" | "NOT PRESENT" | "UNKNOWN" | "INSUFFICIENT DATA" | "DEEP ANALYSIS NOT ENABLED" | string;

interface Field {
  label: string;
  base: Value;
  enhanced: Value;
  source: "GOPLUS" | "HELIUS";
}

/** Design example. Base = what the public GoPlus read can establish; enhanced = on-chain mint read via Helius. */
const FIELDS: Field[] = [
  { label: "MINT AUTHORITY", base: "REVOKED", enhanced: "REVOKED", source: "GOPLUS" },
  { label: "FREEZE AUTHORITY", base: "REVOKED", enhanced: "REVOKED", source: "GOPLUS" },
  { label: "TOKEN PROGRAM", base: "DEEP ANALYSIS NOT ENABLED", enhanced: "SPL", source: "HELIUS" },
  { label: "TOKEN-2022 STATUS", base: "INSUFFICIENT DATA", enhanced: "NOT PRESENT", source: "HELIUS" },
  { label: "TRANSFER HOOK", base: "NOT PRESENT", enhanced: "NOT PRESENT", source: "GOPLUS" },
  { label: "DEFAULT ACCOUNT STATE", base: "UNKNOWN", enhanced: "INITIALIZED", source: "HELIUS" },
  { label: "METADATA MUTABILITY", base: "IMMUTABLE", enhanced: "IMMUTABLE", source: "GOPLUS" },
  { label: "UPDATE AUTHORITY", base: "REVOKED", enhanced: "REVOKED", source: "GOPLUS" },
  { label: "TOTAL SUPPLY", base: "1,000,000,000", enhanced: "1,000,000,000", source: "GOPLUS" },
  { label: "DECIMALS", base: "DEEP ANALYSIS NOT ENABLED", enhanced: "6", source: "HELIUS" },
  { label: "TOKEN EXTENSIONS", base: "DEEP ANALYSIS NOT ENABLED", enhanced: "NOT PRESENT", source: "HELIUS" },
];

const LEGEND: [Value, string][] = [
  ["ACTIVE", "Authority still held"],
  ["REVOKED", "Authority removed"],
  ["NOT PRESENT", "Feature absent"],
  ["UNKNOWN", "Not reported"],
  ["INSUFFICIENT DATA", "Source can't establish it"],
  ["DEEP ANALYSIS NOT ENABLED", "Needs Helius configured on the server"],
];

function tone(v: Value): "infra" | "phosphor" | "bone" | "mute" {
  if (v === "ACTIVE") return "infra";
  if (v === "REVOKED" || v === "IMMUTABLE") return "phosphor";
  if (v === "UNKNOWN" || v === "INSUFFICIENT DATA" || v === "DEEP ANALYSIS NOT ENABLED") return "mute";
  return "bone";
}
const RGB = { infra: "255,47,109", phosphor: "127,227,255", bone: "216,230,242", mute: "93,111,134" };

export function GenomeSection() {
  const [mode, setMode] = useState<"base" | "enhanced">("base");
  const [hover, setHover] = useState<number | null>(null);
  const reduced = useReducedMotion();
  const stateRef = useRef({ mode, hover });
  stateRef.current = { mode, hover };

  return (
    <section id="genome" className="relative px-4 pt-28 sm:px-8 sm:pt-40">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHead
            eyebrow="TOKEN GENOME / 02"
            lines={["READ", "THE DNA."]}
            copy="Before a single holder is traced, the mint itself is read: who can still create supply, freeze accounts or rewrite the token."
          />
          <div className="flex items-center gap-1 rounded-[2px] border border-white/10 p-1 font-mono text-[10px] tracking-[0.2em]" role="group" aria-label="Genome source">
            {(["base", "enhanced"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`px-3 py-1.5 transition ${mode === m ? "bg-phosphor/10 text-phosphor" : "text-mute hover:text-bone"}`}
              >
                {m === "base" ? "BASE MODE" : "HELIUS ENHANCED"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-14 grid grid-cols-1 items-stretch gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div className="relative h-[300px] border-y border-white/[0.06] lg:h-auto lg:min-h-[520px] lg:border-y-0 lg:border-r lg:pr-8">
            <LiveCanvas
              label="Token genome double helix; each rung is one configuration field"
              className="absolute inset-0"
              draw={(ctx, t, w, h) => {
                const { mode: m, hover: hv } = stateRef.current;
                const tt = reduced ? 0 : t;
                ctx.clearRect(0, 0, w, h);
                const vertical = w < h * 1.4;
                const n = FIELDS.length;
                const len = vertical ? h * 0.86 : w * 0.86;
                const amp = (vertical ? w : h) * 0.18;
                const cx = w / 2;
                const cy = h / 2;
                const at = (k: number, phase: number) => {
                  const u = k / (n - 1);
                  const along = -len / 2 + u * len;
                  const ang = u * Math.PI * 3.2 + tt * 0.45 + phase;
                  const off = Math.sin(ang) * amp;
                  const depth = Math.cos(ang);
                  return { x: vertical ? cx + off : cx + along, y: vertical ? cy + along : cy + off, depth };
                };
                // strands
                for (const phase of [0, Math.PI]) {
                  ctx.beginPath();
                  for (let i = 0; i <= 120; i++) {
                    const p = at((i / 120) * (n - 1), phase);
                    if (i === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                  }
                  ctx.strokeStyle = `rgba(${RGB.phosphor},0.28)`;
                  ctx.lineWidth = 1.2;
                  ctx.stroke();
                }
                // rungs = fields
                FIELDS.forEach((f, k) => {
                  const a = at(k, 0);
                  const b = at(k, Math.PI);
                  const v = m === "base" ? f.base : f.enhanced;
                  const rgb = RGB[tone(v)];
                  const lit = hv === null || hv === k;
                  const alpha = (0.35 + 0.45 * ((a.depth + 1) / 2)) * (lit ? 1 : 0.25);
                  ctx.strokeStyle = `rgba(${rgb},${alpha})`;
                  ctx.lineWidth = hv === k ? 2.2 : 1.2;
                  ctx.setLineDash(tone(v) === "mute" ? [3, 4] : []);
                  ctx.beginPath();
                  ctx.moveTo(a.x, a.y);
                  ctx.lineTo(b.x, b.y);
                  ctx.stroke();
                  ctx.setLineDash([]);
                  for (const p of [a, b]) {
                    ctx.fillStyle = `rgba(${rgb},${Math.min(1, alpha + 0.2)})`;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, hv === k ? 3.6 : 2.4, 0, Math.PI * 2);
                    ctx.fill();
                  }
                });
              }}
            />
            <div className="pointer-events-none absolute left-0 top-3 font-mono text-[10px] tracking-[0.2em] text-mute">
              {mode === "base" ? "SOURCE · GOPLUS (PUBLIC)" : "SOURCE · ON-CHAIN MINT ACCOUNT VIA HELIUS"}
            </div>
          </div>

          <div className="min-w-0">
            <motion.dl initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} className="border-t border-white/[0.07]">
              {FIELDS.map((f, i) => {
                const v = mode === "base" ? f.base : f.enhanced;
                const tn = tone(v);
                return (
                  <motion.div
                    key={f.label}
                    variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
                    transition={{ duration: 0.7, delay: 0.1 + i * 0.05, ease: EASE }}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    className={`grid grid-cols-[28px_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-white/[0.06] py-3 transition-colors ${hover === i ? "bg-white/[0.025]" : ""}`}
                  >
                    <span className="font-mono text-[10px] text-mute">{String(i + 1).padStart(2, "0")}</span>
                    <dt className="truncate font-mono text-[11.5px] tracking-[0.16em] text-bone/70">
                      {f.label}
                      <span className="ml-3 hidden text-[9.5px] text-mute sm:inline">{f.source}</span>
                    </dt>
                    <dd
                      className={`text-right font-mono text-[12px] tracking-[0.12em] ${tn === "infra" ? "text-infra" : tn === "phosphor" ? "text-phosphor" : tn === "mute" ? "text-mute" : "text-bone"}`}
                    >
                      {v}
                    </dd>
                  </motion.div>
                );
              })}
            </motion.dl>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] tracking-[0.14em] text-mute">
              {LEGEND.map(([v, meaning]) => (
                <span key={v} className="flex items-center gap-2">
                  <span className={tone(v) === "infra" ? "text-infra" : tone(v) === "phosphor" ? "text-phosphor" : tone(v) === "mute" ? "text-mute" : "text-bone"}>{v}</span>
                  <span className="text-mute/70">{meaning}</span>
                </span>
              ))}
            </div>
            <p className="mt-5 font-mono text-[10px] tracking-[0.18em] text-mute/80">DESIGN EXAMPLE · LIVE SCANS SHOW ONLY WHAT THE SOURCES RETURN</p>
          </div>
        </div>
      </div>
    </section>
  );
}
