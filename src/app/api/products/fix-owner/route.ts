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

async function getUid(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) throw new Error("NO_TOKEN");
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
}

// POST /api/products/fix-owner
export async function POST(req: NextRequest) {
  try {
    const uid = await getUid(req);

    // busca até 500 documentos sem ownerId (ou vazio)
    const snap = await adminDb
      .collection("products")
      .where("ownerId", "in", [null, ""])
      .limit(500)
      .get();

    if (snap.empty) return json({ updated: 0 });

    const batch = adminDb.batch();
    snap.docs.forEach((d) => {
      batch.update(d.ref, { ownerId: uid });
    });
    await batch.commit();

    return json({ updated: snap.size });
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") return json({ error: "Usuário não autenticado" }, 401);
    console.error("[fix-owner] erro:", e);
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
}
