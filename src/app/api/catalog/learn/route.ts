// src/app/api/catalog/learn/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function getUidFromHeader(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("NO_TOKEN");
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
}

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromHeader(req);
    const body = await req.json().catch(() => ({}));
    const term: string = body?.term ?? "";
    const category: string = body?.category ?? "";
    const prefix: string = (body?.prefix ?? "").toUpperCase().replace(/[^A-Z]/g, "");

    if (!term || !category || !prefix) {
      return json({ error: "term, category e prefix são obrigatórios." }, 400);
    }

    const termNorm = norm(term);
    if (!termNorm) return json({ error: "Termo inválido." }, 400);

    const ref = adminDb
      .collection("catalog_autolearn")
      .doc(uid)
      .collection("terms")
      .doc(termNorm);

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        tx.set(ref, {
          ownerId: uid,
          term,
          termNorm,
          category,
          prefix,
          hits: 1,
          updatedAt: Date.now(),
        });
      } else {
        tx.update(ref, {
          category,
          prefix,
          hits: (snap.data()?.hits || 0) + 1,
          updatedAt: Date.now(),
        });
      }
    });

    return json({ ok: true });
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") return json({ error: "Usuário não autenticado" }, 401);
    console.error("[catalog/learn POST] erro:", e);
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
}