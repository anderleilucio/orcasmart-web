// src/app/api/products/[id]/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Product = {
  sku: string;                 // id do doc = sku
  name: string;
  categoryCode?: string | null;
  prefix?: string | null;
  unit?: string;
  active?: boolean;
  price?: number;              // opcional
  stock?: number;              // opcional
  images?: string[];           // urls
  ownerId?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  [k: string]: unknown;        // campos extras permanecem
};

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Erro desconhecido";
}
function asRecord(u: unknown): Record<string, unknown> {
  return u && typeof u === "object" ? (u as Record<string, unknown>) : {};
}
function toProduct(id: string, raw: Record<string, unknown>): Product {
  return {
    sku: String(raw.sku ?? id),
    name: String(raw.name ?? ""),
    categoryCode: (raw.categoryCode as string | null) ?? null,
    prefix: (raw.prefix as string | null) ?? null,
    unit: typeof raw.unit === "string" ? raw.unit : "un",
    active: typeof raw.active === "boolean" ? raw.active : true,
    price: typeof raw.price === "number" ? raw.price : undefined,
    stock: typeof raw.stock === "number" ? raw.stock : undefined,
    images: Array.isArray(raw.images)
      ? raw.images.filter((x) => typeof x === "string") as string[]
      : undefined,
    ownerId: (raw.ownerId as string | null) ?? null,
    createdAt: (raw.createdAt as Date | string | undefined) ?? undefined,
    updatedAt: (raw.updatedAt as Date | string | undefined) ?? undefined,
    ...raw,
  };
}
function sanitizeUpdate(body: Record<string, unknown>): Partial<Product> {
  const p: Partial<Product> = {};
  if (typeof body.name === "string") p.name = body.name.trim();
  if (typeof body.categoryCode === "string" || body.categoryCode === null) p.categoryCode = body.categoryCode ?? null;
  if (typeof body.prefix === "string" || body.prefix === null) p.prefix = body.prefix ?? null;
  if (typeof body.unit === "string") p.unit = body.unit;
  if (typeof body.active === "boolean") p.active = body.active;
  if (typeof body.price === "number" && Number.isFinite(body.price)) p.price = body.price;
  if (typeof body.stock === "number" && Number.isFinite(body.stock)) p.stock = body.stock;
  if (Array.isArray(body.images)) p.images = body.images.filter((x) => typeof x === "string") as string[];
  if (typeof body.ownerId === "string" || body.ownerId === null) p.ownerId = body.ownerId ?? null;
  return p;
}

/** GET /api/products/[id] */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const doc = await adminDb.collection("products").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ ok: false, error: "Produto não encontrado" }, { status: 404 });
    }
    const data = toProduct(doc.id, asRecord(doc.data()));
    return NextResponse.json({ ok: true, item: data }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errMsg(e) }, { status: 400 });
  }
}

/** PUT /api/products/[id]  (parcial) */
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const bodyUnknown = await req.json().catch(() => ({}));
    if (!bodyUnknown || typeof bodyUnknown !== "object") {
      return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
    }
    const patch = sanitizeUpdate(asRecord(bodyUnknown));
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "Nada para atualizar" }, { status: 400 });
    }
    patch.updatedAt = new Date();

    await adminDb.collection("products").doc(id).set(patch, { merge: true });

    const fresh = await adminDb.collection("products").doc(id).get();
    const data = toProduct(fresh.id, asRecord(fresh.data()));
    return NextResponse.json({ ok: true, item: data }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errMsg(e) }, { status: 400 });
  }
}

/** DELETE /api/products/[id] */
export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await adminDb.collection("products").doc(id).delete();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errMsg(e) }, { status: 400 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store",
    },
  });
}