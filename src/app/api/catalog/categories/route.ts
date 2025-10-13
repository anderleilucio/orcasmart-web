// src/app/api/catalog/categories/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Modelo tipado sem `any` (campos extras ficam como `unknown`) */
export type CatalogCategory = {
  code: string;               // identificador único
  name: string;               // nome exibido
  slug?: string;
  parentCode?: string | null; // relacionamento opcional
  position?: number;
  active?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  // Campos adicionais permanecem permitidos:
  [key: string]: unknown;
};

type CreateOrUpdatePayload = Partial<
  Omit<CatalogCategory, "code" | "createdAt" | "updatedAt">
> & { code?: string };

/** Util de erro tipado */
function getErrMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  try { return String(err); } catch { return "Erro desconhecido"; }
}

/** Normaliza partes opcionais do Firestore p/ nosso tipo */
function toCategory(id: string, data: Record<string, unknown>): CatalogCategory {
  return {
    code: String(data.code ?? id),
    name: String(data.name ?? ""),
    slug: typeof data.slug === "string" ? data.slug : undefined,
    parentCode: (data.parentCode as string | null) ?? null,
    position: typeof data.position === "number" ? data.position : undefined,
    active: typeof data.active === "boolean" ? data.active : true,
    createdAt: (data.createdAt as string | Date | undefined) ?? undefined,
    updatedAt: (data.updatedAt as string | Date | undefined) ?? undefined,
    ...data, // mantém campos extras como unknown
  };
}

/** GET /api/catalog/categories?parent=...&active=true&limit=200 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parent = url.searchParams.get("parent");
    const activeParam = url.searchParams.get("active");
    const limitParam = Number(url.searchParams.get("limit") ?? "500");
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 500;

    let q = adminDb.collection("catalog_categories");
    if (parent !== null && parent !== undefined) {
      // parent="" (raiz) ou parent="ABC"
      q = q.where("parentCode", "==", parent === "" ? null : parent);
    }
    if (activeParam === "true") q = q.where("active", "==", true);
    if (activeParam === "false") q = q.where("active", "==", false);

    const snap = await q.limit(limit).get();

    const items: CatalogCategory[] = [];
    snap.forEach((doc) => {
      const raw = doc.data() as Record<string, unknown>;
      items.push(toCategory(doc.id, raw));
    });

    return NextResponse.json(
      { ok: true, count: items.length, items },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrMsg(err) },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/** POST /api/catalog/categories  (cria ou atualiza) */
export async function POST(req: NextRequest) {
  try {
    const bodyUnknown = await req.json().catch(() => ({}));
    if (!bodyUnknown || typeof bodyUnknown !== "object") {
      return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
    }
    const b = bodyUnknown as Record<string, unknown>;

    const code = typeof b.code === "string" ? b.code.trim() : "";
    const name = typeof b.name === "string" ? b.name.trim() : "";
    const slug = typeof b.slug === "string" ? b.slug.trim() : undefined;
    const parentCode =
      typeof b.parentCode === "string" ? b.parentCode.trim() :
      b.parentCode === null ? null : undefined;
    const active =
      typeof b.active === "boolean" ? b.active : true;
    const position =
      typeof b.position === "number" ? b.position : undefined;

    if (!code) {
      return NextResponse.json({ ok: false, error: "Campo 'code' é obrigatório." }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ ok: false, error: "Campo 'name' é obrigatório." }, { status: 400 });
    }

    const now = new Date();
    const ref = adminDb.collection("catalog_categories").doc(code);

    await ref.set(
      {
        code,
        name,
        slug,
        parentCode: parentCode ?? null,
        active,
        position,
        updatedAt: now,
        // createdAt só na criação (merge mantém se já existir)
        createdAt: now,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, code }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: getErrMsg(err) }, { status: 400 });
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