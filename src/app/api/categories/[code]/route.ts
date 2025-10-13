// src/app/api/categories/[code]/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { code: string };

type CatalogCategory = {
  code: string;
  name: string;
  slug?: string;
  parentCode?: string | null;
  position?: number;
  active?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  [key: string]: unknown; // sem any
};

function getErrMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  try { return String(err); } catch { return "Erro desconhecido"; }
}

async function resolveParams(
  ctx: { params: Promise<Params> } | { params: Params }
): Promise<Params> {
  const p = ctx.params as Promise<Params> | Params;
  return p instanceof Promise ? p : p;
}

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
    ...data,
  };
}

/** GET /api/categories/[code] */
export async function GET(_req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    const { code } = await resolveParams(ctx);
    const ref = adminDb.collection("catalog_categories").doc(code);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Categoria não encontrada" }, { status: 404 });
    }

    const cat = toCategory(snap.id, snap.data() as Record<string, unknown>);
    return NextResponse.json({ ok: true, item: cat }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: getErrMsg(err) }, { status: 400 });
  }
}

/** PUT /api/categories/[code]  (atualiza campos permitidos) */
export async function PUT(req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    const { code } = await resolveParams(ctx);
    const bodyUnknown = await req.json().catch(() => ({}));
    if (!bodyUnknown || typeof bodyUnknown !== "object") {
      return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
    }
    const b = bodyUnknown as Record<string, unknown>;

    const patch: Partial<CatalogCategory> = {};
    if (typeof b.name === "string") patch.name = b.name.trim();
    if (typeof b.slug === "string") patch.slug = b.slug.trim();
    if (typeof b.parentCode === "string") patch.parentCode = b.parentCode.trim();
    if (b.parentCode === null) patch.parentCode = null;
    if (typeof b.position === "number") patch.position = b.position;
    if (typeof b.active === "boolean") patch.active = b.active;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "Nada para atualizar" }, { status: 400 });
    }

    const now = new Date();
    await adminDb.collection("catalog_categories").doc(code).set(
      { ...patch, updatedAt: now, code },
      { merge: true }
    );

    return NextResponse.json({ ok: true, code }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: getErrMsg(err) }, { status: 400 });
  }
}

/** DELETE /api/categories/[code] */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    const { code } = await resolveParams(ctx);
    await adminDb.collection("catalog_categories").doc(code).delete();
    return NextResponse.json({ ok: true, code }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: getErrMsg(err) }, { status: 400 });
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