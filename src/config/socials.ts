/**
 * Paste your channel URLs here. This is the only place they live.
 *
 * A blank value hides that channel everywhere on the site.
 * Only http(s) URLs are rendered.
 */
export const socials = {
  twitter: "https://x.com/xraydotio",
};

export type SocialKey = keyof typeof socials;

/** Display metadata for each channel (labels only, no URLs). */
export const SOCIAL_CHANNELS: { key: SocialKey; label: string; purpose: string }[] = [{ key: "twitter", label: "X / TWITTER", purpose: "LIVE UPDATES" }];

export function safeSocialUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Channels with a usable URL, in display order. */
export function activeSocials(config: Record<SocialKey, string> = socials) {
  return SOCIAL_CHANNELS.flatMap((c) => {
    const url = safeSocialUrl(config[c.key] ?? "");
    return url ? [{ ...c, url }] : [];
  });
}
