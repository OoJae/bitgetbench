import { describe, expect, it, vi, afterEach } from "vitest";
import { TOOLS } from "../src/tools.js";

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function mockFetch(captured: Captured[], response: { status?: number; json?: unknown }) {
  return vi.fn(async (url: string, init: RequestInit) => {
    captured.push({
      url,
      method: init.method ?? "GET",
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    return {
      status: response.status ?? 200,
      text: async () => JSON.stringify(response.json ?? {}),
    } as unknown as Response;
  });
}

function tool(name: string) {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MCP tool surface", () => {
  it("exposes the five tools with object input schemas", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([
      "get_leaderboard",
      "get_run",
      "register_agent",
      "run_backtest",
      "verify_journal",
    ]);
    for (const t of TOOLS) {
      expect((t.inputSchema as { type: string }).type).toBe("object");
      expect(typeof t.description).toBe("string");
    }
  });
});

describe("tool handlers map to API calls", () => {
  it("get_leaderboard builds the query and GETs /api/runs", async () => {
    const cap: Captured[] = [];
    vi.stubGlobal("fetch", mockFetch(cap, { json: [{ agent: "a" }] }));
    const out = await tool("get_leaderboard").run({ limit: 5, tier: "engine-verified" });
    expect(cap[0]!.method).toBe("GET");
    expect(cap[0]!.url).toContain("/api/runs?");
    expect(cap[0]!.url).toContain("limit=5");
    expect(cap[0]!.url).toContain("tier=engine-verified");
    expect(out).toEqual([{ agent: "a" }]);
  });

  it("register_agent POSTs /api/agents and returns status", async () => {
    const cap: Captured[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetch(cap, { status: 201, json: { agentId: "id1", apiKey: "bbk_x" } }),
    );
    const out = (await tool("register_agent").run({
      name: "n",
      kind: "strategy-spec",
      spec: { kind: "buy_and_hold" },
    })) as Record<string, unknown>;
    expect(cap[0]!.method).toBe("POST");
    expect(cap[0]!.url).toContain("/api/agents");
    expect(out.status).toBe(201);
    expect(out.agentId).toBe("id1");
  });

  it("run_backtest with a spec POSTs /api/backtest/spec", async () => {
    const cap: Captured[] = [];
    vi.stubGlobal("fetch", mockFetch(cap, { json: { runId: "spec:abc", result: { score: 0.1 } } }));
    const out = (await tool("run_backtest").run({
      spec: { kind: "sma_cross", params: { fast: 10, slow: 30 } },
    })) as Record<string, unknown>;
    expect(cap[0]!.url).toContain("/api/backtest/spec");
    expect(cap[0]!.body).toEqual({ spec: { kind: "sma_cross", params: { fast: 10, slow: 30 } } });
    expect(out.runId).toBe("spec:abc");
  });

  it("run_backtest with a remote agent sends the api key header", async () => {
    const cap: Captured[] = [];
    // 202 queued then the job poll resolves immediately as done, then get_run.
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        cap.push({
          url,
          method: init.method ?? "GET",
          headers: (init.headers ?? {}) as Record<string, string>,
          body: init.body ? JSON.parse(init.body as string) : undefined,
        });
        n += 1;
        if (n === 1)
          return {
            status: 202,
            text: async () => JSON.stringify({ jobId: "job_1", runId: "remote:ag1" }),
          } as unknown as Response;
        if (n === 2)
          return {
            status: 200,
            text: async () => JSON.stringify({ status: "done", runId: "remote:ag1" }),
          } as unknown as Response;
        return {
          status: 200,
          text: async () => JSON.stringify({ run: { agent: "ag1" } }),
        } as unknown as Response;
      }),
    );
    const out = (await tool("run_backtest").run({
      agentId: "ag1",
      apiKey: "bbk_secret",
    })) as Record<string, unknown>;
    expect(cap[0]!.url).toContain("/api/backtest/remote");
    expect(cap[0]!.headers["x-api-key"]).toBe("bbk_secret");
    expect(out.status).toBe("done");
    expect(out.runId).toBe("remote:ag1");
  });

  it("verify_journal POSTs the journal", async () => {
    const cap: Captured[] = [];
    vi.stubGlobal("fetch", mockFetch(cap, { json: { ok: true, brokenAt: null } }));
    const out = (await tool("verify_journal").run({ journal: [{ seq: 0 }] })) as Record<
      string,
      unknown
    >;
    expect(cap[0]!.url).toContain("/api/verify");
    expect(cap[0]!.body).toEqual({ journal: [{ seq: 0 }] });
    expect(out.ok).toBe(true);
  });
});
