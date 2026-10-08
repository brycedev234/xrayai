/**
 * Display formatting for nullable scan values. `null` always renders as "—".
 */

export const DASH = "—";

export function usd(v: number | null | undefined, compact = false): string {
  if (v === null || v === undefined) return DASH;
  if (compact) {
    const abs = Math.abs(v);
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  }
  if (Math.abs(v) < 1 && v !== 0) return `$${v.toPrecision(3)}`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

export function price(v: number | null | undefined): string {
  if (v === null || v === undefined) return DASH;
  if (v >= 1) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  return `$${v.toPrecision(4)}`;
}

/** v is 0-100. */
export function pct(v: number | null | undefined, digits = 1, opts: { sign?: boolean; lowerBound?: boolean } = {}): string {
  if (v === null || v === undefined) return DASH;
  const s = `${opts.sign && v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
  return opts.lowerBound ? `≥ ${s}` : s;
}

export function int(v: number | null | undefined): string {
  if (v === null || v === undefined) return DASH;
  return Math.round(v).toLocaleString("en-US");
}

export function amount(v: number | null | undefined): string {
  if (v === null || v === undefined) return DASH;
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** "04H 17M", "12D 03H", "45S". */
export function age(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return DASH;
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  if (s < 60) return `${pad(s)}S`;
  if (s < 3600) return `${pad(Math.floor(s / 60))}M ${pad(s % 60)}S`;
  if (s < 86400) return `${pad(Math.floor(s / 3600))}H ${pad(Math.floor((s % 3600) / 60))}M`;
  return `${pad(Math.floor(s / 86400))}D ${pad(Math.floor((s % 86400) / 3600))}H`;
}

export function ratio(v: number | null | undefined): string {
  if (v === null || v === undefined) return DASH;
  return `${v.toFixed(2)}×`;
}

export function short(address: string | null | undefined, head = 4, tail = 4): string {
  if (!address) return DASH;
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/** Authority-style boolean: true → ACTIVE, false → REVOKED, null → fallback label. */
export function authority(active: boolean | null | undefined, unknown = "INSUFFICIENT DATA"): string {
  if (active === true) return "ACTIVE";
  if (active === false) return "REVOKED";
  return unknown;
}

export function yesNo(v: boolean | null | undefined, yes = "PRESENT", no = "NOT PRESENT", unknown = "UNKNOWN"): string {
  if (v === true) return yes;
  if (v === false) return no;
  return unknown;
}
