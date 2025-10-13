// src/app/api/categories/list/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/categories/list?include_inactive=1
 * Retorna a lista de categorias (por padrão, só ativas).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get("include_inactive") === "1";

    let q = adminDb.collection("categories") as FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;
    if (!includeInactive) q = q.where("active", "==", true);

    const snap = await q.orderBy("name").get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ items }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro interno" }, { status: 500 });
  }
}