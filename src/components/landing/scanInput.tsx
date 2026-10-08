import type { ClientScanError } from "@/lib/client/scanClient";
import { validateScanRequest } from "@/lib/validation/address";

export type ScanSource = "hero" | "final";

/** Inline scan error in the interface's own voice. */
export function ScanErrorLine({ error }: { error: ClientScanError | { title: string; message: string } }) {
  return (
    <div role="alert" className="flex flex-col gap-1 border-l border-infra/60 pl-3">
      <span className="font-mono text-[11px] tracking-[0.22em] text-infra">{error.title}</span>
      <span className="text-[13px] leading-snug text-bone/70">{error.message}</span>
    </div>
  );
}

/** Client-side check using the same validator as the API. */
export function checkAddress(raw: string): { title: string; message: string } | null {
  if (!raw.trim()) return { title: "INVALID CONTRACT", message: "Paste a token mint address to scan." };
  const v = validateScanRequest(raw, "auto");
  if (v.ok) return null;
  return { title: v.code === "NETWORK_NOT_SUPPORTED" ? "NETWORK NOT SUPPORTED" : "INVALID CONTRACT", message: v.message };
}

