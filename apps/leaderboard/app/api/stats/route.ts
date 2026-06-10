import { NextResponse } from "next/server";
import { stats, heartbeat } from "../../../lib/data";

export const dynamic = "force-dynamic";

export function GET() {
  const hb = heartbeat();
  return NextResponse.json({
    ...stats(),
    sandboxHeartbeat: hb ? { ts: hb.ts, ok: hb.ok === 1, latencyMs: hb.latencyMs } : null,
  });
}
