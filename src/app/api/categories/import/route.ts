import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/categories/import
 * Body: [{ code, name, synonyms?[], counter? }]
 * - Upsert em lote por "code"
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => null);

    const arr: any[] = Array.isArray(payload) ? payload : [];
    if (!arr.length) {
      return NextResponse.json(
        { error: "Envie um array JSON com categorias." },
        { status: 400 }
      );
    }

    const results: any[] = [];

    for (const raw of arr) {
      const code = String(raw?.code || "").trim().toUpperCase();
      const name = String(raw?.name || "").trim();
      const synonyms: string[] = Array.isArray(raw?.synonyms)
        ? raw.synonyms.map((s: any) => String(s).trim()).filter(Boolean)
        : [];
      const counter = Number.isInteger(raw?.counter) ? raw.counter : undefined;

      if (!code || !name) {
        results.push({ ok: false, code, error: "code e name são obrigatórios" });
        continue;
      }

      const q = await adminDb
        .collection("categories")
        .where("code", "==", code)
        .limit(1)
        .get();

      if (q.empty) {
        const doc = {
          code,
          name,
          synonyms,
          counter: counter ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const ref = await adminDb.collection("categories").add(doc);
        results.push({ ok: true, action: "created", id: ref.id, ...doc });
      } else {
        const ref = q.docs[0].ref;
        const updates: any = {
          name,
          synonyms,
          updatedAt: new Date(),
        };
        if (counter !== undefined) updates.counter = counter;
        await ref.set(updates, { merge: true });
        const snap = await ref.get();
        results.push({ ok: true, action: "updated", id: ref.id, ...snap.data() });
      }
    }

    return NextResponse.json({ count: results.length, results }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}