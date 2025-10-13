// src/app/api/categories/list/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CatalogCategory = {
  code: string;
  name: string;
  slug?: string;
  parentCode?: string | null;
  position?: number;
  active?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  [k: string]: unknown;
};

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Erro desconhecido";
}

function toCategory(id: string, raw: Record<string, unknown>): CatalogCategory {
  return {
    code: String(raw.code ?? id),
    name: String(raw.name ?? ""),
    slug: typeof raw.slug === "string" ? raw.slug : undefined,
    parentCode: (raw.parentCode as string | null) ?? null,
    position: typeof raw.position === "number" ? raw.position : undefined,
    active: typeof raw.active === "boolean" ? raw.active : true,
    createdAt: (raw.createdAt as string | Date | undefined) ?? undefined,
    updatedAt: (raw.updatedAt as string | Date | undefined) ?? undefined,
    ...raw,
  };
}

/**
 * GET /api/categories/list
 * Query params:
 *  - parent: string | "" (raiz) | omitido (todos)
 *  - active: "true" | "false" | omitido
 *  - limit: number (default 500, máx 1000)
 *  - order: "position" | "name" (default "position")
 *  - dir: "asc" | "desc" (default "asc")
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parent = url.searchParams.get("parent");
    const activeParam = url.searchParams.get("active");
    const limitParam = Number(url.searchParams.get("limit") ?? "500");
    const order = (url.searchParams.get("order") || "position").toLowerCase();
    const dir = (url.searchParams.get("dir") || "asc").toLowerCase();

    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 500;
    const orderField = order === "name" ? "name" : "position";
    const orderDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";

    let q = adminDb.collection("catalog_categories").orderBy(orderField, orderDir);

    if (parent !== null && parent !== undefined) {
      q = q.where("parentCode", "==", parent === "" ? null : parent);
    }
    if (activeParam === "true") q = q.where("active", "==", true);
    if (activeParam === "false") q = q.where("active", "==", false);

    const snap = await q.limit(limit).get();
    const items: CatalogCategory[] = [];
    snap.forEach((doc) => {
      items.push(toCategory(doc.id, doc.data() as Record<string, unknown>));
    });

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