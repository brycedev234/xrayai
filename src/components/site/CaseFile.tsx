"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { demoScanResult } from "@/data/demoScanResult";
import { caseFileSections, caseFileText } from "@/lib/analysis/caseFile";
import * as fmt from "@/lib/display";
import { EASE, SectionHead } from "./SectionHead";

function Row({ label, value, anomaly, i }: { label: string; value: string; anomaly?: boolean; i: number }) {
  return (
    <motion.div
      className="flex items-baseline gap-2 py-[3px]"
      variants={{ hidden: { opacity: 0, clipPath: "inset(0 100% 0 0)" }, show: { opacity: 1, clipPath: "inset(0 0% 0 0)" } }}
      transition={{ duration: 0.7, delay: 0.25 + i * 0.07, ease: EASE }}
    >
      <span className="shrink-0 text-bone/70">{label}</span>
      <span className="leader min-w-[24px] flex-1" aria-hidden />
      <span className={`shrink-0 tabular-nums ${anomaly ? "text-infra" : "text-phosphor"}`}>{value}</span>
    </motion.div>
  );
}

export function CaseFile({ onOpen }: { onOpen: () => void }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  // Design example: the labelled demo ScanResult run through the same case-file generator live scans use.
  const d = demoScanResult();
  const sections = caseFileSections(d);
  let row = 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(caseFileText(d));
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied("idle"), 1800);
  };

  return (
    <section id="case-file" className="relative px-4 pt-28 sm:px-8 sm:pt-40">
      <div className="mx-auto max-w-[1440px]">
        <SectionHead eyebrow="SCAN OUTPUT / 05" lines={["EVERY SCAN", "LEAVES A CASE FILE."]} />

        <div className="mt-16 grid grid-cols-1 items-start gap-10 lg:grid-cols-[220px_minmax(0,680px)_minmax(0,1fr)] lg:gap-14">
          <motion.dl
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1 }}
            className="grid grid-cols-2 gap-x-6 gap-y-5 font-mono text-[11px] lg:grid-cols-1"
          >
            {[
              ["SCAN", "DESIGN EXAMPLE"],
              ["CASE ID", d.caseFile.id],
              ["NETWORK", "SOLANA"],
              ["FEED", "SIMULATED"],
            ].map(([k, v]) => (
              <div key={k} className="border-l border-white/[0.08] pl-4">
                <dt className="tracking-[0.22em] text-mute">{k}</dt>
                <dd className="mt-1.5 text-bone">{v}</dd>
              </div>
            ))}
          </motion.dl>

          <div className="min-w-0">
            <motion.article
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.2 }}
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 1.1, ease: EASE }}
              className="case-file relative overflow-hidden border border-phosphor/15 bg-[rgba(6,10,18,0.72)] font-mono text-[12.5px] leading-[1.75] sm:text-[13.5px]"
              aria-label={`Case file ${d.caseFile.id}`}
            >
              <div className="case-file__scan" aria-hidden />
              <header className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3 text-[10px] tracking-[0.24em] text-mute sm:px-7">
                <span>ONCHAIN X-RAY · CASE FILE</span>
                <span className="case-file__ticks" aria-hidden />
              </header>

              <div className="px-5 pb-6 pt-5 sm:px-7">
                <div className="grid grid-cols-[72px_1fr] gap-y-0.5 text-bone">
                  <span className="text-mute">CASE</span>
                  <span>{d.caseFile.id}</span>
                  <span className="text-mute">CHAIN</span>
                  <span>SOLANA</span>
                  <span className="text-mute">AGE</span>
                  <span>{fmt.age(d.token.ageSeconds)}</span>
                </div>

                {sections.map((s) => (
                  <div key={s.organ} className="mt-5">
                    <div className={`flex items-center gap-3 text-[11px] tracking-[0.26em] ${s.anomaly ? "text-infra" : "text-bone"}`}>
                      {s.organ}
                      <span className="h-px flex-1 bg-white/[0.06]" />
                    </div>
                    <div className="mt-1.5">
                      {s.rows.map((r) => (
                        <Row key={r.label} {...r} i={row++} />
                      ))}
                    </div>
                  </div>
                ))}

                <motion.div
                  variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
                  transition={{ duration: 0.8, delay: 1.4 }}
                  className="status-block mt-7 border border-infra/40 px-4 py-4"
                >
                  <div className="text-[10px] tracking-[0.26em] text-mute">STATUS</div>
                  <div className="mt-1.5 font-display text-[clamp(15px,1.8vw,21px)] font-bold leading-tight tracking-[0.04em] text-infra">
                    {d.caseFile.status}
                    <span className="cursor ml-1.5 inline-block h-[0.9em] w-[0.5em] translate-y-[0.12em] bg-infra" aria-hidden />
                  </div>
                </motion.div>
              </div>
            </motion.article>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onOpen}
                className="scan-button inline-flex h-[52px] items-center gap-3 rounded-[2px] px-6 font-display text-[11px] font-bold tracking-[0.26em]"
              >
                OPEN RADIOGRAPH <span aria-hidden>→</span>
              </button>
              <button
                type="button"
                onClick={copy}
                className="inline-flex h-[52px] min-w-[200px] items-center justify-center rounded-[2px] border border-white/15 px-6 font-mono text-[11px] tracking-[0.24em] text-bone transition hover:border-phosphor/60 hover:text-phosphor"
                aria-live="polite"
              >
                {copied === "ok" ? "CASE FILE COPIED" : copied === "fail" ? "COPY BLOCKED" : "COPY CASE FILE"}
              </button>
            </div>
            {copied === "fail" && (
              <pre className="mt-4 overflow-x-auto whitespace-pre border border-white/[0.07] p-4 font-mono text-[11px] text-bone/70 select-all">
                {caseFileText(d)}
              </pre>
            )}
          </div>

          <p className="hidden max-w-[28ch] self-end font-mono text-[11px] leading-relaxed text-mute lg:block">
            Built to be posted. Values above are a design example; a live case file carries only what the scan returned, with — where a value could not be read.
          </p>
        </div>
      </div>
    </section>
  );
}
