import { NextResponse } from "next/server";
import { checkDatabase } from "@/server/db";
import { getServerEnv } from "@/server/env";
import { buildHealthResponse } from "@/server/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const body = buildHealthResponse(getServerEnv(), checkDatabase());
  return NextResponse.json(body, {
    status: body.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
