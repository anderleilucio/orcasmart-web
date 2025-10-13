// src/app/api/seller-products/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(json: any, init?: { status?: number }) {
  return NextResponse.json(json, {
    status: init?.status ?? 200,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * POST /api/seller-products
 * Cria novo produto do vendedor
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sellerId, sku, name, price, stock, active = true, images = [], categoryCode } =
      body || {};

    if (!sellerId || !sku || !name)
      return noStore(
        { error: "Campos obrigatórios: sellerId, sku, name" },
        { status: 400 }
      );

    const id = `${sellerId}_${sku}`;
    const ref = adminDb.collection("seller_products").doc(id);

    await ref.set(
      {
        sellerId,
        sku,
        name,
        price: Number(price ?? 0),
        stock: Number(stock ?? 0),
        active,
        imageUrls: images,
        categoryCode: categoryCode?.toUpperCase() ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return noStore({ ok: true, id });
  } catch (err: any) {
    console.error("[POST seller-products]", err);
    return noStore({ error: err?.message ?? "Erro interno" }, { status: 500 });
  }
}

/**
 * PUT /api/seller-products?id=<ID>
 * Atualiza produto existente
 */
export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return noStore({ error: "Parâmetro 'id' obrigatório" }, { status: 400 });

    const body = await req.json().catch(() => ({}));

    const ref = adminDb.collection("seller_products").doc(id);
    const snap = await ref.get();
    if (!snap.exists)
      return noStore({ error: "Produto não encontrado" }, { status: 404 });

    const data = {
      ...body,
      updatedAt: new Date(),
    };

    await ref.set(data, { merge: true });
    return noStore({ ok: true, id });
  } catch (err: any) {
    console.error("[PUT seller-products]", err);
    return noStore({ error: err?.message ?? "Erro interno" }, { status: 500 });
  }
}

/**
 * OPTIONS (CORS)
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store",
    },
  });
}