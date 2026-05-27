/**
 * Deterministic color from a string — used as a fallback channel logo background
 * so that channels without a `tvg-logo` still feel branded and unique.
 */
const PALETTE = [
  ["#7f1d1d", "#dc2626"], // red
  ["#7c2d12", "#ea580c"], // orange
  ["#713f12", "#ca8a04"], // amber
  ["#14532d", "#16a34a"], // green
  ["#134e4a", "#0d9488"], // teal
  ["#164e63", "#0891b2"], // cyan
  ["#1e3a8a", "#2563eb"], // blue
  ["#312e81", "#4f46e5"], // indigo
  ["#581c87", "#9333ea"], // purple
  ["#831843", "#db2777"], // pink
  ["#3f3f46", "#71717a"], // zinc
] as const;

function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return Math.abs(h);
}

export function getFallbackGradient(seed: string): string {
  const [a, b] = PALETTE[hash(seed) % PALETTE.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export function getChannelInitials(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  if (!cleaned) return "TV";
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
