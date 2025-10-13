// src/app/api/catalog/rules/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import * as admin from "firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function getUidFromHeader(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("NO_TOKEN");
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
}

type RuleInput = {
  id?: string;              // opcional para update (merge)
  category: string;         // slug: "eletrica" | "hidraulica" | ...
  terms: string[];          // aliases: ["cabo", "cabo 3mm", ...]
  priority?: number;        // maior = prioridade maior
  active?: boolean;         // default: true
};

function sanitizeRuleInput(raw: any): RuleInput {
  const category = typeof raw?.category === "string" ? raw.category.trim() : "";
  const terms = Array.isArray(raw?.terms)
    ? raw.terms
        .map((t: any) => (typeof t === "string" ? t.trim() : ""))
        .filter(Boolean)
    : [];
  const priority =
    raw?.priority === 0 || Number.isFinite(Number(raw?.priority))
      ? Number(raw.priority)
      : undefined;
  const active =
    typeof raw?.active === "boolean" ? raw.active : true;

  const id = typeof raw?.id === "string" ? raw.id.trim() : undefined;

  return { id, category, terms, priority, active };
}

// GET /api/catalog/rules  -> lista regras do usuário
export async function GET(req: NextRequest) {
  try {
    const uid = await getUidFromHeader(req);

    const snap = await adminDb
      .collection("catalog_rules")
      .where("ownerId", "==", uid)
      .orderBy("updatedAt", "desc")
      .get();

    const items = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
      updatedAt: d.get("updatedAt")?.toMillis?.() ?? null,
    }));

    return json({ items });
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") return json({ error: "Usuário não autenticado" }, 401);
    console.error("[catalog/rules GET] erro:", e);
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
}

// POST /api/catalog/rules  -> cria ou atualiza (merge) UMA regra
export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromHeader(req);
    const body = await req.json().catch(() => ({}));
    const input = sanitizeRuleInput(body);

    if (!input.category) return json({ error: "category é obrigatório" }, 400);
    if (!input.terms?.length) return json({ error: "terms deve ter ao menos 1 termo" }, 400);

    const payload = {
      ownerId: uid,
      category: input.category,
      terms: input.terms,
      priority: input.priority ?? 0,
      active: input.active !== false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // createdAt setado na criação (ver abaixo)
    };

    let id = input.id?.trim();
    if (id) {
      // update (merge)
      await adminDb.collection("catalog_rules").doc(id).set(payload, { merge: true });
    } else {
      // create
      const ref = await adminDb.collection("catalog_rules").add({
        ...payload,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      id = ref.id;
    }

    const snap = await adminDb.collection("catalog_rules").doc(id!).get();
    const data = snap.data() as any;

    return json({
      id,
      ...data,
      createdAt: data?.createdAt?.toMillis?.() ?? null,
      updatedAt: data?.updatedAt?.toMillis?.() ?? null,
    }, 201);
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") return json({ error: "Usuário não autenticado" }, 401);
    console.error("[catalog/rules POST] erro:", e);
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
}