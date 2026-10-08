"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export const EASE = [0.16, 1, 0.3, 1] as const;

interface Props {
  eyebrow: string;
  /** Each entry is one headline line; lines alternate outline / solid starting with `firstOutline`. */
  lines: string[];
  firstOutline?: boolean;
  tone?: "phosphor" | "infra";
  copy?: ReactNode;
  align?: "left" | "center";
  size?: "lg" | "xl";
}

export function SectionHead({ eyebrow, lines, firstOutline = true, tone = "phosphor", copy, align = "left", size = "lg" }: Props) {
  const fontSize = size === "xl" ? "clamp(40px, 7.4vw, 128px)" : "clamp(34px, 5.2vw, 88px)";
  return (
    <div className={align === "center" ? "text-center" : ""}>
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 1 }}
        className={`flex items-center gap-3 font-mono text-[11px] tracking-scan ${tone === "infra" ? "text-infra" : "text-phosphor/80"} ${align === "center" ? "justify-center" : ""}`}
      >
        <span className={`h-px w-8 ${tone === "infra" ? "bg-infra/60" : "bg-phosphor/50"}`} />
        {eyebrow}
      </motion.div>
      <motion.h2
        className="mt-6 font-display font-bold leading-[0.92] tracking-[-0.01em] text-bone"
        style={{ fontSize }}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
      >
        {lines.map((line, i) => {
          const outline = firstOutline ? i % 2 === 0 : i % 2 === 1;
          return (
            <span key={i} className="block overflow-hidden pb-[0.06em]">
              <motion.span
                className={`block ${outline ? "outline-text" : ""} ${line === "" ? "h-[0.5em]" : ""}`}
                variants={{ hidden: { y: "105%" }, show: { y: "0%" } }}
                transition={{ duration: 1.2, delay: 0.1 + i * 0.12, ease: EASE }}
              >
                {line}
              </motion.span>
            </span>
          );
        })}
      </motion.h2>
      {copy && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 1.1, delay: 0.4, ease: EASE }}
          className={`mt-7 max-w-[46ch] text-[16px] leading-relaxed text-bone/60 ${align === "center" ? "mx-auto" : ""}`}
        >
          {copy}
        </motion.div>
      )}
    </div>
  );
}
