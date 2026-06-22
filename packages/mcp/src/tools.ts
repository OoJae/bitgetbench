// The MCP tool surface: register an agent, run a backtest (deterministic strategy spec, or a
// remote webhook agent), read the leaderboard, fetch a run, and verify a journal. Each tool maps
// to one or more calls against the BitgetBench HTTP API. Input schemas are plain JSON Schema (no
// zod), so this stays decoupled from the SDK's validator version. The strategy-kind enum mirrors
// @bitgetbench/reference-agents validateSpec, which is the authoritative validator on the server.

import { get, post, apiBase, delay } from "./client.js";

const STRATEGY_KINDS = ["sma_cross", "rsi_reversion", "breakout", "buy_and_hold"];

const SPEC_SCHEMA = {
  type: "object",
  required: ["kind"],
  properties: {
    kind: { type: "string", enum: STRATEGY_KINDS, description: "Strategy primitive" },
    params: {
      type: "object",
      description: "Kind-specific params, e.g. { fast: 20, slow: 50 } for sma_cross",
      additionalProperties: { type: "number" },
    },
    sizePct: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Fraction of equity per entry",
    },
    leverage: { type: "number", minimum: 1, maximum: 10 },
    allowShort: { type: "boolean", description: "sma_cross only: flip short on a bearish cross" },
    name: { type: "string", description: "Optional board label" },
  },
} as const;

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

/** Poll a queued job until it terminates or the budget runs out. */
async function pollJob(
  jobId: string,
): Promise<{ status: string; runId: string | null; error: string | null }> {
  for (let i = 0; i < 90; i += 1) {
    const { body } = await get(`/api/jobs/${encodeURIComponent(jobId)}`);
    const job = body as { status?: string; runId?: string | null; error?: string | null };
    if (job.status === "done" || job.status === "failed") {
      return { status: job.status, runId: job.runId ?? null, error: job.error ?? null };
    }
    await delay(2000);
  }
  return { status: "pending", runId: null, error: "still running; poll get_run later" };
}

export const TOOLS: ToolDef[] = [
  {
    name: "register_agent",
    description:
      "Register a trading agent with BitgetBench. For kind 'strategy-spec', supply a strategy spec. For kind 'remote-webhook', supply a public https webhook URL that BitgetBench will POST a MarketContext to per step, and set attestNoOutsideData true. Returns an agentId and an apiKey (store it: it is shown once).",
    inputSchema: {
      type: "object",
      required: ["name", "kind"],
      properties: {
        name: { type: "string", description: "Display name on the board" },
        kind: { type: "string", enum: ["strategy-spec", "remote-webhook"] },
        webhookUrl: {
          type: "string",
          description: "remote-webhook only: a public https decision endpoint",
        },
        spec: { ...SPEC_SCHEMA, description: "strategy-spec only: the strategy to register" },
        attestNoOutsideData: {
          type: "boolean",
          description:
            "remote-webhook only: confirm the agent uses only the MarketContext provided in backtests",
        },
      },
    },
    run: async (args) => {
      const { body, status } = await post("/api/agents", args);
      return { status, ...(body as object) };
    },
  },
  {
    name: "run_backtest",
    description:
      "Run a leak-audited, fee-modeled backtest on real Bitget BTCUSDT 15m data and put it on the public leaderboard. Provide either a strategy `spec` (deterministic, engine-verified, returns the full result inline) OR a registered `agentId` + `apiKey` for a remote-webhook agent (queued as a job and polled to completion).",
    inputSchema: {
      type: "object",
      properties: {
        spec: SPEC_SCHEMA,
        agentId: { type: "string", description: "A registered remote-webhook agent id" },
        apiKey: {
          type: "string",
          description: "The api key returned at registration (remote only)",
        },
      },
    },
    run: async (args) => {
      if (args.spec) {
        const { body, status } = await post("/api/backtest/spec", { spec: args.spec });
        return { status, ...(body as object) };
      }
      if (args.agentId) {
        const { body, status } = await post(
          "/api/backtest/remote",
          { agentId: args.agentId },
          typeof args.apiKey === "string" ? args.apiKey : undefined,
        );
        if (status !== 202) return { status, ...(body as object) };
        const { jobId, runId } = body as { jobId: string; runId: string };
        const job = await pollJob(jobId);
        if (job.status === "done") {
          const detail = await get(`/api/run/${encodeURIComponent(job.runId ?? runId)}`);
          return { status: "done", runId: job.runId ?? runId, run: detail.body };
        }
        return { status: job.status, jobId, runId, error: job.error };
      }
      return {
        error: "provide either spec (strategy backtest) or agentId+apiKey (remote backtest)",
      };
    },
  },
  {
    name: "get_leaderboard",
    description:
      "Get the BitgetBench leaderboard, ranked by composite score. Each row shows the agent, score, return, Sharpe, max drawdown, leak cleanliness, and verification tier (engine-verified vs data-clean).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", minimum: 1, maximum: 500 },
        mode: { type: "string", enum: ["backtest", "sandbox"] },
        tier: { type: "string", enum: ["engine-verified", "data-clean", "disqualified"] },
      },
    },
    run: async (args) => {
      const q = new URLSearchParams();
      if (args.limit) q.set("limit", String(args.limit));
      if (args.mode) q.set("mode", String(args.mode));
      if (args.tier) q.set("tier", String(args.tier));
      const { body } = await get(`/api/runs${q.toString() ? `?${q}` : ""}`);
      return body;
    },
  },
  {
    name: "get_run",
    description:
      "Fetch one run's full detail: metrics, benchmark, leak certificate, journal root, and trades.",
    inputSchema: {
      type: "object",
      required: ["runId"],
      properties: { runId: { type: "string" } },
    },
    run: async (args) => {
      const { body, status } = await get(`/api/run/${encodeURIComponent(String(args.runId))}`);
      return status === 404 ? { error: "no such run" } : body;
    },
  },
  {
    name: "verify_journal",
    description:
      "Verify a hash-chained journal (array of JournalEntry). Returns ok plus the seq of the first broken entry, if any.",
    inputSchema: {
      type: "object",
      required: ["journal"],
      properties: { journal: { type: "array", items: { type: "object" } } },
    },
    run: async (args) => {
      const { body } = await post("/api/verify", { journal: args.journal });
      return body;
    },
  },
];

export { apiBase };
