// src/app/api/products/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Product = {
  id?: string;
  sku: string;
  name: string;
  unit?: string;
  category?: string | null;
  categoryCode?: string | null;
  images?: string[];
  image?: string;
  price?: number;
  stock?: number;
  active?: boolean;
  deleted?: boolean;
  ownerId?: string | null;
  vendorUid?: string | null;
  createdAt?: any;
  updatedAt?: any;
  [k: string]: unknown;
};

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Erro desconhecido";
}
function asRecord(u: unknown): Record<string, unknown> {
  return u && typeof u === "object" ? (u as Record<string, unknown>) : {};
}
function tsToMillis(v: any): number | undefined {
  if (!v) return undefined;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v._seconds === "number") return v._seconds * 1000;
  if (typeof v === "string" || v instanceof Date) return new Date(v as any).getTime();
  return undefined;
}
function toProduct(id: string, raw: Record<string, unknown>): Product {
  const createdMs = tsToMillis(raw.createdAt);
  const updatedMs = tsToMillis(raw.updatedAt);
  return {
    id,
    sku: String(raw.sku ?? id),
    name: String(raw.name ?? ""),
    unit: typeof raw.unit === "string" ? raw.unit : "un",
    category: (raw.category as string | null) ?? null,
    categoryCode: (raw.categoryCode as string | null) ?? null,
    images: Array.isArray(raw.images) ? (raw.images.filter((x) => typeof x === "string") as string[]) : undefined,
    image: typeof raw.image === "string" ? raw.image : undefined,
    price: typeof raw.price === "number" ? raw.price : undefined,
    stock: typeof raw.stock === "number" ? raw.stock : undefined,
    active: typeof raw.active === "boolean" ? raw.active : true,
    deleted: raw.deleted === true ? true : false,
    ownerId: (raw.ownerId as string | null) ?? null,
    vendorUid: (raw.vendorUid as string | null) ?? null,
    createdAt: createdMs ? new Date(createdMs).toISOString() : undefined,
    updatedAt: updatedMs ? new Date(updatedMs).toISOString() : undefined,
    ...raw,
  };
}
function parseBoolParam(v: string | null | undefined): boolean | undefined {
  if (v == null) return undefined;
  const s = v.toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return undefined;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const categoryParam = url.searchParams.get("category") || url.searchParams.get("categoryCode") || "";
    const activeParam = parseBoolParam(url.searchParams.get("active"));
    const limitParam = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
    const order = (url.searchParams.get("order") || "createdAt").toLowerCase();
    const orderField = order === "updatedat" || order === "updatedAt" ? "updatedAt" : "createdAt";
    const offsetId = url.searchParams.get("offset");
    const ownerIdFromQuery = url.searchParams.get("ownerId") || "";

    // 1) Tenta autenticar por Bearer
    let uid: string | null = null;
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token) {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        uid = decoded.uid;
      } catch {
        // token inválido → ignora e tenta ownerId=query
      }
    }
    // 2) Se não tem token, usa ownerId= da query (fallback)
    if (!uid && ownerIdFromQuery) {
      uid = ownerIdFromQuery;
    }

    if (!uid) {
      return NextResponse.json(
        { ok: true, count: 0, items: [], hint: "Envie Authorization: Bearer <token> ou ?ownerId=<uid>" },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    const coll = adminDb.collection("products");
    const getStartAfterDoc = async () => (offsetId ? await coll.doc(offsetId).get() : null);
    const startAfterDoc = await getStartAfterDoc();

    const buildQuery = (by: "ownerId" | "vendorUid") => {
      let qref = coll.where(by, "==", uid!).orderBy(orderField, "desc");
      if (startAfterDoc?.exists) qref = qref.startAfter(startAfterDoc);
      return qref.limit(limit);
    };

    const [snapA, snapB] = await Promise.all([buildQuery("ownerId").get(), buildQuery("vendorUid").get()]);

    const seen = new Set<string>();
    let items: Product[] = [];
    for (const d of [...snapA.docs, ...snapB.docs]) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      items.push(toProduct(d.id, asRecord(d.data())));
    }

    // Filtros suaves
    items = items.filter((p) => p.deleted !== true);
    if (typeof activeParam === "boolean") {
      items = items.filter((p) => (p.active === undefined ? true : p.active) === activeParam);
    }
    if (categoryParam) {
      const cat = categoryParam.toLowerCase();
      items = items.filter((p) => {
        const c1 = (p.category || "").toString().toLowerCase();
        const c2 = (p.categoryCode || "").toString().toLowerCase();
        return c1 === cat || c2 === cat;
      });
    }
    if (q) {
      const nq = q.toLowerCase();
      items = items.filter(
        (p) =>
          (p.sku || "").toString().toLowerCase().includes(nq) ||
          (p.name || "").toString().toLowerCase().includes(nq)
      );
    }

    // Ordena novamente
    items.sort((a, b) => {
      const ta = tsToMillis(a[orderField as "createdAt" | "updatedAt"]) ?? 0;
      const tb = tsToMillis(b[orderField as "createdAt" | "updatedAt"]) ?? 0;
      return tb - ta;
    });

    return NextResponse.json(
      { ok: true, count: items.length, items },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: errMsg(e) },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/**
 * POST /api/products
 * Upsert de 1 item para o usuário autenticado (ou ownerId passado na query, fallback).
 * Agora também espelha o registro em `seller_products` para o catálogo do vendedor.
 */
export async function POST(req: NextRequest) {
  try {
    // uid por token → fallback ownerId=query
    const url = new URL(req.url);
    let uid: string | null = null;

    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token) {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        uid = decoded.uid;
      } catch {}
    }
    if (!uid) uid = url.searchParams.get("ownerId");

    if (!uid) {
      return NextResponse.json({ ok: false, error: "missing uid (Bearer token ou ?ownerId=)" }, { status: 401 });
    }

    const body = asRecord(await req.json().catch(() => ({})));
    const sku = typeof body.sku === "string" ? body.sku.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!sku || !name) {
      return NextResponse.json({ ok: false, error: "Campos 'sku' e 'name' são obrigatórios" }, { status: 400 });
    }

    const productsColl = adminDb.collection("products");

    // Busca por SKU do mesmo dono (ownerId/vendorUid)
    let snap = await productsColl.where("ownerId", "==", uid).where("sku", "==", sku).limit(1).get();
    if (snap.empty) {
      snap = await productsColl.where("vendorUid", "==", uid).where("sku", "==", sku).limit(1).get();
    }
    const productRef = snap.empty ? productsColl.doc() : snap.docs[0].ref;

    const now = new Date();
    const basePayload: Partial<Product> = {
      sku,
      name,
      unit: typeof body.unit === "string" ? body.unit : "un",
      category: (body.category as string) ?? undefined,
      categoryCode: (body.categoryCode as string) ?? undefined,
      images: Array.isArray(body.images) ? (body.images.filter((x) => typeof x === "string") as string[]) : undefined,
      image: typeof body.image === "string" ? body.image : undefined,
      price: typeof body.price === "number" ? body.price : undefined,
      stock: typeof body.stock === "number" ? body.stock : undefined,
      active: typeof body.active === "boolean" ? body.active : true,
      deleted: body.deleted === true ? true : false,
      ownerId: uid,
      vendorUid: uid,
      updatedAt: now,
      ...(snap.empty ? { createdAt: now } : {}),
    };

    // 1) Upsert em `products`
    await productRef.set(basePayload, { merge: true });

    // 2) Espelhamento em `seller_products` (índice do vendedor)
    //    — docId determinístico: <sellerId>__<sku>
    const sellerDocId = `${uid}__${sku}`;
    const sellerRef = adminDb.collection("seller_products").doc(sellerDocId);
    const sellerPayload = {
      sellerId: uid,
      ownerId: uid,
      vendorUid: uid,
      sku,
      name,
      categoryCode: (body.categoryCode as string) ?? null,
      price: typeof body.price === "number" ? body.price : 0,
      stock: typeof body.stock === "number" ? body.stock : 0,
      active: typeof body.active === "boolean" ? body.active : true,
      imageUrls: Array.isArray(body.images)
        ? (body.images.filter((x) => typeof x === "string") as string[])
        : typeof body.image === "string" && body.image
        ? [body.image]
        : [],
      updatedAt: now,
      ...(snap.empty ? { createdAt: now } : {}),
    };
    await sellerRef.set(sellerPayload, { merge: true });

    // 3) Retorna o produto salvo (do catálogo)
    const fresh = await productRef.get();
    const data = toProduct(fresh.id, asRecord(fresh.data()));

    return NextResponse.json(
      { ok: true, item: data },
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store",
    },
  });
}