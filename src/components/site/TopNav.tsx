"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState, type RefObject } from "react";
import type { FeedInfo } from "@/lib/client/scanClient";
import { BrandMark } from "../ui/BrandMark";
import { FeedPill } from "../ui/FeedPill";

export const NAV_ITEMS: { id: string; label: string }[] = [
  { id: "how-it-works", label: "METHOD" },
  { id: "genome", label: "GENOME" },
  { id: "anatomy", label: "ANATOMY" },
  { id: "mass", label: "MASS" },
  { id: "flow", label: "FLOW" },
  { id: "case-file", label: "CASE FILE" },
  { id: "socials", label: "SOCIALS" },
];

export const NAV_HEIGHT = 64;

interface Props {
  scroller: RefObject<HTMLElement | null>;
  feed: FeedInfo;
}

/** Sticky navigation inside the landing scroll container. */
export function TopNav({ scroller, feed }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const onScroll = () => setScrolled(root.scrollTop > 24);
    onScroll();
    root.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { root, rootMargin: "-40% 0px -55% 0px" },
    );
    const ids = [...NAV_ITEMS.map((n) => n.id), "scan", "philosophy"];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    const hero = document.getElementById("top");
    if (hero) io.observe(hero);
    return () => {
      root.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, [scroller]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const go = useCallback(
    (id: string) => (e: React.MouseEvent) => {
      const root = scroller.current;
      const el = document.getElementById(id);
      if (!root || !el) return;
      e.preventDefault();
      setOpen(false);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const top = id === "top" ? 0 : el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - NAV_HEIGHT + 1;
      root.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
      history.replaceState(null, "", id === "top" ? location.pathname : `#${id}`);
      if (id === "scan") setTimeout(() => document.getElementById("final-ca-input")?.focus({ preventScroll: true }), reduce ? 0 : 800);
    },
    [scroller],
  );

  return (
    <header
      className={`top-nav sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-500 ${scrolled || open ? "is-scrolled" : ""}`}
      style={{ height: NAV_HEIGHT }}
    >
      <nav className="mx-auto flex h-full items-center gap-4 px-4 sm:gap-6 sm:px-8" aria-label="Primary">
        <a href="#top" onClick={go("top")} className="flex shrink-0 items-center gap-2.5 text-bone" aria-label="ONCHAIN X-RAY, back to top">
          <BrandMark className="h-7 w-7" />
          <span className="font-display text-[11px] font-bold tracking-[0.3em]">ONCHAIN X-RAY</span>
        </a>

        <ul className="ml-auto hidden items-center gap-6 lg:flex xl:gap-8">
          {NAV_ITEMS.map((item) => {
            const on = active === item.id;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={go(item.id)}
                  aria-current={on ? "true" : undefined}
                  className={`nav-link relative font-mono text-[11px] tracking-[0.2em] transition-colors duration-300 ${on ? (item.id === "mass" ? "text-infra" : "text-bone") : "text-mute hover:text-bone"}`}
                >
                  {item.label}
                  <span className={`nav-link__tick ${on ? "is-on" : ""} ${item.id === "mass" ? "is-infra" : ""}`} aria-hidden />
                </a>
              </li>
            );
          })}
        </ul>

        <FeedPill info={feed} className="hidden 2xl:inline-flex" />

        <a
          href="#scan"
          onClick={go("scan")}
          className={`nav-cta ml-auto hidden shrink-0 font-mono text-[11px] tracking-[0.22em] sm:inline-block lg:ml-0 ${active === "scan" ? "is-on" : ""}`}
        >
          <span className="text-mute">[</span> SCAN <span aria-hidden>→</span> <span className="text-mute">]</span>
        </a>

        <button
          type="button"
          className="ml-auto shrink-0 font-mono text-[11px] tracking-[0.22em] text-bone sm:ml-0 lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "CLOSE" : "MENU"}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            key="menu"
            initial={{ opacity: 0, clipPath: "inset(0 0 100% 0)" }}
            animate={{ opacity: 1, clipPath: "inset(0 0 0% 0)" }}
            exit={{ opacity: 0, clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="mobile-menu absolute inset-x-0 top-full border-b border-white/[0.08] px-4 pb-8 pt-2 sm:px-8 lg:hidden"
          >
            <ul className="flex flex-col">
              {NAV_ITEMS.map((item, i) => (
                <li key={item.id} className="border-t border-white/[0.06]">
                  <a href={`#${item.id}`} onClick={go(item.id)} className={`flex items-baseline gap-4 py-3.5 ${active === item.id ? "text-bone" : "text-bone/70"}`}>
                    <span className="font-mono text-[10px] tracking-[0.2em] text-mute">{String(i).padStart(2, "0")}</span>
                    <span className={`font-display text-[20px] font-bold tracking-[0.06em] ${item.id === "mass" ? "text-infra" : ""}`}>{item.label}</span>
                    {active === item.id && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-phosphor" />}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center justify-between gap-4">
              <FeedPill info={feed} align="left" side="above" />
              <a href="#scan" onClick={go("scan")} className="scan-button inline-flex h-[48px] items-center gap-3 rounded-[2px] px-6 font-display text-[11px] font-bold tracking-[0.26em]">
                SCAN <span aria-hidden>→</span>
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
