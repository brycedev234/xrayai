"use client";

import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { demoOutcome, feedFromHealth, fetchHealth, isDemoAddress, requestScan, type ClientScanError, type FeedState } from "@/lib/client/scanClient";
import type { ScanResult } from "@/lib/types/scan";
import { AmbientField } from "./landing/AmbientField";
import { Landing, type ScanSource } from "./landing/Landing";
import { ScanSequence } from "./landing/ScanSequence";
import { RadiographView } from "./xray/RadiographView";

type Phase =
  | { kind: "idle" }
  | { kind: "scanning"; address: string; demo: boolean; result: ScanResult | null }
  | { kind: "result"; result: ScanResult };

/** Minimum time on the scanner so the sequence reads, even for cached / demo results. */
const MIN_SCAN_MS = 1800;

export function XRayApp() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<{ source: ScanSource; error: ClientScanError } | null>(null);
  const [feed, setFeed] = useState<FeedState>("checking");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    fetchHealth().then((h) => alive && setFeed(feedFromHealth(h)));
    return () => {
      alive = false;
    };
  }, []);

  const startScan = useCallback(async (address: string, source: ScanSource = "hero") => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const demo = isDemoAddress(address);
    setError(null);
    setPhase({ kind: "scanning", address, demo, result: null });
    const [outcome] = await Promise.all([
      demo ? demoOutcome() : requestScan(address, controller.signal),
      new Promise((r) => setTimeout(r, MIN_SCAN_MS)),
    ]);
    if (controller.signal.aborted) return;
    if (!outcome.ok) {
      setError({ source, error: outcome.error });
      setPhase({ kind: "idle" });
      return;
    }
    setPhase({ kind: "scanning", address, demo, result: outcome.result });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPhase({ kind: "idle" });
  }, []);

  const scanning = phase.kind === "scanning" ? phase : null;

  return (
    <div className="relative h-full">
      <AmbientField intense={phase.kind !== "idle"} />
      <div className="relative z-10 h-full">
        <AnimatePresence mode="wait">
          {phase.kind === "result" ? (
            <RadiographView key={phase.result.address + phase.result.caseFile.createdAt} result={phase.result} onReset={reset} />
          ) : (
            <Landing key="landing" onScan={startScan} error={error} feed={feed} onClearError={() => setError(null)} />
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {scanning && (
          <ScanSequence
            key="scan"
            address={scanning.address}
            demo={scanning.demo}
            status={scanning.result ? "done" : "running"}
            baseOnly={Boolean(scanning.result && !scanning.result.mass.heliusEnhanced)}
            onComplete={() => scanning.result && setPhase({ kind: "result", result: scanning.result })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
