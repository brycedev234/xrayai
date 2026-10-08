import type { FeedState } from "@/lib/client/scanClient";

const LABEL: Record<FeedState, string> = {
  live: "LIVE FEED",
  partial: "PARTIAL FEED",
  simulated: "SIMULATED FEED",
  checking: "CHECKING FEED",
};

/** Feed indicator. LIVE only when the backend actually returned live data. */
export function FeedPill({ state, className = "" }: { state: FeedState; className?: string }) {
  const dot = state === "live" ? "bg-phosphor" : state === "partial" ? "bg-amber" : state === "checking" ? "bg-mute" : "bg-phosphor/60";
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 font-mono text-[10px] tracking-[0.2em] ${state === "live" ? "border-phosphor/30 text-phosphor" : state === "partial" ? "border-amber/30 text-amber" : "border-white/10 text-mute"} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${state === "checking" ? "" : "blink"}`} />
      {LABEL[state]}
    </span>
  );
}
