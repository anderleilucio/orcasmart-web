import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function toNum(v: any, d = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v == null) return d;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : d;
}

function normItem(docId: string, raw: any) {
  // normaliza lista de urls
  const arr: string[] = Array.isArray(raw.imageUrls)
    ? raw.imageUrls
    : Array.isArray(raw.images)
    ? raw.images
    : typeof raw.image === "string" && raw.image
    ? [raw.image]
    : [];

  const imageUrls = arr
    .filter((u: any) => typeof u === "string" && u.trim())
    .map((u) => u.trim());

  // garante 'image' e fallback para imageUrls[0]
  const image: string | undefined =
    (typeof raw.image === "string" && raw.image.trim()) ||
    imageUrls[0] ||
    undefined;

  const active =
    typeof raw.active === "boolean"
      ? raw.active
      : typeof raw.ativo === "boolean"
      ? raw.ativo
      : true;

  const categoryCode = (raw.categoryCode ?? raw.category ?? null) || null;

  return {
    id: docId,
    sku: String(raw.sku ?? ""),
    name: String(raw.name ?? raw.nome ?? ""),
    price: toNum(raw.price ?? raw.preco, 0),
    stock: toNum(raw.stock ?? raw.estoque, 0),
    active,
    image,        // ✅ agora incluído
    imageUrls,    // ✅ lista normalizada
    categoryCode,
    ownerId: raw.ownerId ?? raw.sellerId ?? raw.vendorUid ?? null,
    sellerId: raw.sellerId ?? raw.ownerId ?? raw.vendorUid ?? null,
    vendorUid: raw.vendorUid ?? null,
  };
}

async function queryByOwner(
  col: string,
  sellerId: string,
  field: "ownerId" | "vendorUid" | "sellerId"
) {
  const snap = await adminDb.collection(col).where(field, "==", sellerId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), _src: col }));
}

export async function GET(req: NextRequest) {
  try {
    // --- UID do token (preferido) ou sellerId= na URL ---
    const authHeader = req.headers.get("authorization") || "";
    let uidFromToken: string | null = null;
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (m) {
      try {
        const decoded = await adminAuth.verifyIdToken(m[1]);
        uidFromToken = decoded.uid;
      } catch {
        /* ignore */
      }
    }

    const url = new URL(req.url);
    const sellerIdParam = (url.searchParams.get("sellerId") || "").trim();
    const sellerId = uidFromToken || sellerIdParam;
    if (!sellerId) return noStore({ ok: false, error: "missing sellerId" }, 400);

    // filtros opcionais
    const activeParam = url.searchParams.get("active");
    const categoryParam =
      (url.searchParams.get("category") ||
        url.searchParams.get("categoryCode") ||
        "").trim() || null;

    const results = await Promise.all([
      // products (preferido)
      queryByOwner("products", sellerId, "ownerId"),
      queryByOwner("products", sellerId, "vendorUid"),
      queryByOwner("products", sellerId, "sellerId"),
      // seller_products (espelho)
      queryByOwner("seller_products", sellerId, "ownerId"),
      queryByOwner("seller_products", sellerId, "vendorUid"),
      queryByOwner("seller_products", sellerId, "sellerId"),
    ]);

    // mesclar e deduplicar (primeiro que entra vence: products vem antes)
    const mergedByDoc = new Map<string, any>();
    for (const bucket of results) {
      for (const item of bucket) {
        if (!mergedByDoc.has(item.id)) mergedByDoc.set(item.id, item);
      }
    }

    // normalizar
    let items = Array.from(mergedByDoc.entries()).map(([id, raw]) =>
      normItem(id, raw)
    );

    // filtros na memória (compat)
    if (activeParam === "true") items = items.filter((x) => x.active === true);
    else if (activeParam === "false")
      items = items.filter((x) => x.active === false);

    if (categoryParam) {
      items = items.filter(
        (x) => (x.categoryCode || "").toLowerCase() === categoryParam.toLowerCase()
      );
    }

    // ordenar por nome para estabilizar
    items.sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));

    return noStore({ ok: true, count: items.length, items });
  } catch (e: any) {
    return noStore({ ok: false, error: e?.message ?? "internal error" }, 500);
  }
}