import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------------- utils ---------------- */
function noStore(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function toBool(v: any, def = true): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (["false","0","nao","não","no","n","inativo","inactive"].includes(s)) return false;
  if (["true","1","sim","yes","y","ativo","active"].includes(s)) return true;
  return def;
}

function toNumber(v: any, def = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const str = String(v ?? "").trim();
  if (!str) return def;
  let t = str.replace(/\s+/g, "");
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : def;
}

function toInt(v: any, def = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  const s = String(v ?? "").trim().replace(/[.,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

/** Lê campos de imagem de vários nomes/formatos. */
function parseImages(src: any): { image?: string; imageUrls?: string[] } {
  const candidate =
    src?.imageUrls ?? src?.imageurls ??
    src?.imagens ?? src?.images ??
    src?.imagem ?? src?.image ?? src?.imageUrl ?? "";

  const list = Array.isArray(candidate)
    ? candidate
    : String(candidate ?? "")
        .split(/\n|;|,|\|/g)
        .map((s) => s.trim())
        .filter(Boolean);

  const imageUrls = Array.from(new Set(list)).map(String);
  if (!imageUrls.length) return {}; // <<< importante: não retornar vazio (evita sobrescrever)
  return { image: imageUrls[0], imageUrls };
}

/** Converte um row do CSV/JSON para formato comum */
function normalizeRow(raw: any) {
  const sku = String(raw.sku ?? raw.SKU ?? raw.Sku ?? "").trim();
  const name = String(raw.name ?? raw.nome ?? raw.Nome ?? "").trim();

  const price = toNumber(raw.preco ?? raw["Preço"] ?? raw.Preco ?? raw.price ?? raw.Price, 0);
  const stock = toInt(raw.estoque ?? raw.Estoque ?? raw.stock ?? raw.Stock, 0);
  const active = toBool(raw.ativo ?? raw.Active ?? raw.active, true);
  const unit = (String(raw.unidade ?? raw.Unidade ?? raw.unit ?? raw.Unit ?? "un").trim() || "un");

  let categoryCode = raw.categoryCode ?? raw.category ?? raw.categoria ?? null;
  if (typeof categoryCode === "string") categoryCode = categoryCode.trim();
  if (!categoryCode || categoryCode === "-") categoryCode = null;

  // pode vir em qualquer chave (inclui imageUrls)
  const images = parseImages(raw);

  return { sku, name, price, stock, active, unit, categoryCode, ...images };
}

/** chunks para batch */
function chunk<T>(arr: T[], size = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ---------------- handler ---------------- */
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    // 1) Auth via Bearer
    const authHeader = req.headers.get("authorization") || "";
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!m) return noStore({ ok: false, error: "Não autenticado (Bearer ausente)." }, 401);

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(m[1]);
    } catch {
      return noStore({ ok: false, error: "Token inválido." }, 401);
    }
    const sellerId: string = decoded.uid;
    if (!sellerId) return noStore({ ok: false, error: "UID inválido." }, 401);

    // 2) Body
    const body = await req.json().catch(() => ({}));
    const listRaw: any[] =
      Array.isArray(body.items) ? body.items :
      Array.isArray(body.products) ? body.products :
      Array.isArray(body.rows) ? body.rows : [];

    if (!listRaw.length) {
      return noStore({ ok: false, error: "Nenhum item para importar." }, 400);
    }

    // 3) Normalizar + validar
    const normalized = listRaw.map(normalizeRow).filter((x) => x.sku && x.name);
    if (!normalized.length) {
      return noStore({ ok: false, error: "Itens inválidos (SKU/Nome obrigatórios)." }, 400);
    }

    // 4) Upsert em products + espelho em seller_products
    const now = FieldValue.serverTimestamp();
    const productsCol = adminDb.collection("products");
    const sellerCol = adminDb.collection("seller_products");

    const docIds = normalized.map((p) => `${sellerId}__${p.sku}`);

    // existentes em /products
    const existingSnaps = await adminDb.getAll(...docIds.map((id) => productsCol.doc(id)));
    const existsMap = new Map<string, boolean>();
    existingSnaps.forEach((snap) => existsMap.set(snap.id, snap.exists));

    let totalCreated = 0;
    let totalUpdated = 0;

    const byId = new Map<string, typeof normalized[number]>();
    normalized.forEach((p, i) => byId.set(docIds[i], p));

    for (const idsChunk of chunk(docIds, 400)) {
      const batchProducts = adminDb.batch();
      const batchSeller = adminDb.batch();

      for (const id of idsChunk) {
        const p = byId.get(id)!;

        // base sem imagens
        const baseData: any = {
          sellerId,
          ownerId: sellerId,
          vendorUid: sellerId,
          sku: p.sku,
          name: p.name,
          categoryCode: p.categoryCode ?? null,
          price: Number(p.price ?? 0),
          stock: Number(p.stock ?? 0),
          active: p.active !== false,
          unit: p.unit,
          updatedAt: now as any,
        };

        // ✅ só aplica imagens se o CSV trouxer (não sobrescreve com vazio)
        if (p.imageUrls && p.imageUrls.length) {
          baseData.image = p.image ?? p.imageUrls[0];
          baseData.imageUrls = p.imageUrls;
        }

        const exists = existsMap.get(id);
        if (exists) totalUpdated++; else totalCreated++;

        const prodRef = productsCol.doc(id);
        const sellerRef = adminDb.collection("seller_products").doc(id);

        if (exists) {
          batchProducts.set(prodRef, baseData, { merge: true });
          batchSeller.set(sellerRef, baseData, { merge: true });
        } else {
          batchProducts.set(prodRef, { ...baseData, createdAt: now as any }, { merge: true });
          batchSeller.set(sellerRef, { ...baseData, createdAt: now as any }, { merge: true });
        }
      }

      await batchProducts.commit();
      await batchSeller.commit();
    }

    const durationMs = Date.now() - startedAt;

    // 5) Log
    await adminDb.collection("import_logs").add({
      sellerId,
      count_total: normalized.length,
      count_created: totalCreated,
      count_updated: totalUpdated,
      startedAt: FieldValue.serverTimestamp(),
      durationMs,
      source: "csv-web",
    });

    return noStore({
      ok: true,
      sellerId,
      summary: { total: normalized.length, created: totalCreated, updated: totalUpdated, skipped: 0 },
    });
  } catch (err: any) {
    return noStore({ ok: false, error: err?.message || "Erro interno" }, 500);
  }
}