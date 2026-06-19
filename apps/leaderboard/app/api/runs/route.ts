import { NextResponse } from "next/server";
import { listRuns } from "../../../lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "100");
  const runs = await listRuns(Number.isFinite(limit) ? limit : 100);
  return NextResponse.json(runs);
}
