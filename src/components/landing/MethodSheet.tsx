"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

const INDICATORS = [
  ["Shared funding source", "Wallets whose first gas came from the same non-exchange wallet. Exchange hot wallets are excluded because thousands of unrelated users withdraw from them."],
  ["Coordinated timing", "Three or more linked wallets making their first buy inside a 60 second window."],
  ["Deployer links", "Wallets funded by the deployer or sent tokens by it."],
  ["Wallet-to-wallet transfers", "Direct token transfers between holders, outside of swaps."],
  ["Concentrated supply", "The combined share of supply held by a connected group."],
] as const;

export function MethodSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end bg-black/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="method-title"
            className="glass m-3 flex w-full max-w-[440px] flex-col overflow-y-auto rounded-[3px] p-6 sm:m-4"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="method-title" className="font-mono text-[11px] tracking-scan text-phosphor">METHOD</h2>
              <button type="button" onClick={onClose} className="font-mono text-[11px] tracking-[0.2em] text-mute hover:text-bone">
                CLOSE
              </button>
            </div>
            <p className="mt-5 text-[15px] leading-relaxed text-bone/80">
              A scan reads holders, funding history, transfers and trades, then links wallets that look connected. Each link
              is an observable on-chain relationship. None of them says who controls a wallet or why it acted.
            </p>
            <ul className="mt-6 flex flex-col">
              {INDICATORS.map(([title, body]) => (
                <li key={title} className="border-t border-white/[0.06] py-4">
                  <div className="text-[13px] font-semibold text-bone">{title}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-bone/60">{body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-2 border-t border-white/[0.06] pt-4 font-mono text-[11px] leading-relaxed text-mute">
              This prototype runs on simulated chain data. Live Solana and EVM sources plug in through the adapter layer.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
