// src/app/api/seller-products/list/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(body: any, init?: number | ResponseInit) {
  const base: ResponseInit =
    typeof init === "number" ? { status: init } : (init || {});
  return NextResponse.json(body, {
    ...base,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(base.headers || {}),
    },
  });
}

/**
 * GET /api/seller-products/list?sellerId=<UID>&category=<CODE>&active=true|false
 * Retorna os produtos do vendedor (ativos ou inativos).
 *
 * Exemplos:
 *   /api/seller-products/list?sellerId=abc123
 *   /api/seller-products/list?sellerId=abc123&category=EST
 *   /api/seller-products/list?sellerId=abc123&active=true
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sellerId = searchParams.get("sellerId");
    const category = searchParams.get("category");
    const activeParam = searchParams.get("active"); // "true" | "false" | null

    if (!sellerId) {
      return noStoreJson({ error: "Parâmetro 'sellerId' é obrigatório." }, 400);
    }

    let q: FirebaseFirestore.Query = adminDb
      .collection("seller_products")
      .where("sellerId", "==", sellerId);

    if (category) {
      q = q.where("categoryCode", "==", category.toUpperCase());
    }

    if (activeParam === "true") {
      q = q.where("active", "==", true);
    } else if (activeParam === "false") {
      q = q.where("active", "==", false);
    }

    // Evitamos orderBy para não exigir índice composto desnecessário.
    const snap = await q.get();

    const items = snap.docs.map((doc) => {
      const d = doc.data() as any;
      return {
        id: doc.id,
        sellerId: d.sellerId ?? sellerId,
        sku: d.sku ?? "",
        name: d.name ?? "",
        categoryCode: d.categoryCode ?? null,
        price: typeof d.price === "number" ? d.price : Number(d.price ?? 0),
        stock: typeof d.stock === "number" ? d.stock : Number(d.stock ?? 0),
        active: d.active !== false,
        imageUrls: Array.isArray(d.imageUrls) ? d.imageUrls : [],
        createdAt: d.createdAt ?? null,
        updatedAt: d.updatedAt ?? null,
      };
    });

    return noStoreJson({ items }, 200);
  } catch (err: any) {
    console.error("[GET /api/seller-products/list]", err);
    return noStoreJson({ error: err?.message ?? "Erro interno" }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}