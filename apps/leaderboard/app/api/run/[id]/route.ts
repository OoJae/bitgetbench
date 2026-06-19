import { NextResponse } from "next/server";
import { runDetail } from "../../../../lib/data";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await runDetail(id);
  if (!detail) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(detail);
}
