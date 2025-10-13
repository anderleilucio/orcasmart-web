// src/app/api/catalog/rules/[id]/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { id: string };

type CatalogRule = {
  id: string;
  pattern: string;
  action: string;
  enabled: boolean;
  priority?: number;
  ownerId?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  // outros campos livres, mas SEM any:
  [key: string]: unknown;
};

type UpsertPayload = Partial<Omit<CatalogRule, "id" | "createdAt" | "updatedAt">>;

function getErrMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "Erro desconhecido";
  }
}

async function resolveParams(
  context: { params: Promise<Params> } | { params: Params }
): Promise<Params> {
  // compat: algumas versões tipam params como Promise
  const p = (context.params as Promise<Params> | Params);
  return p instanceof Promise ? p : p;
}

/* ========================= Handlers ========================= */

export async function GET(_req: NextRequest, context: { params: Promise<Params> }) {
  try {
    const { id } = await resolveParams(context);
    const ref = adminDb.collection("catalog_rules").doc(id);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Regra não encontrada" }, { status: 404 });
    }

    const data = snap.data() as Record<string, unknown>;
    const rule: CatalogRule = {
      id: snap.id,
      pattern: String(data.pattern ?? ""),
      action: String(data.action ?? ""),
      enabled: Boolean(data.enabled ?? true),
      priority: typeof data.priority === "number" ? data.priority : undefined,
      ownerId: (data.ownerId as string | null) ?? null,
      createdAt: (data.createdAt as string | Date | undefined) ?? undefined,
      updatedAt: (data.updatedAt as string | Date | undefined) ?? undefined,
      // mantém quaisquer outros campos:
      ...data,
    };

    return NextResponse.json({ ok: true, item: rule }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: getErrMsg(err) }, { status: 400 });
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<Params> }) {
  try {
    const { id } = await resolveParams(context);
    const bodyUnknown = await req.json().catch(() => ({}));
    if (!bodyUnknown || typeof bodyUnknown !== "object") {
      return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
    }
    const body = bodyUnknown as Record<string, unknown>;

    const payload: UpsertPayload = {};
    if (typeof body.pattern === "string") payload.pattern = body.pattern.trim();
    if (typeof body.action === "string") payload.action = body.action.trim();
    if (typeof body.enabled === "boolean") payload.enabled = body.enabled;
    if (typeof body.priority === "number") payload.priority = body.priority;
    if (typeof body.ownerId === "string") payload.ownerId = body.ownerId;

    if (!payload.pattern && !payload.action && payload.enabled === undefined && payload.priority === undefined && payload.ownerId === undefined) {
      return NextResponse.json({ ok: false, error: "Nada para atualizar" }, { status: 400 });
    }

    const now = new Date();
    await adminDb.collection("catalog_rules").doc(id).set(
      {
        ...payload,
        updatedAt: now,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, id }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: getErrMsg(err) }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<Params> }) {
  try {
    const { id } = await resolveParams(context);
    await adminDb.collection("catalog_rules").doc(id).delete();
    return NextResponse.json({ ok: true, id }, { status: 200 });
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