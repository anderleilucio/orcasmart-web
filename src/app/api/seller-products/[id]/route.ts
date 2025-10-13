// src/app/api/seller-products/[id]/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "no-store" } as const;

/**
 * DELETE /api/seller-products/:id
 * Soft delete: define { active: false, updatedAt: now } no documento.
 * :id é o ID do doc em seller_products (ex.: CUID_EST-0001).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params?.id?.trim();
    if (!id) {
      return NextResponse.json(
        { error: "id ausente na URL" },
        { status: 400, headers: noStore }
      );
    }

    const ref = adminDb.collection("seller_products").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: "Produto não encontrado" },
        { status: 404, headers: noStore }
      );
    }

    await ref.set(
      { active: false, updatedAt: new Date() },
      { merge: true }
    );

    return NextResponse.json({ ok: true, id }, { status: 200, headers: noStore });
  } catch (err: any) {
    console.error("[DELETE seller-products/:id]", err);
    return NextResponse.json(
      { error: err?.message ?? "Erro interno" },
      { status: 500, headers: noStore }
    );
  }
}

/**
 * GET /api/seller-products/:id
 * (útil para depuração ou tela de edição)
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params?.id?.trim();
    if (!id) {
      return NextResponse.json(
        { error: "id ausente na URL" },
        { status: 400, headers: noStore }
      );
    }

    const doc = await adminDb.collection("seller_products").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json(
        { error: "Produto não encontrado" },
        { status: 404, headers: noStore }
      );
    }

    return NextResponse.json({ id: doc.id, ...doc.data() }, { headers: noStore });
  } catch (err: any) {
    console.error("[GET seller-products/:id]", err);
    return NextResponse.json(
      { error: err?.message ?? "Erro interno" },
      { status: 500, headers: noStore }
    );
  }
}