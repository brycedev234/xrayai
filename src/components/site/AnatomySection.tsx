"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { DEMO_SCAN, demoSpecimen, type DemoScan } from "@/data/mockScan";
import { formatUsd } from "@/lib/format";
import { useReducedMotion } from "@/hooks/useInViewport";
import { ORGANS } from "../xray/anatomy";
import type { SpecimenLayout } from "../xray/layout";
import type { FocusKey } from "../xray/renderer";
import { EASE, SectionHead } from "./SectionHead";
import { TokenBody, viewBoxFor, type BodyView } from "./TokenBody";

interface ModuleSpec {
  code: string;
  organ: string;
  system: string;
  focus: Exclude<FocusKey, null>;
  description: string;
  view: BodyView;
  fields: (d: DemoScan) => [string, string][];
}

const pct = (n: number, sign = false) => `${sign && n > 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;

const MODULES: ModuleSpec[] = [
  {
    code: "A/01",
    organ: "HEART",
    system: "LIQUIDITY",
    focus: "liquidity",
    description: "The capital keeping the token alive.",
    view: { cx: ORGANS.heart.x, cy: ORGANS.heart.y + 8, zoom: 3.4 },
    fields: (d) => [
      ["LIQUIDITY", formatUsd(d.liquidity.poolUsd)],
      ["24H VOLUME", "$612.5K"],
      ["LP STATUS", "BURNED"],
      ["PAIR AGE", d.liquidity.poolAge],
    ],
  },
  {
    code: "A/02",
    organ: "GENOME",
    system: "TOKEN CONFIGURATION",
    focus: "concentration",
    description: "The rules written into the mint: who can still change it.",
    view: { cx: 500, cy: 600, zoom: 2.6 },
    fields: () => [
      ["MINT AUTHORITY", "REVOKED"],
      ["FREEZE AUTHORITY", "REVOKED"],
      ["TOKEN PROGRAM", "SPL"],
      ["METADATA", "IMMUTABLE"],
    ],
  },
  {
    code: "A/03",
    organ: "BRAIN",
    system: "CREATOR / ORIGIN",
    focus: "creator",
    description: "The origin address and the authority it still holds.",
    view: { cx: ORGANS.brain.x, cy: ORGANS.brain.y - 6, zoom: 3.4 },
    fields: (d) => [
      ["ORIGIN SHARE", "2.4%"],
      ["ORIGIN AUTHORITY", "REVOKED"],
      ["PRIOR DEPLOYMENTS", String(d.deployer.priorDeployments)],
      ["EVIDENCE", "FIRST TX SIGNER"],
    ],
  },
  {
    code: "A/04",
    organ: "CELLS",
    system: "HOLDER STRUCTURE",
    focus: "concentration",
    description: "The wallets forming the ownership structure. Accounts are evidence, not people.",
    view: { cx: 420, cy: 640, zoom: 2.5 },
    fields: (d) => [
      ["HOLDERS", d.holders.unique.toLocaleString("en-US")],
      ["TOP 10 SHARE", pct(d.holders.top10Share)],
      ["LARGEST HOLDER", pct(d.holders.topHolderShare)],
      ["FRESH WALLETS", "9.6%"],
    ],
  },
  {
    code: "A/05",
    organ: "BLOODSTREAM",
    system: "TOKEN / MARKET FLOW",
    focus: "flow",
    description: "Capital moving through the token.",
    view: { cx: 500, cy: 470, zoom: 1.7 },
    fields: (d) => [
      ["24H BUYS / SELLS", "1,284 / 1,107"],
      ["BUY / SELL RATIO", "1.16×"],
      ["24H VOLUME", "$612.5K"],
      ["MAJOR MOVEMENTS", String(d.transactions.largeMovements)],
    ],
  },
];

const MASS_VIEW: BodyView = { cx: ORGANS.tumor.x, cy: ORGANS.tumor.y, zoom: 2.5 };

function Lens({
  view,
  focus,
  tone = "phosphor",
  children,
}: {
  view: BodyView;
  focus: FocusKey;
  tone?: "phosphor" | "infra";
  children?: (layout: SpecimenLayout) => React.ReactNode;
}) {
  const scan = useMemo(() => demoSpecimen(), []);
  const reduced = useReducedMotion();
  const ring = tone === "infra" ? "var(--infra)" : "var(--phosphor)";
  return (
    <div className="relative aspect-square w-full max-w-[260px]">
      <div className="absolute inset-[6%] overflow-hidden rounded-full bg-[radial-gradient(circle,rgba(127,227,255,0.05),transparent_70%)]">
        <TokenBody scan={scan} view={view} frame={() => ({ mode: "specimen", focus })} reducedMotion={reduced}>
          {children}
        </TokenBody>
      </div>
      {/* Lens ring with graduation ticks */}
      <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <circle cx="100" cy="100" r="88" fill="none" stroke={ring} strokeOpacity="0.35" />
        <circle cx="100" cy="100" r="96" fill="none" stroke="var(--bone)" strokeOpacity="0.06" />
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i / 60) * Math.PI * 2;
          const long = i % 5 === 0;
          const r1 = 96;
          const r2 = long ? 90 : 93;
          return (
            <line
              key={i}
              x1={100 + Math.cos(a) * r1}
              y1={100 + Math.sin(a) * r1}
              x2={100 + Math.cos(a) * r2}
              y2={100 + Math.sin(a) * r2}
              stroke={long ? ring : "var(--bone)"}
              strokeOpacity={long ? 0.6 : 0.2}
            />
          );
        })}
        <g className="lens-sweep" style={{ transformOrigin: "100px 100px" }}>
          <line x1="100" y1="100" x2="100" y2="12" stroke={ring} strokeOpacity="0.35" />
        </g>
      </svg>
    </div>
  );
}

function BrainLinks({ active }: { active: boolean }) {
  const B = ORGANS.brain;
  const wallets = Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI * 0.95 + (i / 4) * Math.PI * 0.9 + Math.PI;
    return { x: B.x + Math.cos(a) * 112, y: B.y - 6 + Math.sin(a) * 112 };
  });
  return (
    <svg viewBox={viewBoxFor(MODULES.find((m) => m.organ === "BRAIN")!.view)} className="absolute inset-0 h-full w-full" aria-hidden>
      {wallets.map((w, i) => (
        <g key={i}>
          <motion.path
            d={`M ${B.x + (i - 2) * 9} ${B.y - 10} Q ${(B.x + w.x) / 2} ${B.y - 60} ${w.x} ${w.y}`}
            fill="none"
            stroke={i === 1 || i === 3 ? "var(--infra)" : "var(--phosphor)"}
            strokeWidth={1.2}
            initial={false}
            animate={{ pathLength: active ? 1 : 0, opacity: active ? 0.9 : 0 }}
            transition={{ duration: 0.9, delay: active ? i * 0.08 : 0, ease: EASE }}
          />
          <motion.circle
            cx={w.x}
            cy={w.y}
            r={4.5}
            fill="var(--film-950)"
            stroke={i === 1 || i === 3 ? "var(--infra)" : "var(--phosphor)"}
            strokeWidth={1.4}
            initial={false}
            animate={{ opacity: active ? 1 : 0.25 }}
            transition={{ duration: 0.5, delay: active ? 0.4 + i * 0.08 : 0 }}
          />
        </g>
      ))}
    </svg>
  );
}

function Fields({ items, tone = "phosphor" }: { items: [string, string][]; tone?: "phosphor" | "infra" }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-5">
      {items.map(([label, value], i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ delay: 0.2 + i * 0.1, duration: 0.9 }}
          className="min-w-0 border-l border-white/[0.07] pl-4"
        >
          <dt className="font-mono text-[10px] tracking-[0.2em] text-mute">{label}</dt>
          <dd className={`mt-1.5 font-mono text-[15px] tabular-nums ${tone === "infra" ? "text-infra" : "text-bone"}`}>{value}</dd>
        </motion.div>
      ))}
    </dl>
  );
}

function AnatomyModule({ spec }: { spec: ModuleSpec }) {
  const [hover, setHover] = useState(false);
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 1.1, ease: EASE }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="module grid grid-cols-1 items-center gap-8 border-t border-white/[0.07] py-10 sm:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12"
    >
      <div className="relative mx-auto w-[min(72vw,260px)] sm:mx-0 sm:w-full">
        <Lens view={spec.view} focus={spec.focus}>
          {spec.focus === "creator" ? () => <BrainLinks active={hover} /> : undefined}
        </Lens>
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[10px] tracking-[0.24em] text-mute">{spec.code}</div>
        <h3 className="mt-3 font-display text-[clamp(28px,3.2vw,48px)] font-bold leading-none text-bone">{spec.organ}</h3>
        <div className="mt-2 font-mono text-[11px] tracking-scan text-phosphor/80">{spec.system}</div>
        <p className="mt-5 max-w-[34ch] text-[15px] leading-relaxed text-bone/60">{spec.description}</p>
        {spec.focus === "creator" && (
          <p className="mt-3 font-mono text-[10px] tracking-[0.18em] text-mute">HOVER TO TRACE WALLET CONNECTIONS</p>
        )}
      </div>
      <div className="min-w-0 sm:col-span-2 lg:col-span-1">
        <Fields items={spec.fields(DEMO_SCAN)} />
      </div>
    </motion.article>
  );
}

function MassModule() {
  const c = DEMO_SCAN.clusters.primary;
  const fields: [string, string][] = [
    ["COMMON FUNDING", `${c.commonFunding} / ${c.wallets}`],
    ["SYNCHRONIZED ACTIVITY", `${c.timing.count} in ${c.timing.windowSec}s`],
    ["SUPPLY CONCENTRATION", pct(c.combinedSupply)],
    ["ORIGIN PROXIMITY", `${c.deployerHops} wallets`],
    ["WALLET-TO-WALLET", `${c.transfers} transfers`],
  ];
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 1.2, ease: EASE }}
      className="mass-module relative mt-2 grid grid-cols-1 items-center gap-8 overflow-hidden border border-infra/25 px-5 py-10 sm:grid-cols-[200px_minmax(0,1fr)] sm:px-8 lg:grid-cols-[240px_minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12"
    >
      <div className="mass-module__hatch" aria-hidden />
      <div className="relative mx-auto w-[min(72vw,260px)] sm:mx-0 sm:w-full">
        <Lens view={MASS_VIEW} focus="cluster" tone="infra">
          {(layout) => (
            <svg viewBox={viewBoxFor(MASS_VIEW)} className="absolute inset-0 h-full w-full" aria-hidden>
              {layout.clusterNodes.map((n, i) =>
                layout.clusterNodes.slice(i + 1, i + 3).map((m) => (
                  <line key={n.address + m.address} x1={n.x} y1={n.y} x2={m.x} y2={m.y} stroke="var(--infra)" strokeOpacity={0.45} strokeWidth={1.2} />
                )),
              )}
              {layout.clusterNodes.map((n, i) => (
                <circle key={n.address} cx={n.x} cy={n.y} r={n.r * 0.9} fill="var(--infra)" fillOpacity={0.35} stroke="var(--infra)" strokeWidth={1.2}>
                  <animate attributeName="fill-opacity" values="0.2;0.6;0.2" dur={`${2.4 + (i % 4) * 0.4}s`} repeatCount="indefinite" />
                </circle>
              ))}
            </svg>
          )}
        </Lens>
      </div>
      <div className="relative min-w-0">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] text-infra">
          <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-infra" />
          A/06 · SIGNATURE
        </div>
        <h3 className="mt-3 font-display text-[clamp(28px,3.2vw,48px)] font-bold leading-none text-infra">MASS</h3>
        <div className="mt-2 font-mono text-[11px] tracking-scan text-infra/80">CONNECTED HOLDER CLUSTERS</div>
        <p className="mt-5 max-w-[34ch] text-[15px] leading-relaxed text-bone/70">Groups of wallets showing overlapping relationship indicators.</p>
        <a
          href="#mass"
          className="mt-7 inline-flex items-center gap-3 border border-infra/50 px-5 py-3 font-mono text-[11px] tracking-[0.24em] text-infra transition hover:bg-infra/10"
        >
          INSPECT MASS <span aria-hidden>→</span>
        </a>
      </div>
      <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
        <Fields items={fields} tone="infra" />
      </div>
    </motion.article>
  );
}

export function AnatomySection() {
  return (
    <section id="anatomy" className="relative px-4 pb-10 pt-28 sm:px-8 sm:pt-40">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHead eyebrow="RADIOGRAPHY / 02" lines={["EVERY PART", "MEANS SOMETHING."]} />
          <p className="max-w-[32ch] font-mono text-[11px] leading-relaxed tracking-[0.08em] text-mute">
            SPECIMEN ${DEMO_SCAN.token.symbol} · {DEMO_SCAN.token.chain} · DESIGN EXAMPLE · DEMO RADIOGRAPHY
          </p>
        </div>
        <div className="mt-16">
          {MODULES.map((m) => (
            <AnatomyModule key={m.code} spec={m} />
          ))}
          <MassModule />
        </div>
      </div>
    </section>
  );
}
