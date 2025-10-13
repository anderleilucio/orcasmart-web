// src/app/api/categories/import/route.ts
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
  [k: string]: unknown; // campos extras ficam como unknown
};

type ImportJsonBody =
  | { items: Array<Partial<CatalogCategory>> }
  | { items: string }; // CSV com cabeçalho

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Erro desconhecido";
}

function parseBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return undefined;
}

function parseNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function fromCsv(csv: string): Array<Partial<CatalogCategory>> {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const header = lines[0].split(",").map((h) => h.trim());
  const items: Array<Partial<CatalogCategory>> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(","); // simples (sem aspas escapadas)
    const rec: Record<string, unknown> = {};
    header.forEach((key, idx) => {
      rec[key] = (cols[idx] ?? "").trim();
    });

    items.push({
      code: typeof rec.code === "string" ? rec.code : undefined,
      name: typeof rec.name === "string" ? rec.name : undefined,
      slug: typeof rec.slug === "string" ? rec.slug : undefined,
      parentCode:
        rec.parentCode === "" ? null :
        typeof rec.parentCode === "string" ? rec.parentCode : undefined,
      position: parseNum(rec.position),
      active: parseBool(rec.active),
    });
  }
  return items;
}

/** POST /api/categories/import */
export async function POST(req: NextRequest) {
  try {
    const bodyUnknown = await req.json().catch(() => ({}));
    if (!bodyUnknown || typeof bodyUnknown !== "object") {
      return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
    }

    const b = bodyUnknown as ImportJsonBody;
    let items: Array<Partial<CatalogCategory>> = [];

    if ("items" in b) {
      if (typeof b.items === "string") {
        items = fromCsv(b.items);
      } else if (Array.isArray(b.items)) {
        items = b.items;
      }
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: "Nada para importar (items vazio)" }, { status: 400 });
    }

    // validação mínima + normalização
    const now = new Date();
    const batch = adminDb.batch();
    const accepted: string[] = [];
    const rejected: Array<{ index: number; error: string }> = [];

    items.forEach((raw, index) => {
      const code = typeof raw.code === "string" ? raw.code.trim() : "";
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      if (!code || !name) {
        rejected.push({ index, error: "Campos 'code' e 'name' são obrigatórios" });
        return;
      }

      const docRef = adminDb.collection("catalog_categories").doc(code);
      const patch: CatalogCategory = {
        code,
        name,
        slug: typeof raw.slug === "string" ? raw.slug.trim() : undefined,
        parentCode:
          raw.parentCode === null ? null :
          typeof raw.parentCode === "string" ? raw.parentCode.trim() : undefined,
        position: parseNum(raw.position),
        active: parseBool(raw.active) ?? true,
        updatedAt: now,
        createdAt: now, // permanece como estava se existir (merge)
      };

      batch.set(docRef, patch, { merge: true });
      accepted.push(code);
    });

    if (accepted.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Nenhum item válido para importar", rejected },
        { status: 400 }
      );
    }

    await batch.commit();

    return NextResponse.json(
      { ok: true, imported: accepted.length, codes: accepted, rejected },
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store",
    },
  });
}