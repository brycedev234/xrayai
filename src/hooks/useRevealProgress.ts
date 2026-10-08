"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * A 0→1 clock that starts the first time `ref` scrolls into view and runs for
 * `duration` seconds. The ref value updates every frame (for canvases); the
 * returned state updates at a lower rate (for DOM readouts).
 */
export function useRevealProgress(ref: RefObject<Element | null>, duration: number, reduced = false) {
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [runId, setRunId] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let startAt = 0;
    let lastPush = 0;
    const tick = (now: number) => {
      if (!startAt) startAt = now;
      const p = reduced ? 1 : Math.min(1, (now - startAt) / 1000 / duration);
      progressRef.current = p;
      if (now - lastPush > 60 || p === 1) {
        lastPush = now;
        setProgress(p);
      }
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const begin = () => {
      started.current = true;
      progressRef.current = 0;
      setProgress(0);
      raf = requestAnimationFrame(tick);
    };
    if (runId > 0) {
      begin();
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          io.disconnect();
          begin();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [ref, duration, reduced, runId]);

  const replay = useCallback(() => setRunId((n) => n + 1), []);
  return { progress, progressRef, replay };
}
