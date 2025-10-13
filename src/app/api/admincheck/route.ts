import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userList = await adminAuth.listUsers(1);
    return NextResponse.json({
      ok: true,
      sampleUid: userList.users[0]?.uid ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err.message,
      stack: err.stack,
    });
  }
}