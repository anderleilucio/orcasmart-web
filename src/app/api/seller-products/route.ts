// src/app/api/seller-products/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SellerProduct = {
  id?: string;          // id do doc (conveniência)
  sellerId: string;     // dono
  productSku: string;   // SKU do produto base
  price?: number;
  stock?: number;
  active?: boolean;
  images?: string[];
  createdAt?: Date;
  updatedAt?: Date;
  [k: string]: unknown; // campos extras opcionais
};

function asRecord(u: unknown): Record<string, unknown> {
  return u && typeof u === "object" ? (u as Record<string, unknown>) : {};
}

function toNumber(u: unknown, fallback = 0): number {
  return typeof u === "number" && Number.isFinite(u) ? u : fallback;
}

function toString(u: unknown, fallback = ""): string {
  return typeof u === "string" ? u : fallback;
}

function toBool(u: unknown, fallback = true): boolean {
  return typeof u === "boolean" ? u : fallback;
}

function toStringArray(u: unknown): string[] {
  if (!Array.isArray(u)) return [];
  return u.filter((x) => typeof x === "string") as string[];
}

function toSellerProduct(id: string, raw: Record<string, unknown>): SellerProduct {
  return {
    id,
    sellerId: toString(raw.sellerId),
    productSku: toString(raw.productSku),
    price: typeof raw.price === "number" ? raw.price : undefined,
    stock: typeof raw.stock === "number" ? raw.stock : undefined,
    active: typeof raw.active === "boolean" ? raw.active : undefined,
    images: toStringArray(raw.images),
    createdAt: raw.createdAt instanceof Date ? raw.createdAt : undefined,
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt : undefined,
    ...raw,
  };
}

/**
 * GET /api/seller-products?sellerId=...&limit=...&offset=...
 *  - Filtra por sellerId (obrigatório para evitar varrer a coleção inteira)
 *  - Paginação simples por limit/offset (ordenando por updatedAt desc)
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sellerId = url.searchParams.get("sellerId") ?? "";
    if (!sellerId) {
      return NextResponse.json({ error: "sellerId é obrigatório" }, { status: 400 });
    }

    const limitParam = Number(url.searchParams.get("limit") ?? "50");
    const offsetParam = Number(url.searchParams.get("offset") ?? "0");
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

    let q = adminDb
      .collection("sellerProducts")
      .where("sellerId", "==", sellerId)
      .orderBy("updatedAt", "desc");

    // Firestore não tem offset eficiente, mas para simplicidade:
    const snap = await q.limit(limit + offset).get();

    const items: SellerProduct[] = [];
    let idx = 0;
    snap.forEach((doc) => {
      if (idx++ < offset) return;
      items.push(toSellerProduct(doc.id, asRecord(doc.data())));
    });

    return NextResponse.json(
      { items, count: items.length },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/seller-products
 * body: { sellerId: string, productSku: string, price?: number, stock?: number, active?: boolean, images?: string[] }
 *  - Upsert por (sellerId + productSku) usando docId = `${sellerId}_${productSku}`
 */
export async function POST(req: NextRequest) {
  try {
    const bodyUnknown = await req.json().catch(() => ({}));
    const body = asRecord(bodyUnknown);

    const sellerId = toString(body.sellerId);
    const productSku = toString(body.productSku);
    if (!sellerId || !productSku) {
      return NextResponse.json(
        { error: "sellerId e productSku são obrigatórios" },
        { status: 400 }
      );
    }

    const price = body.price === undefined ? undefined : toNumber(body.price);
    const stock = body.stock === undefined ? undefined : toNumber(body.stock);
    const active = body.active === undefined ? undefined : toBool(body.active);
    const images = toStringArray(body.images);

    const now = new Date();
    const docId = `${sellerId}_${productSku}`;
    const ref = adminDb.collection("sellerProducts").doc(docId);

    await ref.set(
      {
        sellerId,
        productSku,
        ...(price !== undefined ? { price } : {}),
        ...(stock !== undefined ? { stock } : {}),
        ...(active !== undefined ? { active } : {}),
        ...(images.length ? { images } : {}),
        updatedAt: now,
        createdAt: (await ref.get()).exists ? undefined : now,
      },
      { merge: true }
    );

    const finalSnap = await ref.get();
    const data = toSellerProduct(finalSnap.id, asRecord(finalSnap.data()));

    return NextResponse.json({ ok: true, item: data }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store",
    },
  });
}