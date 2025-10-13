// src/app/api/categories/[code]/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/categories/:code
 * DELETE /api/categories/:code   -> soft delete (active=false)
 */

export async function GET(
  _req: Request,
  { params }: { params: { code: string } }
) {
  try {
    const code = String(params?.code ?? "").toUpperCase();
    if (!code) return NextResponse.json({ error: "code ausente" }, { status: 400 });

    const doc = await adminDb.collection("categories").doc(code).get();
    if (!doc.exists) return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });

    return NextResponse.json({ id: doc.id, ...doc.data() }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { code: string } }
) {
  try {
    const code = String(params?.code ?? "").toUpperCase();
    if (!code) return NextResponse.json({ error: "code ausente" }, { status: 400 });

    const ref = adminDb.collection("categories").doc(code);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });

    await ref.set({ active: false, updatedAt: new Date() }, { merge: true });
    return NextResponse.json({ ok: true, id: code }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro interno" }, { status: 500 });
  }
}