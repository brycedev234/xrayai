"use client";

import { motion } from "framer-motion";
import { EASE } from "./SectionHead";

const WORDS = ["OBSERVE.", "TRACE.", "VERIFY."];

export function PhilosophySection() {
  return (
    <section id="philosophy" className="relative px-4 py-40 sm:px-8 sm:py-64">
      <div className="mx-auto max-w-[1200px] text-center">
        <motion.h2
          className="font-display font-bold leading-[0.95] text-bone"
          style={{ fontSize: "clamp(32px, 5.6vw, 96px)" }}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
        >
          {["WE DON’T GIVE YOU", "A 73/100", "“SAFETY SCORE.”"].map((line, i) => (
            <span key={line} className="block overflow-hidden pb-[0.06em]">
              <motion.span
                className={`block ${i === 1 ? "outline-text" : ""}`}
                variants={{ hidden: { y: "105%" }, show: { y: "0%" } }}
                transition={{ duration: 1.4, delay: i * 0.18, ease: EASE }}
              >
                {i === 1 ? <span className="struck inline-block">{line}</span> : line}
              </motion.span>
            </span>
          ))}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 1.6, delay: 0.6 }}
          className="mx-auto mt-12 max-w-[36ch] text-[17px] leading-relaxed text-bone/60"
        >
          X-RAY shows the underlying structure.
          <br />
          You decide what it means.
        </motion.p>

        <div className="mt-40 grid grid-cols-1 gap-16 sm:mt-56 sm:grid-cols-3 sm:gap-6">
          {WORDS.map((w, i) => (
            <motion.div
              key={w}
              initial={{ opacity: 0, filter: "blur(10px)", letterSpacing: "0.5em" }}
              whileInView={{ opacity: 1, filter: "blur(0px)", letterSpacing: "0.22em" }}
              viewport={{ once: true, amount: 0.8 }}
              transition={{ duration: 2.2, delay: i * 0.7, ease: EASE }}
              className="font-display text-[clamp(18px,2vw,28px)] font-bold text-bone"
            >
              {w}
              <div className="mx-auto mt-5 h-px w-10 bg-phosphor/40" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
