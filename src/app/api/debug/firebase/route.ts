import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const info = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      bucket: process.env.FIREBASE_STORAGE_BUCKET,
      // lista nomes das coleções visíveis para o Admin
      collections: (await adminDb.listCollections()).map((c) => c.id),
    };
    return NextResponse.json({ ok: true, info });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "erro" }, { status: 500 });
  }
}