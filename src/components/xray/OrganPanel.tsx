"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { caseFileText } from "@/lib/analysis/caseFile";
import { explainFinding } from "@/lib/analysis/plainEnglish";
import * as d from "@/lib/display";
import type { Coverage, Finding, ScanResult, StatusFlag } from "@/lib/types/scan";
import type { FocusKey } from "./renderer";
import { QuickRead, VerdictScale, VerdictTrace } from "./Vitals";

const TONE: Record<StatusFlag["tone"], string> = { anomaly: "var(--infra)", watch: "var(--amber)", neutral: "var(--phosphor)" };
const VERDICT_COLOR: Record<ScanResult["caseFile"]["verdict"]["level"], string> = {
  SERIOUS_RED_FLAGS: "var(--infra)",
  SOME_RED_FLAGS: "var(--amber)",
  FEW_RED_FLAGS: "var(--phosphor)",
  NOT_ENOUGH_DATA: "rgba(216,230,242,0.6)",
};

type Tone = "anomaly" | "watch" | "ok" | "muted" | undefined;
interface Row {
  label: string;
  value: string;
  tone?: Tone;
  title?: string;
  /** What the readout means, in plain English. */
  hint?: string;
}
interface Section {
  organ: Finding["organ"];
  meaning: string;
  /** The section's question, in plain English. */
  plain: string;
  focus: FocusKey;
  source: string;
  rows: Row[];
}

const toneClass = (t: Tone, value: string) =>
  t === "anomaly" ? "text-infra" : t === "watch" ? "text-amber" : t === "ok" ? "text-phosphor" : value === d.DASH || /NOT ENABLED|NOT CONFIGURED|INSUFFICIENT|UNKNOWN/.test(value) ? "text-mute" : "text-bone";

const EVIDENCE: Record<string, string> = {
  FIRST_TRANSACTION_SIGNER: "FIRST TX SIGNER",
  MINT_AUTHORITY: "MINT AUTHORITY",
  UPDATE_AUTHORITY: "UPDATE AUTHORITY",
  METADATA_CREATOR: "METADATA CREATOR",
};

const COVERAGE_LABEL: Record<keyof Coverage, string> = {
  market: "MARKET",
  security: "SECURITY",
  genome: "GENOME",
  liquidity: "LIQUIDITY",
  holders: "HOLDERS",
  origin: "ORIGIN",
  transactions: "FLOW",
  walletGraph: "GRAPH",
  fundingAnalysis: "FUNDING",
  walletIdentity: "IDENTITY",
};

function sections(r: ScanResult): Section[] {
  const deep = r.mass.heliusEnhanced || r.mode === "demo";
  const deepLabel = r.sources.some((s) => s.provider === "helius" && s.status === "not_configured") ? "HELIUS NOT CONFIGURED" : "UNAVAILABLE";
  const need = (v: string) => (v === d.DASH && !deep ? deepLabel : v);
  const lb = (k: "top1" | "top5" | "top10" | "top20") => ({ lowerBound: r.cells.lowerBounds.includes(k) });
  const auth = (v: boolean | null) => d.authority(v, deep ? "UNKNOWN" : "INSUFFICIENT DATA");
  const authTone = (v: boolean | null): Tone => (v === true ? "anomaly" : v === false ? "ok" : undefined);
  const g = r.genome;
  const h = r.heart;
  const b = r.brain;
  const c = r.cells;
  const f = r.bloodstream;
  const m = r.mass;
  const src = (base: string, deepSrc?: string) => (r.mode === "demo" ? "DEMO DATA" : deep && deepSrc ? `${base} + ${deepSrc}` : base);

  return [
    {
      organ: "GENOME",
      meaning: "Token configuration",
      plain: "The token's rulebook: who can print, freeze or change it.",
      focus: null,
      source: src("GOPLUS", "HELIUS"),
      rows: [
        { label: "Mint authority", value: auth(g.mintAuthorityActive), tone: authTone(g.mintAuthorityActive), title: g.mintAuthority ?? undefined, hint: g.mintAuthorityActive === true ? "Someone can still print new tokens." : g.mintAuthorityActive === false ? "Nobody can print new tokens." : "Who can create new tokens." },
        { label: "Freeze authority", value: auth(g.freezeAuthorityActive), tone: authTone(g.freezeAuthorityActive), title: g.freezeAuthority ?? undefined, hint: g.freezeAuthorityActive === true ? "Someone can freeze holders' tokens." : g.freezeAuthorityActive === false ? "Nobody can freeze your tokens." : "Who can freeze tokens." },
        { label: "Token program", value: g.tokenProgram ?? (deep ? "UNKNOWN" : deepLabel), hint: "The Solana program that runs this token." },
        { label: "Token-2022", value: g.token2022 === null ? (deep ? "UNKNOWN" : "INSUFFICIENT DATA") : g.token2022 ? "YES" : "NO", hint: "Newer program that allows extra built-in rules." },
        { label: "Transfer hook", value: d.yesNo(g.transferHook), tone: g.transferHook ? "anomaly" : undefined, hint: "Custom code run on every transfer. Can block sells." },
        { label: "Transfer fee", value: d.yesNo(g.transferFee), tone: g.transferFee ? "watch" : undefined, hint: "A cut taken on every transfer." },
        { label: "Default account state", value: g.defaultAccountState ?? "UNKNOWN", tone: g.defaultAccountState === "FROZEN" ? "anomaly" : undefined, hint: "Whether new holders start frozen." },
        { label: "Metadata", value: g.metadataMutable === null ? "UNKNOWN" : g.metadataMutable ? "MUTABLE" : "IMMUTABLE", tone: g.metadataMutable ? "watch" : undefined, hint: g.metadataMutable ? "Name, symbol and image can still change." : g.metadataMutable === false ? "Name, symbol and image are locked." : "Whether name and image can change." },
        { label: "Update authority", value: d.short(g.updateAuthority), title: g.updateAuthority ?? undefined, hint: "Wallet allowed to edit name and image." },
        { label: "Total supply", value: d.amount(g.supply), hint: "How many tokens exist." },
        { label: "Decimals", value: g.decimals === null ? need(d.DASH) : String(g.decimals), hint: "How finely one token can be split." },
        { label: "Extensions", value: g.extensions === null ? (deep ? "UNKNOWN" : deepLabel) : g.extensions.length ? g.extensions.join(", ").toUpperCase() : "NONE", hint: "Extra Token-2022 rules switched on." },
      ],
    },
    {
      organ: "HEART",
      meaning: "Liquidity",
      plain: "How much money sits in the pool you would sell into.",
      focus: "liquidity",
      source: src("DEXSCREENER + GOPLUS"),
      rows: [
        { label: "Liquidity", value: d.usd(h.liquidityUsd), tone: r.caseFile.flags.some((x) => x.code === "LOW_LIQUIDITY") ? "watch" : undefined, hint: "Money in the pool you would sell into." },
        { label: "24H volume", value: d.usd(h.volume24h), hint: "Traded in the last 24 hours." },
        { label: "Primary pool", value: h.primaryPool ?? d.DASH, hint: "The main place it trades." },
        { label: "Pool address", value: d.short(h.poolAddress), title: h.poolAddress ?? undefined, hint: "The pool's on-chain address." },
        { label: "Pair age", value: d.age(h.poolAgeSeconds), hint: "How long the pool has existed." },
        { label: "Price", value: d.price(r.token.priceUsd), hint: "Price of one token." },
        { label: "Market cap", value: d.usd(r.token.marketCap, true), hint: "Price times circulating supply." },
        { label: "FDV", value: d.usd(r.token.fdv, true), hint: "Price times total supply." },
        { label: "Liq / mcap", value: h.liquidityMarketCapRatio === null ? d.DASH : d.pct(h.liquidityMarketCapRatio * 100), hint: "Pool size against market cap. Higher is sturdier." },
        { label: "LP status", value: h.lpStatus?.label ?? d.DASH, tone: h.lpStatus?.label === "LP BURNED" || h.lpStatus?.label === "LP LOCKED" ? "ok" : undefined, hint: h.lpStatus?.label === "LP BURNED" ? "Liquidity can't be pulled." : h.lpStatus?.label === "LP LOCKED" ? "Liquidity is locked for now." : "Whether pool liquidity can be pulled." },
        { label: "Pairs", value: d.int(h.pairCount), hint: "Number of trading pools." },
      ],
    },
    {
      organ: "BRAIN",
      meaning: "Origin / creator",
      plain: "The wallet that launched the token, and what it is doing now.",
      focus: "creator",
      source: src("GOPLUS", "HELIUS"),
      rows: [
        { label: "Origin address", value: d.short(b.originAddress, 5, 5), title: b.originAddress ?? undefined, hint: "The wallet behind the token's first transaction." },
        { label: "Label", value: b.originLabel ?? d.DASH, hint: "The role that wallet played." },
        { label: "Evidence", value: b.originEvidence ? `${EVIDENCE[b.originEvidence]} · ${b.originConfidence?.toUpperCase()}` : d.DASH, hint: "How the launch wallet was identified." },
        { label: "Mint authority", value: b.mintAuthority ? d.short(b.mintAuthority) : g.mintAuthorityActive === false ? "REVOKED" : d.DASH, title: b.mintAuthority ?? undefined, hint: "Wallet holding the print key." },
        { label: "Freeze authority", value: b.freezeAuthority ? d.short(b.freezeAuthority) : g.freezeAuthorityActive === false ? "REVOKED" : d.DASH, title: b.freezeAuthority ?? undefined, hint: "Wallet holding the freeze key." },
        { label: "Origin balance", value: need(d.amount(b.originTokenBalance)), hint: "Tokens the launch wallet holds now." },
        { label: "Origin supply share", value: d.pct(b.originSupplyPercent), hint: "Its share of all tokens." },
        { label: "Origin movements", value: need(d.int(b.originMovements)), hint: "Times it moved tokens recently." },
        { label: "Related tokens", value: need(d.int(b.priorDeployments)), hint: "Other tokens the same wallet controls." },
      ],
    },
    {
      organ: "CELLS",
      meaning: "Holder structure",
      plain: "Who owns the supply, and how spread out it is.",
      focus: "concentration",
      source: src("GOPLUS", "HELIUS"),
      rows: [
        { label: "Holders", value: c.holderCount === null ? "INSUFFICIENT DATA" : d.int(c.holderCount), hint: "Wallets holding any amount." },
        { label: "Total supply", value: d.amount(c.totalSupply), hint: "How many tokens exist." },
        { label: "Top holder share", value: d.pct(c.top1Percent, 1, lb("top1")), tone: (c.top1Percent ?? 0) > 15 ? "watch" : undefined, hint: "The single biggest wallet." },
        { label: "Top 5 share", value: d.pct(c.top5Percent, 1, lb("top5")), hint: "The five biggest wallets together." },
        { label: "Top 10 share", value: d.pct(c.top10Percent, 1, lb("top10")), tone: (c.top10Percent ?? 0) > 40 ? "watch" : undefined, hint: "The ten biggest wallets together." },
        { label: "Top 20 share", value: d.pct(c.top20Percent, 1, lb("top20")), hint: "The twenty biggest wallets together." },
        { label: "Origin share", value: d.pct(c.originSharePercent), hint: "Held by the launch wallet." },
        { label: "Cluster share", value: m.heliusEnhanced ? d.pct(c.clusterSharePercent) : need(d.DASH), tone: c.clusterSharePercent ? "anomaly" : undefined, hint: "Held by wallets that look connected." },
        { label: "Largest non-pool", value: c.largestNonPoolHolder ? d.short(c.largestNonPoolHolder.address) : d.DASH, title: c.largestNonPoolHolder?.address, hint: "Biggest wallet that isn't a pool." },
        { label: "Fresh wallet share", value: need(d.pct(c.freshWalletSharePercent)), hint: "Held by brand-new wallets." },
        { label: "Basis", value: r.mode === "demo" ? "DEMO" : c.holderSetSize ? `TOP ${c.holderSetSize} · POOLS EXCLUDED` : d.DASH, hint: "Which wallets these figures cover." },
      ],
    },
    {
      organ: "BLOODSTREAM",
      meaning: "Market flow",
      plain: "Money moving in and out: buys, sells and big transfers.",
      focus: "flow",
      source: src("DEXSCREENER", "HELIUS"),
      rows: [
        { label: "24H buys / sells", value: `${d.int(f.buys24h)} / ${d.int(f.sells24h)}`, hint: "Number of trades today." },
        { label: "24H volume", value: d.usd(f.volume24h), hint: "Traded in the last 24 hours." },
        { label: "Buy / sell ratio", value: d.ratio(f.buySellRatio), hint: "Above 1 means more buying than selling." },
        { label: "1H buys / sells", value: `${d.int(f.buys1h)} / ${d.int(f.sells1h)}`, hint: "Number of trades this hour." },
        { label: "Price 1H / 24H", value: `${d.pct(f.priceChange1h, 1, { sign: true })} / ${d.pct(f.priceChange24h, 1, { sign: true })}`, hint: "How the price moved." },
        { label: "Major movements", value: f.movementsTraced ? String(f.majorMovements.length) : deepLabel, hint: "Big chunks of supply that changed hands." },
        ...f.majorMovements.slice(0, 4).map((mv) => ({
          label: `${mv.kind}${mv.actor ? ` · ${mv.actor.replace("_", " ")}` : ""}`,
          value: d.pct(mv.supplyPercent),
          tone: (mv.actor === "ORIGIN" || mv.actor === "CLUSTER" ? "watch" : undefined) as Tone,
          title: mv.signature,
          hint: "Share of supply moved in one transaction.",
        })),
      ],
    },
    {
      organ: "MASS",
      meaning: "Connected holder clusters",
      plain: "Whether the biggest holders are connected to each other.",
      focus: "cluster",
      source: m.heliusEnhanced ? src("HELIUS") : deepLabel,
      rows: [
        { label: "Mode", value: m.heliusEnhanced ? "HELIUS ENHANCED" : "BASE MODE", tone: m.heliusEnhanced ? "ok" : undefined, hint: "Whether deep wallet tracing ran." },
        { label: "Wallets traced", value: m.heliusEnhanced ? String(m.analyzedWallets) : "NOT ENABLED", hint: "Top holders checked for links." },
        { label: "Clusters", value: m.graphState === "NOT_ENABLED" ? "NOT ENABLED" : m.graphState === "INSUFFICIENT_GRAPH_DATA" ? "INSUFFICIENT GRAPH DATA" : String(m.clusters.length), tone: m.clusters.length ? "anomaly" : undefined, hint: "Groups of wallets that look connected." },
        ...m.clusters.slice(0, 3).map((cl) => ({ label: cl.id, value: `${cl.wallets.length} wallets · ${d.pct(cl.combinedSupplyPercent)}`, tone: "anomaly" as Tone, hint: "Wallets in this group, and what they hold together." })),
        {
          label: "Relationship signal",
          value: m.relationshipSignal === null ? (m.heliusEnhanced ? "INSUFFICIENT GRAPH DATA" : "NOT ENABLED") : String(m.relationshipSignal),
          tone: (m.relationshipSignal ?? 0) >= 60 ? "anomaly" : undefined,
          hint: "0 to 100: how strong the links between holders are.",
        },
      ],
    },
  ];
}

interface Props {
  result: ScanResult;
  focus: FocusKey;
  onFocus: (key: FocusKey) => void;
  delay: number;
  /** Show the plain-English line under each readout. */
  plain: boolean;
  onPlain: (on: boolean) => void;
}

export function OrganPanel({ result, focus, onFocus, delay, plain, onPlain }: Props) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const head = result.caseFile.flags[0];
  const covered = Object.values(result.coverage).filter(Boolean).length;
  const total = Object.keys(result.coverage).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(caseFileText(result));
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied("idle"), 1800);
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
      className="glass flex min-h-0 flex-col rounded-[3px]"
      aria-label="Case file readout"
    >
      <div className="flex items-center justify-between gap-3 whitespace-nowrap border-b border-white/[0.06] px-5 py-2.5 font-mono text-[10px] tracking-[0.2em] text-mute">
        <span>CASE {result.caseFile.id}</span>
        <span className="flex items-center gap-3.5">
          <button
            type="button"
            role="switch"
            aria-checked={plain}
            onClick={() => onPlain(!plain)}
            title="Explain each readout in plain English"
            className={`flex items-center gap-1.5 tracking-[0.16em] transition-colors ${plain ? "text-phosphor" : "text-mute hover:text-bone"}`}
          >
            <span className={`relative h-2.5 w-[18px] rounded-full border transition-colors ${plain ? "border-phosphor/60" : "border-white/20"}`}>
              <span className={`absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full transition-all ${plain ? "left-[9px] bg-phosphor" : "left-[1px] bg-mute"}`} />
            </span>
            EXPLAIN
          </button>
          <span>{result.mode === "demo" ? "DEMO" : result.mode === "partial" ? "PARTIAL" : "LIVE"}</span>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <header className="border-b border-white/[0.06] px-5 pb-4 pt-4">
          <div className="font-mono text-[10px] tracking-[0.2em] text-mute">VERDICT</div>
          <div className="mt-1 font-display text-[19px] font-bold uppercase leading-tight" style={{ color: VERDICT_COLOR[result.caseFile.verdict.level] }}>
            {result.caseFile.verdict.label}
          </div>
          <VerdictScale level={result.caseFile.verdict.level} delay={delay} />
          <VerdictTrace level={result.caseFile.verdict.level} />
          <p className="mt-2 text-[12.5px] leading-snug text-bone/70">{result.caseFile.verdict.summary}</p>
        </header>

        <QuickRead result={result} plain={plain} delay={delay} />

        <section className="border-b border-white/[0.05] px-5 py-3.5">
          <div className="font-mono text-[10px] tracking-[0.2em] text-mute">STATUS</div>
          <div className="mt-1 font-display text-[15px] font-bold uppercase leading-tight" style={{ color: TONE[head?.tone ?? "neutral"] }}>
            {result.caseFile.status}
          </div>
          {head?.detail && <p className="mt-1.5 text-[12px] leading-snug text-bone/60">{head.detail}</p>}
          {result.caseFile.flags.length > 1 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {result.caseFile.flags.slice(1).map((f) => (
                <li key={f.code} title={f.detail} className="rounded-[2px] border px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.14em]" style={{ color: TONE[f.tone], borderColor: "rgba(216,230,242,0.1)" }}>
                  {f.label}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex items-center gap-3 font-mono text-[10px] tracking-[0.16em] text-mute">
            <span>COVERAGE {covered}/{total}</span>
            <span className="flex flex-1 gap-[3px]" aria-hidden>
              {(Object.keys(result.coverage) as (keyof Coverage)[]).map((k) => (
                <span key={k} title={`${COVERAGE_LABEL[k]}: ${result.coverage[k] ? "observed" : "not observed"}`} className="h-1.5 flex-1" style={{ background: result.coverage[k] ? "var(--phosphor)" : "rgba(216,230,242,0.1)" }} />
              ))}
            </span>
          </div>
          {plain && <p className="mt-1.5 text-[11px] leading-snug text-bone/45">How much of the full checkup could be read for this token.</p>}
        </section>

        {sections(result).map((s) => (
          <section
            key={s.organ}
            className={`border-b border-white/[0.05] px-5 py-3.5 transition-colors ${focus && focus === s.focus ? "bg-white/[0.035]" : ""}`}
            onMouseEnter={() => onFocus(s.focus)}
            onMouseLeave={() => onFocus(null)}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className={`font-mono text-[11px] tracking-[0.24em] ${s.organ === "MASS" ? "text-infra" : "text-phosphor/90"}`}>{s.organ}</span>
              <span className="font-mono text-[9.5px] tracking-[0.16em] text-mute">{s.source}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-mute">{s.meaning}</div>
            {plain && <p className="mt-1 text-[12px] leading-snug text-bone/75">{s.plain}</p>}
            <dl className={`mt-2.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 font-mono text-[11.5px] ${plain ? "gap-y-2" : "gap-y-1"}`}>
              {s.rows.map((row, i) => (
                <div key={`${row.label}-${i}`} className="contents">
                  <dt className="min-w-0 text-bone/60">
                    <span className="block truncate">{row.label}</span>
                    {plain && row.hint && <span className="mt-0.5 block font-sans text-[11px] leading-snug text-bone/40">{row.hint}</span>}
                  </dt>
                  <dd className={`text-right tabular-nums ${toneClass(row.tone, row.value)}`} title={row.title}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            {result.findings.some((x) => x.organ === s.organ) && (
              <ul className="mt-2.5 space-y-1 border-t border-white/[0.05] pt-2 font-mono text-[10px] leading-snug tracking-[0.08em]">
                {result.findings
                  .filter((x) => x.organ === s.organ)
                  .map((x, i) => (
                    <li key={`${x.code}-${i}`} style={{ color: x.tone === "neutral" ? "rgba(216,230,242,0.55)" : TONE[x.tone] }}>
                      {x.label}
                      {plain && explainFinding(x) && <span className="mt-0.5 block font-sans text-[11px] leading-snug tracking-normal text-bone/45">{explainFinding(x)}</span>}
                    </li>
                  ))}
              </ul>
            )}
          </section>
        ))}

        {result.sources.length > 0 && (
          <section className="px-5 py-3.5">
            <div className="font-mono text-[11px] tracking-[0.24em] text-mute">SOURCES</div>
            <ul className="mt-2 space-y-1 font-mono text-[10.5px]">
              {result.sources.map((s) => (
                <li key={`${s.provider}-${s.scope}`} className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.status === "ok" ? "bg-phosphor" : s.status === "error" ? "bg-amber" : "bg-mute"}`} />
                  <span className="text-bone/70">{s.provider.toUpperCase()}</span>
                  <span className="text-mute">{s.scope}</span>
                  <span className="ml-auto text-mute">
                    {s.status === "ok" ? `LIVE${s.fetchedAt ? ` · ${s.cached ? "cached " : ""}${s.fetchedAt.slice(11, 19)}Z` : ""}` : s.status === "not_configured" ? (s.note ?? "not configured").toUpperCase() : s.status === "empty" ? "NO DATA" : `FAILED${s.note ? ` · ${s.note}` : ""}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="border-t border-white/[0.06] px-5 py-3">
        <button
          type="button"
          onClick={copy}
          className="flex h-[40px] w-full items-center justify-center rounded-[2px] border border-white/15 font-mono text-[11px] tracking-[0.24em] text-bone transition hover:border-phosphor/60 hover:text-phosphor"
          aria-live="polite"
        >
          {copied === "ok" ? "CASE FILE COPIED" : copied === "fail" ? "COPY BLOCKED" : "COPY CASE FILE"}
        </button>
        {copied === "fail" && <pre className="mt-3 max-h-40 overflow-auto whitespace-pre border border-white/[0.07] p-3 font-mono text-[10px] text-bone/70 select-all">{caseFileText(result)}</pre>}
        <p className="mt-2.5 font-mono text-[10px] leading-relaxed text-mute">Observations from public chain data. Not financial advice and not a judgement of any wallet.</p>
      </footer>
    </motion.aside>
  );
}
