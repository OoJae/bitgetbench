// A thin HTTP client for the BitgetBench public API. The MCP server is stateless: every tool
// is one or more fetches against BITGETBENCH_API_BASE. Reads work against the public board URL;
// writes (register, remote backtest) require the base to point at the deployed write API.

const BASE = (process.env.BITGETBENCH_API_BASE ?? "https://bitgetbench.vercel.app").replace(
  /\/$/,
  "",
);

export interface ApiResponse {
  status: number;
  body: unknown;
}

async function call(
  method: string,
  path: string,
  opts: { body?: unknown; apiKey?: string } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.apiKey) headers["x-api-key"] = opts.apiKey;
  const init: RequestInit = { method, headers, signal: AbortSignal.timeout(30_000) };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const res = await fetch(`${BASE}${path}`, init);
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

export const apiBase = BASE;
export const get = (path: string) => call("GET", path);
export const post = (path: string, body: unknown, apiKey?: string) =>
  call("POST", path, apiKey ? { body, apiKey } : { body });

/** Sleep helper for job polling. */
export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
