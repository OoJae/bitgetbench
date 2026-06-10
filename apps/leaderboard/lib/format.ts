// Small formatting helpers shared by the pages.

export function pct(x: number, digits = 2): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function num(x: number | null, digits = 2): string {
  if (x === null || !Number.isFinite(x)) return "inf";
  return x.toFixed(digits);
}

export function usd(x: number): string {
  return `${x.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function shortHash(h: string): string {
  return h.length > 16 ? `${h.slice(0, 10)}...${h.slice(-6)}` : h;
}

export function fmtDate(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + "Z";
}
