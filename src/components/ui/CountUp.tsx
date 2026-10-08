"use client";

import { animate } from "framer-motion";
import { useEffect, useState } from "react";

export function CountUp({
  value,
  decimals = 0,
  suffix = "",
  delay = 0,
  duration = 1.2,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  delay?: number;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setDisplay,
    });
    return () => controls.stop();
  }, [value, delay, duration]);
  return (
    <span className="tabular-nums">
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
