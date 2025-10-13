// src/app/api/categories/upsert/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/categories/upsert
 * body: { code, name, synonyms?: string[], active?: boolean }
 * - code: único, UPPERCASE, 2–6 chars (ex: EST, ELE, TELHA=TELH)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    let code: string = String(body?.code ?? "").trim().toUpperCase();
    const name: string = String(body?.name ?? "").trim();
    const synonyms: string[] = Array.isArray(body?.synonyms) ? body.synonyms : [];
    const active: boolean = body?.active !== false;

    if (!/^[A-Z]{2,6}$/.test(code)) {
      return NextResponse.json({ error: "code inválido (A-Z, 2–6)" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });
    }

    const now = new Date();
    const ref = adminDb.collection("categories").doc(code);
    const snap = await ref.get();

    if (!snap.exists) {
      await ref.set({
        code,
        name,
        synonyms,
        active,
        counter: 0,
        createdAt: now,
        updatedAt: now,
      });
      return NextResponse.json({ ok: true, mode: "created", id: code }, { status: 200, headers: { "Cache-Control": "no-store" } });
    } else {
      await ref.set(
        {
          name,
          synonyms,
          active,
          updatedAt: now,
        },
        { merge: true }
      );
      return NextResponse.json({ ok: true, mode: "updated", id: code }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro interno" }, { status: 500 });
  }
}