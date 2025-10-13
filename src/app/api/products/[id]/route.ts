// src/app/api/products/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import * as admin from "firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type",
    },
  });
}

async function getUid(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) throw new Error("NO_TOKEN");
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ref = adminDb.collection("products").doc(params.id);
  const snap = await ref.get();
  if (!snap.exists) return json({ error: "Produto não encontrado" }, 404);
  return json({ id: snap.id, ...snap.data() });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const uid = await getUid(req);

    const ref = adminDb.collection("products").doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return json({ error: "Produto não encontrado" }, 404);

    const current = snap.data() as any;
    if (current?.ownerId && current.ownerId !== uid) return json({ error: "Sem permissão" }, 403);

    const body = await req.json().catch(() => ({}));
    const allowed: Record<string, any> = {};

    if (typeof body.name === "string") allowed.name = body.name.trim();
    if (typeof body.sku === "string") allowed.sku = body.sku.trim();

    if (body.price !== undefined) {
      const n = Number(body.price);
      allowed.price = Number.isFinite(n) ? n : 0;
    }
    if (body.stock !== undefined) {
      const n = Number(body.stock);
      allowed.stock = Number.isFinite(n) ? n : 0;
    }

    if (typeof body.active === "boolean") allowed.active = body.active;

    // unit (opcional, compatível com import)
    if (typeof body.unit === "string") allowed.unit = body.unit.trim();

    // images: aceita array (inclusive vazio para remover)
    if (Array.isArray(body.images)) {
      const arr = body.images.filter((u: any) => typeof u === "string" && u.trim());
      allowed.images = arr;
      // opcional: mantém um campo "image" com a primeira (compat com telas antigas)
      allowed.image = arr[0] || "";
    }

    if (!Object.keys(allowed).length) return json({ error: "Nada para atualizar" }, 400);

    allowed.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await ref.update(allowed);
    const updated = await ref.get();
    return json({ id: updated.id, ...updated.data() });
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") return json({ error: "Usuário não autenticado" }, 401);
    console.error("[products PATCH] erro:", e);
    return json({ error: "Erro interno" }, 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const uid = await getUid(req);

    const ref = adminDb.collection("products").doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return json({ error: "Produto não encontrado" }, 404);

    const data = snap.data() as any;
    if (data?.ownerId && data.ownerId !== uid) return json({ error: "Sem permissão" }, 403);

    await ref.delete();
    return json({ ok: true });
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") return json({ error: "Usuário não autenticado" }, 401);
    console.error("[products DELETE] erro:", e);
    return json({ error: "Erro interno" }, 500);
  }
}