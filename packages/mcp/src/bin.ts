#!/usr/bin/env node
// BitgetBench MCP server (stdio). Exposes the chat-to-backtest tools so any MCP-capable agent
// platform (MuleRun, GetAgent, OpenAI Agent Builder, a Telegram bot, the Bitget Agent Hub) can
// register an agent, backtest a strategy on real Bitget data, and read the leaderboard by chat.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, apiBase } from "./tools.js";

const server = new Server(
  { name: "bitgetbench", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) {
    return { isError: true, content: [{ type: "text", text: `unknown tool: ${req.params.name}` }] };
  }
  try {
    const result = await tool.run((req.params.arguments ?? {}) as Record<string, unknown>);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `tool ${tool.name} failed: ${(err as Error).message}` }],
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error(`bitgetbench-mcp ready (api base: ${apiBase})`);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("bitgetbench-mcp failed to start:", err);
  process.exit(1);
});
