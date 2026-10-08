"use client";

import { motion } from "framer-motion";
import { activeSocials, SOCIAL_CHANNELS, socials } from "@/config/socials";
import { IS_STATIC_PREVIEW } from "@/lib/client/scanClient";
import { EASE, SectionHead } from "./SectionHead";

/**
 * SIGNAL / 07: channels from config/socials.ts. Blank URLs are hidden.
 * The static preview shows unconfigured channels dimmed so the layout can be
 * reviewed; the deployed site never renders a channel without a URL.
 */
export function SocialsSection() {
  const live = activeSocials(socials);
  const placeholders = IS_STATIC_PREVIEW && live.length === 0 ? SOCIAL_CHANNELS : [];
  const rows = live.length ? live.map((c) => ({ ...c, url: c.url as string | null })) : placeholders.map((c) => ({ ...c, url: null as string | null }));

  return (
    <section id="socials" className="relative border-t border-white/[0.05] px-4 pb-28 pt-24 sm:px-8 sm:pb-40 sm:pt-32">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHead eyebrow="SIGNAL / 07" lines={["FOLLOW", "THE SIGNAL."]} copy="Development, scans, discoveries and project updates." />
          <p className="max-w-[30ch] font-mono text-[11px] leading-relaxed tracking-[0.08em] text-mute">
            {rows.length ? `${live.length || rows.length} CHANNEL${(live.length || rows.length) === 1 ? "" : "S"} · OUTBOUND ONLY` : "NO CHANNELS BROADCASTING YET."}
          </p>
        </div>

        {rows.length > 0 && (
          <motion.ul
            className="mt-16 border-b border-white/[0.07]"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
          >
            {rows.map((c, i) => {
              const inner = (
                <>
                  <span className="channel__scan" aria-hidden />
                  <span className="font-mono text-[11px] tracking-[0.2em] text-mute">{String(i + 1).padStart(2, "0")}</span>
                  <span className="channel__label font-display font-bold leading-none tracking-[0.02em]">{c.label}</span>
                  <span className="hidden font-mono text-[11px] tracking-[0.22em] text-phosphor/80 sm:block">{c.purpose}</span>
                  <span className="hidden font-mono text-[10px] tracking-[0.2em] text-mute lg:block">{c.url ? `CH-${String(i + 1).padStart(2, "0")} · OPEN` : "NOT CONFIGURED"}</span>
                  <span className="channel__arrow font-display text-[22px] text-bone/70" aria-hidden>
                    ↗
                  </span>
                </>
              );
              return (
                <motion.li
                  key={c.key}
                  variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
                  transition={{ duration: 0.9, delay: i * 0.08, ease: EASE }}
                >
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="channel">
                      {inner}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <div className="channel is-placeholder" aria-disabled>
                      {inner}
                    </div>
                  )}
                </motion.li>
              );
            })}
          </motion.ul>
        )}
        {placeholders.length > 0 && (
          <p className="mt-4 font-mono text-[10px] tracking-[0.18em] text-amber/80">
            PREVIEW · CHANNELS ARE BLANK IN src/config/socials.ts · BLANK CHANNELS ARE HIDDEN ON THE DEPLOYED SITE
          </p>
        )}
      </div>
    </section>
  );
}
