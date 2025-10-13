// src/app/api/seller-products/[id]/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { id: string };

// ajuste utilitário para lidar com Next 15 (params como Promise)
async function resolveParams(
  context: { params: Promise<Params> } | { params: Params }
): Promise<Params> {
  const p = context.params as Promise<Params> | Params;
  return p instanceof Promise ? p : p;
}

/* ========================= GET ========================= */
export async function GET(_req: NextRequest, context: { params: Promise<Params> }) {
  try {
    const { id } = await resolveParams(context);

    const ref = adminDb.collection("seller_products").doc(id);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ id: snap.id, ...snap.data() }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/* ========================= PUT (se existir) ========================= */
// Se você tiver PUT/DELETE aqui, tipa igual ao GET:
export async function PUT(req: NextRequest, context: { params: Promise<Params> }) {
  try {
    const { id } = await resolveParams(context);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    await adminDb.collection("seller_products").doc(id).set(
      {
        ...body,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, id }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<Params> }) {
  try {
    const { id } = await resolveParams(context);
    await adminDb.collection("seller_products").doc(id).delete();
    return NextResponse.json({ ok: true, id }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}