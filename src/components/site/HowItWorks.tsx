"use client";

import { animate, motion, useInView } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { demoSpecimen } from "@/data/mockScan";
import { useMediaQuery, useReducedMotion } from "@/hooks/useInViewport";
import { ClusterOverlay } from "../xray/ClusterOverlay";
import type { FocusKey } from "../xray/renderer";
import { EASE, SectionHead } from "./SectionHead";
import { FULL_VIEW, TokenBody } from "./TokenBody";

/* ------------------------------------------------------------------ */
/* Content. Everything in this section is explanation: the findings in */
/* step 03 are a labelled design example and never touch a real scan.  */
/* ------------------------------------------------------------------ */

const INGEST_LABELS = ["TOKEN CONFIGURATION", "LIQUIDITY", "POOLS", "HOLDERS", "MARKET ACTIVITY", "CREATOR / ORIGIN", "WALLET RELATIONSHIPS"];
const INGEST_FLOW = ["CA", "CHAIN DATA", "MARKET DATA", "SECURITY DATA"];

const ORGANS: { name: string; role: string; focus: FocusKey }[] = [
  { name: "GENOME", role: "Token configuration and authorities", focus: null },
  { name: "HEART", role: "Liquidity and market depth", focus: "liquidity" },
  { name: "BRAIN", role: "Creator / origin structure", focus: "creator" },
  { name: "CELLS", role: "Holder distribution", focus: "concentration" },
  { name: "BLOODSTREAM", role: "Market and token flow", focus: "flow" },
  { name: "MASS", role: "Connected holder clusters", focus: "cluster" },
];

type Finding = { label: string; value: string; count?: { to: number; decimals: number; prefix?: string; suffix?: string }; flag: boolean };
const FINDINGS: Finding[] = [
  { label: "MINT AUTHORITY", value: "REVOKED", flag: false },
  { label: "FREEZE AUTHORITY", value: "ACTIVE", flag: true },
  { label: "LIQUIDITY", value: "$184K", count: { to: 184, decimals: 0, prefix: "$", suffix: "K" }, flag: false },
  { label: "TOP 10 HOLDERS", value: "31.8%", count: { to: 31.8, decimals: 1, suffix: "%" }, flag: false },
  { label: "MASS 01", value: "11 RELATED HOLDERS", count: { to: 11, decimals: 0, suffix: " RELATED HOLDERS" }, flag: true },
  { label: "COMMON FUNDING RELATIONSHIP", value: "DETECTED", flag: true },
  { label: "RELATIONSHIP SIGNAL", value: "82%", count: { to: 82, decimals: 0, suffix: "%" }, flag: true },
];

const QUESTIONS: [string, string][] = [
  ["WHAT CAN STILL BE CONTROLLED?", "GENOME"],
  ["HOW STRONG IS LIQUIDITY?", "HEART"],
  ["HOW CONCENTRATED IS SUPPLY?", "CELLS"],
  ["WHO / WHAT IS THE ORIGIN?", "BRAIN"],
  ["HOW IS CAPITAL MOVING?", "BLOODSTREAM"],
  ["ARE IMPORTANT HOLDERS CONNECTED?", "MASS"],
  ["WHAT EVIDENCE SUPPORTS THE FINDINGS?", "CASE FILE"],
];

const SOURCES: [string, string][] = [
  ["DEXSCREENER", "MARKET / LIQUIDITY"],
  ["GOPLUS", "TOKEN SECURITY"],
  ["HELIUS", "CHAIN / HOLDERS / WALLET INTELLIGENCE"],
];

const STAGES = [
  {
    code: "01 / INGEST",
    title: "READ THE TOKEN.",
    body: "X-RAY takes one Solana mint address and pulls live data from the chain and supporting market and security sources.",
  },
  {
    code: "02 / RECONSTRUCT",
    title: "BUILD THE BODY.",
    body: "Raw blockchain data is converted into a visual anatomy that makes the token easier to inspect.",
  },
  {
    code: "03 / DIAGNOSE",
    title: "EXPOSE THE STRUCTURE.",
    body: "X-RAY surfaces observable token risks, concentration, privileged controls and wallet relationships without reducing everything to a fake safety score.",
  },
];

const DIAGNOSE_CYCLE: Exclude<FocusKey, null>[] = ["liquidity", "creator", "concentration", "flow", "cluster"];

/* ------------------------------------------------------------------ */

interface Props {
  /** The landing scroll container; drives the scroll-linked reconstruction. */
  scroller: RefObject<HTMLElement | null>;
  /** Scroll to and focus the scan input. */
  onScanCta: () => void;
}

export function HowItWorks({ scroller, onScanCta }: Props) {
  const scan = useMemo(() => demoSpecimen(), []);
  const reduced = useReducedMotion();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [stage, setStage] = useState(0);
  const [organ, setOrgan] = useState(-1);
  const [hoverFocus, setHoverFocus] = useState<FocusKey>(null);
  const [cycleFocus, setCycleFocus] = useState<FocusKey>(null);
  const stageStart = useRef<{ stage: number; at: number | null }>({ stage: 0, at: null });
  const reconstructRef = useRef<HTMLLIElement>(null);

  // Step 02: the organ being reconstructed follows scroll through that step.
  // Progress runs from the step's top reaching the top of the viewport to its bottom crossing 75%,
  // which is roughly the stretch where step 02 is the active step.
  useEffect(() => {
    const root = scroller.current;
    const el = reconstructRef.current;
    if (!root || !el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const vh = root.clientHeight;
      const r = el.getBoundingClientRect();
      const from = vh * 0.05;
      const to = vh * 0.75 - r.height;
      const v = (from - r.top) / (from - to);
      const next = v <= 0 ? -1 : Math.min(ORGANS.length - 1, Math.floor(v * ORGANS.length));
      setOrgan((o) => (o === next ? o : next));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [scroller]);

  const organFocus = organ >= 0 ? ORGANS[organ].focus : null;

  // Body frame for the current stage, driven from the canvas clock.
  const frame = (t: number) => {
    const s = stageStart.current;
    if (s.stage !== stage || s.at === null) stageStart.current = { stage, at: t };
    const since = t - (stageStart.current.at ?? t);
    if (stage === 0) return { mode: "ingest" as const, ingestT: since };
    if (stage === 1) return { mode: "specimen" as const, revealT: reduced ? 99 : Math.min(since * 0.85, 4.4), focus: organFocus };
    const idx = since < 2.6 ? -1 : Math.floor((since - 2.6) / 1.7) % (DIAGNOSE_CYCLE.length + 1);
    const auto = idx >= 0 && idx < DIAGNOSE_CYCLE.length ? DIAGNOSE_CYCLE[idx] : null;
    if (auto !== cycleFocus) queueMicrotask(() => setCycleFocus(auto));
    return { mode: "specimen" as const, revealT: 2.45 + since, focus: hoverFocus ?? auto };
  };
  const diagnoseFocus = hoverFocus ?? cycleFocus;

  const readout =
    stage === 0 ? "INGESTING · CA → CHAIN → MARKET → SECURITY" : stage === 1 ? `RECONSTRUCTING · ${organ >= 0 ? ORGANS[organ].name : "SKELETON"}` : "DIAGNOSING · STRUCTURE";

  return (
    <section id="how-it-works" className="relative px-4 sm:px-8">
      <div className="mx-auto max-w-[1440px] pt-28 sm:pt-40">
        <SectionHead
          eyebrow="PROCEDURE / 06"
          lines={["ONE CONTRACT.", "FULL RADIOGRAPHY."]}
          copy={
            <>
              Paste a Solana token address. X-RAY pulls live market, security, holder and wallet data, reconstructs the token as a diagnostic system, then
              exposes the structures hidden behind the chart.
              <span className="mt-4 block font-mono text-[11px] tracking-[0.18em] text-phosphor/80">THE TOKEN IS THE PATIENT. WALLETS ARE EVIDENCE INSIDE THE TOKEN.</span>
            </>
          }
        />
      </div>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
        {/* Desktop: the body stays pinned beside the procedure. */}
        {desktop && (
          <div className="sticky top-16 z-10 order-2 h-[calc(100vh-64px)]">
            <div className="relative flex h-full items-center justify-center">
              <div className="relative h-full max-h-[860px] w-auto" style={{ aspectRatio: "1 / 1", maxWidth: "100%" }}>
                <TokenBody scan={scan} view={FULL_VIEW} frame={frame} reducedMotion={reduced} label="Token body being scanned">
                  {(layout) =>
                    stage === 2 ? (
                      <div className="pointer-events-auto absolute inset-0">
                        <ClusterOverlay
                          scan={scan}
                          layout={layout}
                          hovered={null}
                          onHover={() => {}}
                          highlightKind={null}
                          focus={diagnoseFocus}
                          onFocus={setHoverFocus}
                          compact={false}
                          delayShift={2.6}
                        />
                      </div>
                    ) : null
                  }
                </TokenBody>
                <div className="pointer-events-none absolute left-2 top-10 font-mono text-[10px] tracking-[0.2em] text-mute">
                  <motion.div key={readout} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                    <span className="blink mr-2 inline-block h-1.5 w-1.5 rounded-full bg-phosphor align-middle" />
                    {readout}
                  </motion.div>
                </div>
                {stage > 0 && (
                  <div className="pointer-events-none absolute bottom-10 left-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tracking-[0.2em]">
                    {ORGANS.map((o, i) => {
                      const lit = stage === 1 ? i <= organ : o.focus !== null && diagnoseFocus === o.focus;
                      const current = stage === 1 ? i === organ : lit;
                      return (
                        <span key={o.name} className={`transition-colors duration-500 ${lit ? (o.name === "MASS" ? "text-infra" : current ? "text-phosphor" : "text-bone/70") : "text-mute/50"}`}>
                          {o.name}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <ol className="relative order-1">
          {desktop && (
            <div className="absolute bottom-[30vh] left-[7px] top-[30vh] w-px bg-white/[0.07]" aria-hidden>
              <motion.div className="w-px bg-phosphor" animate={{ height: `${((stage + 1) / STAGES.length) * 100}%` }} transition={{ duration: 1.2, ease: EASE }} />
            </div>
          )}
          {STAGES.map((s, i) => (
            <motion.li
              key={s.code}
              ref={i === 1 ? reconstructRef : undefined}
              className={`relative flex flex-col border-t border-white/[0.06] py-16 first:border-t-0 lg:border-t-0 lg:py-0 lg:pl-10 ${
                i === 1 ? "lg:min-h-[200vh] lg:justify-start" : "justify-center lg:min-h-screen"
              }`}
              onViewportEnter={() => setStage(i)}
              viewport={{ amount: desktop ? 0.45 : 0.3 }}
            >
              {desktop && (
                <span
                  className={`absolute left-0 top-1/2 h-[15px] w-[15px] -translate-y-1/2 rounded-full border transition-colors duration-700 ${
                    stage >= i ? "border-phosphor bg-phosphor/20" : "border-white/15 bg-[var(--film-950)]"
                  }`}
                />
              )}
              <motion.div className={`relative ${i === 1 ? "lg:sticky lg:top-[calc(64px+10vh)] lg:mt-[16vh]" : ""}`} animate={{ opacity: !desktop || stage === i ? 1 : 0.28 }} transition={{ duration: 0.8 }}>
                {!reduced && stage === i && (
                  <motion.span
                    key={`sweep-${i}`}
                    aria-hidden
                    className="pointer-events-none absolute -left-4 right-0 h-px bg-gradient-to-r from-transparent via-phosphor/60 to-transparent"
                    initial={{ top: "0%", opacity: 0 }}
                    animate={{ top: ["0%", "100%"], opacity: [0, 1, 0] }}
                    transition={{ duration: 2.2, ease: "linear" }}
                  />
                )}
                <div className="flex items-end gap-5">
                  <span className="outline-text font-display font-bold leading-[0.8]" style={{ fontSize: "clamp(64px, 8vw, 128px)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="pb-2 font-mono text-[11px] tracking-scan text-phosphor/80">{s.code}</span>
                </div>
                <h3 className="mt-6 font-display text-[clamp(26px,3vw,46px)] font-bold leading-[0.95] text-bone">{s.title}</h3>
                <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-bone/60">{s.body}</p>

                {i === 0 && <IngestDetail reduced={reduced} />}
                {i === 1 && <ReconstructDetail organ={organ} />}
                {i === 1 && !desktop && <MobileBody scan={scan} organ={organ} reduced={reduced} />}
                {i === 2 && <DiagnoseDetail reduced={reduced} />}
              </motion.div>
            </motion.li>
          ))}
        </ol>
      </div>

      <Questions />
      <SummaryStrip onScanCta={onScanCta} reduced={reduced} />
    </section>
  );
}

/* ---------------------------- Step 01 ---------------------------- */

function IngestDetail({ reduced }: { reduced: boolean }) {
  return (
    <div className="mt-8">
      <div className="flex flex-col items-start gap-0 font-mono text-[10px] tracking-[0.2em] sm:flex-row sm:items-center">
        {INGEST_FLOW.map((label, i) => (
          <div key={label} className="flex flex-col items-start sm:flex-row sm:items-center">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 + i * 0.35, duration: 0.7 }}
              className={`whitespace-nowrap border px-2.5 py-1.5 ${i === 0 ? "border-phosphor/40 text-phosphor" : "border-white/10 text-bone/80"}`}
            >
              {label}
            </motion.span>
            {i < INGEST_FLOW.length - 1 && (
              <span className="wire relative ml-5 h-6 w-px overflow-hidden bg-white/10 sm:ml-0 sm:h-px sm:w-10" aria-hidden>
                {!reduced && <span className="wire__particle" style={{ animationDelay: `${i * 0.35}s` }} />}
              </span>
            )}
          </div>
        ))}
      </div>
      <ul className="mt-7 grid max-w-[520px] grid-cols-1 gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.16em] text-mute sm:grid-cols-2">
        {INGEST_LABELS.map((item, j) => (
          <motion.li
            key={item}
            initial={{ opacity: 0, x: -6 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 + j * 0.12, duration: 0.7, ease: EASE }}
          >
            <span className="text-phosphor/70">+</span> {item}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------- Step 02 ---------------------------- */

function ReconstructDetail({ organ }: { organ: number }) {
  return (
    <ol className="mt-8 max-w-[520px] border-t border-white/[0.07]">
      {ORGANS.map((o, i) => {
        const lit = i <= organ;
        const mass = o.name === "MASS";
        return (
          <li key={o.name} className="flex items-baseline gap-4 border-b border-white/[0.07] py-2.5">
            <span className={`h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full transition-colors duration-500 ${lit ? (mass ? "bg-infra" : "bg-phosphor") : "bg-white/15"}`} />
            <span className={`w-[118px] shrink-0 font-mono text-[11px] tracking-[0.2em] transition-colors duration-500 ${lit ? (mass ? "text-infra" : "text-bone") : "text-mute"}`}>{o.name}</span>
            <span className={`text-[13px] transition-colors duration-500 ${lit ? "text-bone/70" : "text-bone/30"}`}>{o.role}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Mobile: one compact body inside step 02 instead of a pinned one. */
function MobileBody({ scan, organ, reduced }: { scan: ReturnType<typeof demoSpecimen>; organ: number; reduced: boolean }) {
  const start = useRef<number | null>(null);
  const focus = organ >= 0 ? ORGANS[organ].focus : null;
  return (
    <div className="relative mx-auto mt-8 w-full max-w-[380px]">
      <TokenBody
        scan={scan}
        view={FULL_VIEW}
        reducedMotion={reduced}
        label="Token body being reconstructed"
        frame={(t) => {
          if (start.current === null) start.current = t;
          return { mode: "specimen", revealT: reduced ? 99 : Math.min((t - start.current) * 0.85, 4.4), focus };
        }}
      />
      <div className="pointer-events-none absolute left-1 top-1 font-mono text-[9.5px] tracking-[0.2em] text-mute">
        <span className="blink mr-2 inline-block h-1.5 w-1.5 rounded-full bg-phosphor align-middle" />
        RECONSTRUCTING · {organ >= 0 ? ORGANS[organ].name : "SKELETON"}
      </div>
    </div>
  );
}

/* ---------------------------- Step 03 ---------------------------- */

function DiagnoseDetail({ reduced }: { reduced: boolean }) {
  return (
    <div className="mt-8 max-w-[520px]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-[10px] tracking-[0.2em] text-mute">
        <span>EXAMPLE READOUT</span>
        <span className="text-amber/80">DESIGN EXAMPLE · NOT A LIVE TOKEN</span>
      </div>
      <ul className="mt-3 border-t border-white/[0.07] font-mono text-[11px] tracking-[0.14em]">
        {FINDINGS.map((f, i) => (
          <motion.li
            key={f.label}
            className="flex items-center gap-3 border-b border-white/[0.07] py-2.5"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.8 }}
            transition={{ delay: 0.15 + i * 0.18, duration: 0.6 }}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${f.flag ? "bg-infra" : "bg-phosphor"}`} />
            <span className="text-bone/80">{f.label}</span>
            <span className="h-px min-w-4 flex-1 border-t border-dotted border-white/15" aria-hidden />
            <span className={`whitespace-nowrap text-right ${f.flag ? "text-infra" : "text-phosphor"}`}>
              {f.count && !reduced ? <CountUp {...f.count} final={f.value} /> : f.value}
            </span>
          </motion.li>
        ))}
      </ul>
      <p className="mt-4 font-mono text-[10px] leading-relaxed tracking-[0.14em] text-mute">
        <span className="text-phosphor/80">CYAN</span> NORMAL STRUCTURE · <span className="text-infra">PINK</span> RISK OR RELATIONSHIP INDICATOR · NO SAFETY SCORE
      </p>
    </div>
  );
}

function CountUp({ to, decimals, prefix = "", suffix = "", final }: { to: number; decimals: number; prefix?: string; suffix?: string; final: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 1 });
  useEffect(() => {
    const el = ref.current;
    if (!inView || !el) return;
    const controls = animate(0, to, {
      duration: 1.6,
      ease: EASE,
      onUpdate: (v) => (el.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`),
      onComplete: () => (el.textContent = final),
    });
    return () => controls.stop();
  }, [inView, to, decimals, prefix, suffix, final]);
  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {(0).toFixed(decimals)}
      {suffix}
    </span>
  );
}

/* --------------------------- Questions --------------------------- */

function Questions() {
  return (
    <div className="mx-auto grid max-w-[1440px] gap-10 border-t border-white/[0.06] pt-20 sm:pt-28 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
      <div>
        <div className="font-mono text-[11px] tracking-scan text-phosphor/80">A TOKEN SCANNER</div>
        <p className="mt-5 max-w-[40ch] text-[15px] leading-relaxed text-bone/60">
          X-RAY examines the token, not a wallet. Wallets only appear as evidence inside it. Every scan works through the same questions.
        </p>
      </div>
      <ol className="border-t border-white/[0.07]">
        {QUESTIONS.map(([q, organ], i) => (
          <motion.li
            key={q}
            className="grid grid-cols-[34px_minmax(0,1fr)] items-baseline gap-x-4 border-b border-white/[0.07] py-3.5 sm:grid-cols-[34px_minmax(0,1fr)_120px]"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.8 }}
            transition={{ delay: i * 0.08, duration: 0.7 }}
          >
            <span className="font-mono text-[10px] tracking-[0.2em] text-mute">Q{String(i + 1).padStart(2, "0")}</span>
            <span className="font-display text-[clamp(15px,1.5vw,20px)] font-bold tracking-[0.02em] text-bone">{q}</span>
            <span className={`col-start-2 font-mono text-[10px] tracking-[0.2em] sm:col-start-3 sm:text-right ${organ === "MASS" ? "text-infra" : "text-phosphor/70"}`}>{organ}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------- Summary strip ------------------------- */

function SummaryStrip({ onScanCta, reduced }: { onScanCta: () => void; reduced: boolean }) {
  const lines = ["ONE ADDRESS.", "MULTIPLE DATA SOURCES.", "ONE RADIOGRAPH."];
  return (
    <div className="mx-auto max-w-[1440px] pb-28 pt-24 sm:pb-36 sm:pt-32">
      <motion.h3
        className="font-display font-bold leading-[0.95] tracking-[-0.01em] text-bone"
        style={{ fontSize: "clamp(30px, 4.6vw, 76px)" }}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
      >
        {lines.map((line, i) => (
          <span key={line} className="block overflow-hidden pb-[0.06em]">
            <motion.span
              className={`block ${i === 1 ? "outline-text" : ""}`}
              variants={{ hidden: { y: "105%" }, show: { y: "0%" } }}
              transition={{ duration: 1.2, delay: 0.1 + i * 0.14, ease: EASE }}
            >
              {line}
            </motion.span>
          </span>
        ))}
      </motion.h3>

      <div className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-6">
        <div className="flex gap-6 font-mono text-[12px] tracking-scan text-phosphor/80">
          <span>OBSERVE.</span>
          <span>TRACE.</span>
          <span>VERIFY.</span>
        </div>
        <button type="button" onClick={onScanCta} className="scan-button inline-flex h-[54px] items-center gap-3 rounded-[2px] px-7 font-display text-[12px] font-bold tracking-[0.26em]">
          SCAN A TOKEN <span aria-hidden>→</span>
        </button>
      </div>

      <div className="mt-14 flex flex-col gap-4 border-t border-white/[0.06] pt-5 font-mono text-[10px] tracking-[0.2em] text-mute sm:flex-row sm:items-start sm:gap-10">
        <span className="flex items-center gap-3 text-bone/60">
          <Waveform reduced={reduced} />
          LIVE DATA SOURCES
        </span>
        {SOURCES.map(([name, role]) => (
          <span key={name} className="flex flex-col gap-1">
            <span className="text-bone/70">{name}</span>
            <span>{role}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Waveform({ reduced }: { reduced: boolean }) {
  const d = "M0 6 L4 6 L6 2 L8 10 L10 4 L12 8 L14 6 L22 6 L24 3 L26 9 L28 6 L36 6";
  return (
    <svg width="36" height="12" viewBox="0 0 36 12" aria-hidden className="text-phosphor">
      <path d={d} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth="1" />
      {!reduced && <path d={d} fill="none" stroke="currentColor" strokeWidth="1" className="wave-trace" pathLength={100} />}
    </svg>
  );
}
