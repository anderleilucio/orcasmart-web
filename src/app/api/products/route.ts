// src/app/api/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import * as admin from "firebase-admin";
import { finalizeCategoryAndSku } from "@/lib/catalog/finalizeCategory";

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

// -------------------- categorias do usuário --------------------
function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function slugifyLabel(label: string) {
  return norm(label).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
async function loadUserCategories(uid: string) {
  const snap = await adminDb
    .collection("catalog_categories")
    .where("ownerId", "==", uid)
    .get();

  const cats = snap.docs.map((d) => {
    const c = d.data() as any;
    const label = String(c.label || "");
    const slug = c.slug ? String(c.slug) : slugifyLabel(label);
    const prefix = String(c.prefix || "").toUpperCase();
    return { id: d.id, slug, prefix };
  });

  const prefixToSlug: Record<string, string> = {};
  const slugToPrefix: Record<string, string> = {};
  for (const c of cats) {
    if (c.prefix) prefixToSlug[c.prefix] = c.slug;
    if (c.slug) slugToPrefix[c.slug] = c.prefix;
  }
  return { cats, prefixToSlug, slugToPrefix };
}

function extractPrefixFromSku(sku: string | null | undefined): string | null {
  const m = (sku || "").toUpperCase().match(/^([A-Z]{2,5})[-_]/);
  return m ? m[1] : null;
}
// ---------------------------------------------------------------

// Normaliza query param active
function parseActiveParam(v: string | null): boolean | null {
  if (!v) return null;
  const s = String(v).toLowerCase().trim();
  if (["true", "1", "yes", "y", "ativo", "active"].includes(s)) return true;
  if (["false", "0", "no", "n", "inativo", "inactive", "arquivado", "archived"].includes(s)) return false;
  return null;
}

/* ============================= IMAGENS ============================== */
const IMAGE_KEY_RE = /(image|imagem|imagens|foto|fotos|photo|url|urls|link|links)/i;
const URL_RE = /\bhttps?:\/\/[^\s"']+/gi;

function coerceToList(val: unknown): string[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val.flatMap(coerceToList);
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        return coerceToList(parsed);
      } catch {/* ignore */}
    }
    const out: string[] = [];
    const matches = trimmed.match(URL_RE);
    if (matches?.length) out.push(...matches);
    if (out.length === 0) {
      out.push(
        ...trimmed
          .split(/\r?\n|,|;|\||\s+/g)
          .filter((s) => s.startsWith("http://") || s.startsWith("https://"))
      );
    }
    return out;
  }
  if (typeof val === "object") {
    const collected: string[] = [];
    for (const v of Object.values(val as Record<string, unknown>)) {
      collected.push(...coerceToList(v));
    }
    return collected;
  }
  return [];
}

function normalizeImagesDeep(body: any): string[] {
  if (!body || typeof body !== "object") return [];
  const results: string[] = [];
  const stack: any[] = [body];
  const seen = new Set<any>();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    for (const [rawKey, value] of Object.entries(cur as Record<string, unknown>)) {
      const key = String(rawKey).toLowerCase();
      if (IMAGE_KEY_RE.test(key)) results.push(...coerceToList(value));
      if (value && typeof value === "object") stack.push(value);
    }
  }
  if (results.length === 0) results.push(...coerceToList(body));
  const clean = results
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter((u) => u && (u.startsWith("http://") || u.startsWith("https://")));
  return Array.from(new Set(clean));
}
/* ==================================================================== */

/** =============================== GET =============================== */
export async function GET(req: NextRequest) {
  try {
    const uid = await getUidFromHeader(req);
    const { searchParams } = new URL(req.url);

    const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit") || 20)));
    const startAfterMs = Number(searchParams.get("startAfter") || 0);
    const activeFilter = parseActiveParam(searchParams.get("active"));

    let q: FirebaseFirestore.Query = adminDb
      .collection("products")
      .where("ownerId", "==", uid);

    if (activeFilter !== null) q = q.where("active", "==", activeFilter);

    q = q.orderBy("createdAt", "desc").limit(limit);

    let snap: FirebaseFirestore.QuerySnapshot;
    let usedFallback = false;

    try {
      if (startAfterMs > 0) {
        q = q.startAfter(admin.firestore.Timestamp.fromMillis(startAfterMs));
      }
      snap = await q.get();
    } catch (err: any) {
      usedFallback = true;
      console.warn("[products GET] fallback sem orderBy createdAt:", err?.message);
      let fallback: FirebaseFirestore.Query = adminDb
        .collection("products")
        .where("ownerId", "==", uid);
      if (activeFilter !== null) fallback = fallback.where("active", "==", activeFilter);
      snap = await fallback.limit(limit).get();
    }

    const items = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        sku: data.sku ?? "",
        name: data.name ?? "",
        price: Number(data.price ?? 0),
        stock: Number(data.stock ?? 0),
        active: data.active !== false,
        images: Array.isArray(data.images) ? data.images : [],
        category: data.category ?? null,
        category_source: data.category_source ?? null,
        createdAt: data.createdAt?.toMillis?.() ?? null,
      };
    });

    let nextCursor: number | null = null;
    if (!usedFallback && snap.docs.length === limit) {
      const last = snap.docs[snap.docs.length - 1];
      const lastTs = last?.get("createdAt");
      const ms = typeof lastTs?.toMillis === "function" ? lastTs.toMillis() : null;
      nextCursor = typeof ms === "number" ? ms : null;
    }

    return json({ items, nextCursor });
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") return json({ error: "Usuário não autenticado" }, 401);
    console.error("[products GET] erro:", e);
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
}

/** =============================== POST =============================== */
export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromHeader(req);
    const body = await req.json().catch(() => ({}));

    // 1) helper consolidado (mantido)
    let { sku: finalSku, category, category_source } = finalizeCategoryAndSku({
      sku: typeof body.sku === "string" ? body.sku.trim() : "",
      name: typeof body.name === "string" ? body.name.trim() : "",
      category: typeof body.category === "string" ? body.category : null,
    });

    // 2) Alinha com CATEGORIAS DO USUÁRIO (prefixo e slug)
    const { prefixToSlug, slugToPrefix } = await loadUserCategories(uid);

    // 2a) Se SKU tiver prefixo que exista nas categorias do usuário, usa a categoria correspondente
    const pfx = extractPrefixFromSku(finalSku || body.sku);
    if (!category && pfx && prefixToSlug[pfx]) {
      category = prefixToSlug[pfx];
      category_source = "prefix";
      if (!finalSku) finalSku = `${pfx}-`;
    }

    // 2b) Se veio "category" (slug) mas SKU ainda vazio, respeita o prefixo daquela categoria
    if (category && !finalSku) {
      const pref = slugToPrefix[category];
      if (pref) finalSku = `${pref}-`;
    }

    const doc: any = {
      ownerId: uid,
      sku: finalSku,
      name: typeof body.name === "string" ? body.name.trim() : "",
      price: body.price !== undefined ? Number(body.price) : 0,
      stock: body.stock !== undefined ? Number(body.stock) : 0,
      active: typeof body.active === "boolean" ? body.active : true,
      images: normalizeImagesDeep(body),
      category: category ?? null,
      category_source,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!doc.name) return json({ error: "Nome é obrigatório" }, 400);

    const ref = await adminDb.collection("products").add(doc);
    const data = (await ref.get()).data() as any;

    return json(
      {
        id: ref.id,
        sku: data.sku ?? "",
        name: data.name ?? "",
        price: Number(data.price ?? 0),
        stock: Number(data.stock ?? 0),
        active: data.active !== false,
        images: Array.isArray(data.images) ? data.images : [],
        category: data.category ?? null,
        category_source: data.category_source ?? null,
        createdAt: data.createdAt?.toMillis?.() ?? null,
      },
      201
    );
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") return json({ error: "Usuário não autenticado" }, 401);
    console.error("[products POST] erro:", e);
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
}

/** =============================== PUT =============================== */
export async function PUT(req: NextRequest) {
  try {
    const uid = await getUidFromHeader(req);
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return json({ error: "ID é obrigatório" }, 400);

    // 1) helper consolidado (mantido)
    let { sku: finalSku, category, category_source } = finalizeCategoryAndSku({
      sku: typeof body.sku === "string" ? body.sku.trim() : "",
      name: typeof body.name === "string" ? body.name.trim() : "",
      category: typeof body.category === "string" ? body.category : null,
    });

    // 2) Reconciliar com as CATEGORIAS DO USUÁRIO
    const { prefixToSlug, slugToPrefix } = await loadUserCategories(uid);

    const pfx = extractPrefixFromSku(finalSku || body.sku);
    if (!category && pfx && prefixToSlug[pfx]) {
      category = prefixToSlug[pfx];
      category_source = "prefix";
    }
    if (category && !finalSku) {
      const pref = slugToPrefix[category];
      if (pref) finalSku = `${pref}-`;
    }

    const patch: any = {
      ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
      ...(body.price !== undefined ? { price: Number(body.price) } : {}),
      ...(body.stock !== undefined ? { stock: Number(body.stock) } : {}),
      ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
      ...(body.images !== undefined ? { images: normalizeImagesDeep(body) } : {}),
      ...(finalSku !== undefined ? { sku: finalSku } : {}),
      category: category ?? null,
      category_source,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ownerId: uid,
    };

    await adminDb.collection("products").doc(id).set(patch, { merge: true });
    const data = (await adminDb.collection("products").doc(id).get()).data() as any;

    return json(
      {
        id,
        sku: data.sku ?? "",
        name: data.name ?? "",
        price: Number(data.price ?? 0),
        stock: Number(data.stock ?? 0),
        active: data.active !== false,
        images: Array.isArray(data.images) ? data.images : [],
        category: data.category ?? null,
        category_source: data.category_source ?? null,
        createdAt: data.createdAt?.toMillis?.() ?? null,
      },
      200
    );
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") return json({ error: "Usuário não autenticado" }, 401);
    console.error("[products PUT] erro:", e);
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
}

/** =============================== DELETE =============================== */
export async function DELETE(req: NextRequest) {
  try {
    const uid = await getUidFromHeader(req);
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") || "").trim();
    if (!id) return json({ error: "ID é obrigatório" }, 400);

    const ref = adminDb.collection("products").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return json({ error: "Produto não encontrado" }, 404);
    if ((snap.data() as any)?.ownerId !== uid) return json({ error: "Proibido" }, 403);

    await ref.delete();
    return json({ ok: true });
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") return json({ error: "Usuário não autenticado" }, 401);
    console.error("[products DELETE] erro:", e);
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
}