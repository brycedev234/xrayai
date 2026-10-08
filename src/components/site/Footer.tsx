import { BrandMark } from "../ui/BrandMark";

export function Footer({ onMethod, onTop }: { onMethod: () => void; onTop: () => void }) {
  return (
    <footer className="relative border-t border-white/[0.06] px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-bone">
          <BrandMark className="h-6 w-6" />
          <span className="font-display text-[11px] font-bold tracking-[0.3em]">ONCHAIN X-RAY</span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-7 gap-y-3 font-mono text-[10px] tracking-[0.22em] text-mute">
          <span>SOLANA</span>
          <button type="button" onClick={onMethod} className="transition hover:text-bone">
            METHOD
          </button>
          <span>READ-ONLY · NO WALLET CONNECTION</span>
          <button type="button" onClick={onTop} className="transition hover:text-bone">
            RADIOGRAPHY
          </button>
        </nav>
      </div>
      <p className="mx-auto mt-10 max-w-[1440px] font-mono text-[10px] tracking-[0.22em] text-mute/70">
        BUILT TO EXPOSE STRUCTURE. NOT ASSIGN GUILT.
      </p>
    </footer>
  );
}
