"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import type { ClientScanError } from "@/lib/client/scanClient";
import { detectAddressKind } from "@/lib/validation/address";
import { checkAddress, ScanErrorLine } from "../landing/scanInput";
import { EASE } from "./SectionHead";

interface Props {
  onScan: (address: string) => void;
  error: ClientScanError | null;
  onClearError: () => void;
}

export function FinalScanCTA({ onScan, error: externalError, onClearError }: Props) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const kind = detectAddressKind(value);
  const shown = error ?? externalError;

  const submit = () => {
    const problem = checkAddress(value);
    if (problem) return setError(problem);
    setError(null);
    onScan(value.trim());
  };

  return (
    <section id="scan" className="relative px-4 pb-32 pt-24 sm:px-8 sm:pb-48">
      <div className="mx-auto max-w-[1440px]">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 1 }}
          className="font-mono text-[11px] tracking-scan text-phosphor/80"
        >
          READY FOR RADIOGRAPHY?
        </motion.div>
        <motion.h2
          className="mt-6 font-display font-bold leading-[0.86] tracking-[-0.02em] text-bone"
          style={{ fontSize: "clamp(48px, 9.5vw, 156px)" }}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
        >
          {["CUT THROUGH", "THE CHART."].map((line, i) => (
            <span key={line} className="block overflow-hidden pb-[0.05em]">
              <motion.span
                className={`block ${i === 0 ? "outline-text" : "title-xray"}`}
                variants={{ hidden: { y: "105%" }, show: { y: "0%" } }}
                transition={{ duration: 1.3, delay: i * 0.15, ease: EASE }}
              >
                {line}
                {i === 1 && (
                  <span className="title-xray__lit" aria-hidden>
                    {line}
                  </span>
                )}
              </motion.span>
            </span>
          ))}
        </motion.h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="mt-14 max-w-[720px]"
        >
          <div className={`final-input glass relative flex flex-col overflow-hidden rounded-[3px] p-1.5 sm:flex-row sm:items-stretch ${focused ? "is-focused" : ""}`}>
            <label htmlFor="final-ca-input" className="relative flex min-w-0 flex-1 items-center gap-3 px-3 py-3 sm:py-0">
              <span className="font-mono text-[10px] tracking-[0.24em] text-mute">CA</span>
              <input
                id="final-ca-input"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                  if (externalError) onClearError();
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Paste Solana token mint address"
                spellCheck={false}
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent font-mono text-[14px] text-bone caret-[var(--phosphor)] placeholder:text-mute/70 focus:outline-none"
              />
              <span className={`shrink-0 font-mono text-[10px] tracking-[0.2em] ${kind === "evm" ? "text-amber" : "text-phosphor"}`}>
                {kind ? (kind === "evm" ? "EVM · NOT SUPPORTED" : "SOLANA") : focused ? <span className="blink">AWAITING CA</span> : ""}
              </span>
            </label>
            <button type="submit" className="scan-button flex h-[64px] items-center justify-center gap-3 rounded-[2px] px-9 font-display text-[13px] font-bold tracking-[0.28em]">
              SCAN TOKEN <span aria-hidden>→</span>
            </button>
            <span className="final-input__sweep" aria-hidden />
          </div>
          <div className="mt-3 flex min-h-[20px] flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
            {shown ? <ScanErrorLine error={shown} /> : <span className="tracking-[0.24em] text-mute">SOLANA · READ-ONLY · NO WALLET CONNECTION</span>}
          </div>
        </form>
      </div>
    </section>
  );
}
