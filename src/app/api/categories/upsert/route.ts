// src/app/api/categories/upsert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Category = {
  id?: string;
  name: string;
  code: string;           // slug/código único da categoria
  parentId?: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

function getErrMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return String(e);
  } catch {
    return "Erro desconhecido";
  }
}

async function requireUserUid(req: NextRequest): Promise<string> {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) throw new Error("Sem token de autenticação.");

  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
}

function validatePayload(input: unknown): Category {
  if (!input || typeof input !== "object") throw new Error("Body inválido.");
  const data = input as Record<string, unknown>;

  const name = String(data.name ?? "").trim();
  const codeRaw = String(data.code ?? "").trim();
  const parentId =
    data.parentId === null || data.parentId === undefined
      ? null
      : String(data.parentId);
  const active =
    typeof data.active === "boolean"
      ? data.active
      : String(data.active ?? "true").toLowerCase() !== "false";

  if (!name) throw new Error('Campo "name" obrigatório.');
  if (!codeRaw) throw new Error('Campo "code" obrigatório.');

  // normaliza code (slug seguro)
  const code = codeRaw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  if (!code) throw new Error('Campo "code" inválido.');

  return { name, code, parentId, active };
}

export async function POST(req: NextRequest) {
  try {
    // valida auth (somente usuários logados podem upsert)
    await requireUserUid(req);

    const payload = await req.json().catch(() => ({}));
    const cat = validatePayload(payload);

    // chaveia por "code" como docId estável
    const now = new Date().toISOString();
    const ref = adminDb.collection("categories").doc(cat.code);

    const snap = await ref.get();
    if (snap.exists) {
      // update
      await ref.set(
        {
          name: cat.name,
          parentId: cat.parentId ?? null,
          active: cat.active,
          updatedAt: now,
        },
        { merge: true }
      );
    } else {
      // create
      await ref.set({
        name: cat.name,
        code: cat.code,
        parentId: cat.parentId ?? null,
        active: cat.active,
        createdAt: now,
        updatedAt: now,
      } as Category);
    }

    const saved = await ref.get();
    const data = saved.data() as Category | undefined;

    return NextResponse.json(
      { ok: true, item: { id: ref.id, ...(data ?? {}) } },
      { status: 200 }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrMsg(e) },
      { status: 400 }
    );
  }
}