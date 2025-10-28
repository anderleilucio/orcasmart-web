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

function parseImages(anyVal: any): { image: string; imageUrls: string[] } {
  const asString = (x: any) => (typeof x === "string" ? x.trim() : "");
  const arr =
    Array.isArray(anyVal?.imagens) ? anyVal.imagens :
    Array.isArray(anyVal?.images)  ? anyVal.images  :
    typeof anyVal?.imagens === "string" ? anyVal.imagens :
    typeof anyVal?.images  === "string" ? anyVal.images  :
    typeof anyVal?.imagem  === "string" ? anyVal.imagem  :
    typeof anyVal?.image   === "string" ? anyVal.image   :
    typeof anyVal?.imageUrl=== "string" ? anyVal.imageUrl: "";

  const pieces = Array.isArray(arr)
    ? arr.map(asString)
    : String(arr ?? "")
        .split(/\n|;|,|\|/g)
        .map((s) => s.trim());

  const imageUrls = Array.from(new Set(pieces.filter(Boolean)));
  const image = imageUrls[0] ?? "";
  return { image, imageUrls };
}

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

  const { image, imageUrls } = parseImages({
    imagens: raw.imagens ?? raw.Imagens ?? raw.images ?? raw.Images,
    imagem: raw.imagem ?? raw.Imagem,
    image: raw.image,
    imageUrl: raw["image url"] ?? raw.imageUrl,
  });

  return { sku, name, price, stock, active, unit, categoryCode, image, imageUrls };
}

function chunk<T>(arr: T[], size = 450): T[][] {
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
    const listRaw: any[] = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.products)
      ? body.products
      : Array.isArray(body.rows)
      ? body.rows
      : [];

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
    const existingSnaps = await adminDb.getAll(...docIds.map((id) => productsCol.doc(id)));
    const existsMap = new Map<string, boolean>();
    existingSnaps.forEach((snap) => existsMap.set(snap.id, snap.exists));

    let totalCreated = 0, totalUpdated = 0;

    for (const idsChunk of chunk(docIds, 400)) {
      const batchProducts = adminDb.batch();
      const batchSeller = adminDb.batch();

      for (const id of idsChunk) {
        const idx = docIds.indexOf(id);
        const p = normalized[idx];

        const baseData = {
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
          image: p.image,
          imageUrls: p.imageUrls,
          updatedAt: now as any,
        };

        const exists = existsMap.get(id);
        if (exists) totalUpdated++; else totalCreated++;

        // products
        const prodRef = productsCol.doc(id);
        if (exists) batchProducts.set(prodRef, baseData, { merge: true });
        else batchProducts.set(prodRef, { ...baseData, createdAt: now as any }, { merge: true });

        // seller_products (espelho)
        const sellerRef = sellerCol.doc(id);
        if (exists) batchSeller.set(sellerRef, baseData, { merge: true });
        else batchSeller.set(sellerRef, { ...baseData, createdAt: now as any }, { merge: true });
      }

      await batchProducts.commit();
      await batchSeller.commit();
    }

    const durationMs = Date.now() - startedAt;

    // 5) Log de importação
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
      summary: {
        total: normalized.length,
        created: totalCreated,
        updated: totalUpdated,
        skipped: 0,
      },
    });
  } catch (err: any) {
    return noStore({ ok: false, error: err?.message || "Erro interno" }, 500);
  }
}