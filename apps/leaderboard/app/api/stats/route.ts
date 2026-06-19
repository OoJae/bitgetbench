import { NextResponse } from "next/server";
import { stats, heartbeat } from "../../../lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const [s, hb] = await Promise.all([stats(), heartbeat()]);
  return NextResponse.json({ ...s, sandboxHeartbeat: hb });
}
