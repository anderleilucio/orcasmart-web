// src/app/api/products/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Product = {
  sku: string;
  name: string;
  categoryCode?: string | null;
  prefix?: string | null;
  unit?: string;
  active?: boolean;
  price?: number;
  stock?: number;
  images?: string[];
  ownerId?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  [k: string]: unknown;
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
      ? (raw.images.filter((x) => typeof x === "string") as string[])
      : undefined,
    ownerId: (raw.ownerId as string | null) ?? null,
    createdAt: (raw.createdAt as Date | string | undefined) ?? undefined,
    updatedAt: (raw.updatedAt as Date | string | undefined) ?? undefined,
    ...raw,
  };
}
function sanitizeUpsert(body: Record<string, unknown>): Partial<Product> & { sku?: string; name?: string } {
  const p: Partial<Product> & { sku?: string; name?: string } = {};
  if (typeof body.sku === "string") p.sku = body.sku.trim();
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

/**
 * GET /api/products
 * Query params:
 *  - q: busca por prefixo/exato em sku ou case-insensitive em name (filtro em memória após query simples)
 *  - category: categoryCode
 *  - active: "true" | "false"
 *  - limit: default 50 (máx 200)
 *  - order: "name" | "sku" | "updatedAt" (default "updatedAt")
 *  - dir: "asc" | "desc" (default "desc")
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const category = url.searchParams.get("category");
    const activeParam = url.searchParams.get("active");
    const order = (url.searchParams.get("order") || "updatedAt").toLowerCase();
    const dir = (url.searchParams.get("dir") || "desc").toLowerCase();
    const limitParam = Number(url.searchParams.get("limit") ?? "50");

    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
    const orderField = order === "name" ? "name" : order === "sku" ? "sku" : "updatedAt";
    const orderDir: "asc" | "desc" = dir === "asc" ? "asc" : "desc";

    let query = adminDb.collection("products").orderBy(orderField, orderDir);

    if (category) {
      query = query.where("categoryCode", "==", category);
    }
    if (activeParam === "true") query = query.where("active", "==", true);
    if (activeParam === "false") query = query.where("active", "==", false);

    const snap = await query.limit(limit).get();
    let items: Product[] = [];
    snap.forEach((doc) => {
      items.push(toProduct(doc.id, asRecord(doc.data())));
    });

    // filtro de busca leve em memória (para q pequeno)
    if (q) {
      const nq = q.toLowerCase();
      items = items.filter(
        (p) =>
          p.sku.toLowerCase().includes(nq) ||
          (typeof p.name === "string" && p.name.toLowerCase().includes(nq))
      );
    }

    return NextResponse.json(
      { ok: true, count: items.length, items },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: errMsg(e) },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/**
 * POST /api/products
 * Body JSON (mínimo): { sku: string, name: string, ...campos opcionais }
 * Se o doc já existir, faz merge (upsert).
 */
export async function POST(req: NextRequest) {
  try {
    const bodyUnknown = await req.json().catch(() => ({}));
    if (!bodyUnknown || typeof bodyUnknown !== "object") {
      return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
    }
    const patch = sanitizeUpsert(asRecord(bodyUnknown));
    const sku = typeof patch.sku === "string" ? patch.sku.trim() : "";
    const name = typeof patch.name === "string" ? patch.name.trim() : "";

    if (!sku || !name) {
      return NextResponse.json(
        { ok: false, error: "Campos 'sku' e 'name' são obrigatórios" },
        { status: 400 }
      );
    }

    const now = new Date();
    const docRef = adminDb.collection("products").doc(sku);
    await docRef.set(
      {
        ...patch,
        sku,
        name,
        updatedAt: now,
        createdAt: now, // permanece se já existir
      },
      { merge: true }
    );

    const fresh = await docRef.get();
    const data = toProduct(fresh.id, asRecord(fresh.data()));
    return NextResponse.json({ ok: true, item: data }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: errMsg(e) },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
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