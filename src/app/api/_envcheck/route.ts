// src/app/api/_envcheck/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const projectId = process.env.FIREBASE_PROJECT_ID || null;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || null;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY || null;

  const privateKey = rawKey
    ? rawKey.replace(/\\n/g, "\n").replace(/^"|"$/g, "")
    : null;

  return NextResponse.json({
    projectId,
    clientEmail,
    hasPrivateKey: !!privateKey,
    keyStartsWith: privateKey ? privateKey.slice(0, 26) : null,
    keyEndsWith: privateKey ? privateKey.slice(-26) : null,
    keyHasNewlines: privateKey ? privateKey.includes("\n") : null,
  });
}