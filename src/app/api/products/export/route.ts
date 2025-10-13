// src/app/api/products/export/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Product = {
  sku: string;
  name: string;
  unit?: string;
  active?: boolean;
  price?: number;
  stock?: number;
  images?: string[];
  [k: string]: unknown;
};

function asRecord(u: unknown): Record<string, unknown> {
  return u && typeof u === "object" ? (u as Record<string, unknown>) : {};
}
function toProduct(id: string, raw: Record<string, unknown>): Product {
  return {
    sku: String(raw.sku ?? id),
    name: String(raw.name ?? ""),
    unit: typeof raw.unit === "string" ? raw.unit : "un",
    active: typeof raw.active === "boolean" ? raw.active : true,
    price: typeof raw.price === "number" ? raw.price : undefined,
    stock: typeof raw.stock === "number" ? raw.stock : undefined,
    images: Array.isArray(raw.images)
      ? (raw.images.filter((x) => typeof x === "string") as string[])
      : undefined,
    ...raw,
  };
}
function csvEscape(s: string) {
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * GET /api/products/export
 * Query params:
 *  - limit: número de itens (default 1000, máx 5000)
 *  - active: "true" | "false" | omitido
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limitParam = Number(url.searchParams.get("limit") ?? "1000");
    const activeParam = url.searchParams.get("active");

    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 5000) : 1000;

    let q = adminDb.collection("products").orderBy("updatedAt", "desc");
    if (activeParam === "true") q = q.where("active", "==", true);
    if (activeParam === "false") q = q.where("active", "==", false);

    const snap = await q.limit(limit).get();
    const rows: Product[] = [];
    snap.forEach((doc) => rows.push(toProduct(doc.id, asRecord(doc.data()))));

    const header = ["SKU", "Nome", "Preco", "Estoque", "Ativo", "Unidade", "Imagens"].join(",");
    const lines = rows.map((p) => {
      const preco = typeof p.price === "number" ? p.price.toFixed(2) : "0.00";
      const estoque = typeof p.stock === "number" ? String(p.stock) : "0";
      const ativo = p.active ? "true" : "false";
      const unit = p.unit || "un";
      const images = (p.images || []).join(" ");
      return [
        csvEscape(p.sku),
        csvEscape(p.name),
        csvEscape(preco),
        csvEscape(estoque),
        csvEscape(ativo),
        csvEscape(unit),
        csvEscape(images),
      ].join(",");
    });

    const csv = "\uFEFF" + [header, ...lines].join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="products_export.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store",
    },
  });
}