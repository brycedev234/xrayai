"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FeedInfo, FeedSource, FeedState } from "@/lib/client/scanClient";

const LABEL: Record<FeedState, string> = {
  live: "LIVE FEED",
  partial: "PARTIAL FEED",
  simulated: "SIMULATED FEED",
  checking: "CHECKING FEED",
};

const SOURCE_TONE: Record<FeedSource["state"], { dot: string; text: string; word: string }> = {
  up: { dot: "bg-phosphor", text: "text-phosphor", word: "LIVE" },
  down: { dot: "bg-infra", text: "text-infra", word: "DOWN" },
  off: { dot: "bg-amber", text: "text-amber", word: "OFF" },
};

const clock = (t: number) => new Date(t).toISOString().slice(11, 19) + " UTC";

/**
 * Feed indicator. LIVE only when the backend actually returned live data.
 * Opens a readout of each provider's state; with `recheck` it can re-probe.
 */
export function FeedPill({
  info,
  className = "",
  align = "right",
  side = "below",
}: {
  info: FeedInfo;
  className?: string;
  align?: "left" | "right";
  side?: "below" | "above";
}) {
  const { state } = info;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const dot = state === "live" ? "bg-phosphor" : state === "partial" ? "bg-amber" : state === "checking" ? "bg-mute" : "bg-phosphor/60";
  const tone = state === "live" ? "border-phosphor/30 text-phosphor hover:border-phosphor/60" : state === "partial" ? "border-amber/30 text-amber hover:border-amber/60" : "border-white/10 text-mute hover:border-white/25 hover:text-bone";

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        title="Data sources"
        className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 font-mono text-[10px] tracking-[0.2em] transition-colors ${tone}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dot} ${state === "checking" ? "" : "blink"}`} />
        {LABEL[state]}
        <svg aria-hidden viewBox="0 0 8 5" className={`h-[5px] w-2 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M.5.5 4 4 7.5.5" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Data sources"
          className={`absolute z-50 ${side === "below" ? "top-full mt-2" : "bottom-full mb-2"} w-[min(300px,calc(100vw-2rem))] rounded-[2px] border border-white/10 bg-[#05080d] p-4 font-mono text-[10px] tracking-[0.16em] text-mute shadow-[0_18px_48px_rgba(0,0,0,0.6)] backdrop-blur ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-bone">SIGNAL SOURCES</span>
            {info.checkedAt !== null && <span>{clock(info.checkedAt)}</span>}
          </div>

          {info.sources.length > 0 && (
            <ul className="mt-3 border-t border-white/[0.06]">
              {info.sources.map((s) => {
                const t = SOURCE_TONE[s.state];
                return (
                  <li key={s.provider} className="border-b border-white/[0.06] py-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} />
                      <span className="text-bone">{s.provider.toUpperCase()}</span>
                      <span className={`ml-auto ${t.text}`}>{t.word}</span>
                    </div>
                    <div className="mt-1 pl-3.5 text-[9.5px] tracking-[0.14em]">{s.detail}</div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-3 normal-case leading-[1.6] tracking-[0.04em] text-bone/70">{info.note}</p>

          {info.recheck && (
            <button
              type="button"
              onClick={info.recheck}
              disabled={state === "checking"}
              className="mt-3 text-phosphor transition-colors hover:text-bone disabled:text-mute"
            >
              [ {state === "checking" ? "CHECKING…" : "RECHECK"} ]
            </button>
          )}
        </div>
      )}
    </div>
  );
}
