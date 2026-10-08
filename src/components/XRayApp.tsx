"use client";

import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { demoOutcome, feedInfoFromHealth, fetchHealth, isDemoAddress, requestScan, type ClientScanError, type HealthState } from "@/lib/client/scanClient";
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
  const [health, setHealth] = useState<{ value: HealthState | null; at: number | null }>({ value: null, at: null });
  const abortRef = useRef<AbortController | null>(null);
  const aliveRef = useRef(true);

  const checkHealth = useCallback(() => {
    setHealth((h) => ({ ...h, at: null }));
    fetchHealth().then((value) => aliveRef.current && setHealth({ value, at: Date.now() }));
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    checkHealth();
    return () => {
      aliveRef.current = false;
    };
  }, [checkHealth]);

  const feed = useMemo(() => ({ ...feedInfoFromHealth(health.value, health.at), recheck: checkHealth }), [health, checkHealth]);

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
