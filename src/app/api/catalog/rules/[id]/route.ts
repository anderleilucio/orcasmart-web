// src/app/api/catalog/rules/[id]/route.ts
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

// DELETE /api/catalog/rules/:id  -> apaga uma regra do usuário
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const uid = await getUidFromHeader(req);
    const id = params?.id;

    if (!id) return json({ error: "ID ausente" }, 400);

    const ref = adminDb.collection("catalog_rules").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return json({ ok: true }, 200);

    const data = snap.data() as any;
    if (data?.ownerId !== uid) return json({ error: "Proibido" }, 403);

    await ref.delete();
    return json({ ok: true }, 200);
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") return json({ error: "Usuário não autenticado" }, 401);
    console.error("[catalog/rules DELETE] erro:", e);
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
}