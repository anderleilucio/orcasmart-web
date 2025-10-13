// src/app/api/catalog/rules/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CatalogRule = {
  id: string;
  pattern: string;
  action: string;
  enabled: boolean;
  priority?: number;
  ownerId?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  [key: string]: unknown; // campos extras sem usar any
};

type CreatePayload = {
  pattern: string;
  action: string;
  enabled?: boolean;
  priority?: number;
  ownerId?: string | null;
};

function getErrMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  try { return String(err); } catch { return "Erro desconhecido"; }
}

/** GET /api/catalog/rules  (lista com filtros simples) */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ownerId = url.searchParams.get("ownerId");
    const onlyEnabled = url.searchParams.get("enabled");
    const limitParam = Number(url.searchParams.get("limit") ?? "200");
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 200;

    let q = adminDb.collection("catalog_rules");
    if (ownerId) q = q.where("ownerId", "==", ownerId);
    if (onlyEnabled === "true") q = q.where("enabled", "==", true);

    const snap = await q.limit(limit).get();

    const items: CatalogRule[] = [];
    snap.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      items.push({
        id: doc.id,
        pattern: String(data.pattern ?? ""),
        action: String(data.action ?? ""),
        enabled: Boolean(data.enabled ?? true),
        priority: typeof data.priority === "number" ? data.priority : undefined,
        ownerId: (data.ownerId as string | null) ?? null,
        createdAt: (data.createdAt as string | Date | undefined) ?? undefined,
        updatedAt: (data.updatedAt as string | Date | undefined) ?? undefined,
        ...data,
      });
    });

    return NextResponse.json({ ok: true, count: items.length, items }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: getErrMsg(err) }, { status: 400 });
  }
}

/** POST /api/catalog/rules  (cria uma regra) */
export async function POST(req: NextRequest) {
  try {
    const bodyUnknown = await req.json().catch(() => ({}));
    if (!bodyUnknown || typeof bodyUnknown !== "object") {
      return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
    }
    const b = bodyUnknown as Record<string, unknown>;

    const payload: CreatePayload = {
      pattern: typeof b.pattern === "string" ? b.pattern.trim() : "",
      action: typeof b.action === "string" ? b.action.trim() : "",
      enabled: typeof b.enabled === "boolean" ? b.enabled : true,
      priority: typeof b.priority === "number" ? b.priority : undefined,
      ownerId: typeof b.ownerId === "string" ? b.ownerId : null,
    };

    if (!payload.pattern || !payload.action) {
      return NextResponse.json({ ok: false, error: "Campos 'pattern' e 'action' são obrigatórios." }, { status: 400 });
    }

    const now = new Date();
    const ref = await adminDb.collection("catalog_rules").add({
      ...payload,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
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