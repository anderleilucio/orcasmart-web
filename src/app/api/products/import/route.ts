// src/app/api/products/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IncomingProduct = {
  sku: string;
  nome: string;
  preco: number | string;   // pode vir "29,90" do CSV
  estoque: number | string; // pode vir "1.000"
  ativo: boolean | string;  // pode vir "true"/"false"
  unidade?: string;
  imagem?: string;          // URL pública (uma só)
  imagens?: string[];       // opcional: várias URLs
};

function json(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Preferir UID do token; cair para uid no body se não houver (compat)
async function getUidPreferToken(req: NextRequest, fallbackUid?: string) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token) {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  }
  if (fallbackUid) return fallbackUid;
  throw new Error("UID_MISSING");
}

// util simples de chunk p/ batches
function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ------------ normalizações seguras p/ CSVs ------------
function toNumberPreco(v: number | string | undefined): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);
  const s = String(v).trim();
  if (!s) return 0;
  // "1.234,56" -> "1234.56"
  const norm = s.replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function toNumberInt(v: number | string | undefined): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.trunc(v));
  const s = String(v).trim();
  if (!s) return 0;
  const norm = s.replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function toBoolean(v: boolean | string | undefined): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (["false", "0", "no", "n", "inativo", "inactive"].includes(s)) return false;
  return ["true", "1", "yes", "y", "ativo", "active"].includes(s);
}

// ------------ categoria por SKU (opcional/automática) ------------
// Mapeia prefixos comuns -> categoria canônica (minúscula, sem acento)
const SKU_CATEGORY_MAP: Record<string, string> = {
  ELE: "eletrica",
  EL: "eletrica",
  HID: "hidraulica",
  HIDR: "hidraulica",
  PIS: "pisos",
  REV: "revestimentos",
  FER: "ferragens",
  MAD: "madeiras",
  PIN: "pintura",
  PINT: "pintura",
  ILU: "iluminacao",
  ILUM: "iluminacao",
  INS: "instalacoes",
  TIN: "tintas",
  TUB: "tubos",
};

function deriveCategoryFromSku(skuRaw: string): string {
  if (!skuRaw) return "";
  const s = skuRaw.trim().toUpperCase();
  // pega o trecho até o primeiro separador comum
  const prefix = s.split(/[-_/.\s]/)[0] || s;
  // tenta reduzir a 3–4 letras significativas
  const candidates = [prefix, prefix.slice(0, 4), prefix.slice(0, 3)];
  for (const c of candidates) {
    if (SKU_CATEGORY_MAP[c]) return SKU_CATEGORY_MAP[c];
  }
  return "";
}

// -------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const { uid: bodyUid, products } = (await req.json()) as {
      uid?: string;
      products?: IncomingProduct[];
    };

    const uid = await getUidPreferToken(req, bodyUid);

    if (!Array.isArray(products) || products.length === 0) {
      return json({ error: "lista de produtos vazia" }, 400);
    }

    // validação + normalização (mantendo labels PT)
    const sanitized = products
      .map((p) => {
        const sku = String(p?.sku || "").trim();
        const nome = String(p?.nome || "").trim();
        const preco = toNumberPreco(p?.preco);
        const estoque = toNumberInt(p?.estoque);
        const ativo = toBoolean(p?.ativo);
        const unidade = String(p?.unidade || "un").trim();

        let images: string[] = [];
        if (Array.isArray(p?.imagens)) {
          images = p.imagens.map((u) => String(u || "").trim()).filter(Boolean);
        } else if (p?.imagem) {
          const u = String(p.imagem).trim();
          if (u) images = [u];
        }

        const category = deriveCategoryFromSku(sku); // <- NOVO: categoria automática

        return {
          sku,
          nome,
          preco,
          estoque,
          ativo,
          unidade,
          images,
          image: images[0] || "",
          category, // pode ser "" se não reconhecido
        };
      })
      .filter((p) => p.sku && p.nome);

    if (sanitized.length === 0) {
      return json({ error: "nenhum produto válido" }, 400);
    }

    // Firestore: máx 500 writes/batch → usamos 450 p/ margem
    const BATCH_SIZE = 450;
    const chunks = chunkArray(sanitized, BATCH_SIZE);

    let upsertedTotal = 0;

    for (const group of chunks) {
      const batch = adminDb.batch();

      // Resolve refs (upsert por ownerId+sku; compat com vendorUid)
      const refs = await Promise.all(
        group.map(async (p) => {
          let q = await adminDb
            .collection("products")
            .where("ownerId", "==", uid)
            .where("sku", "==", p.sku)
            .limit(1)
            .get();

          if (q.empty) {
            q = await adminDb
              .collection("products")
              .where("vendorUid", "==", uid)
              .where("sku", "==", p.sku)
              .limit(1)
              .get();
          }

          const ref = q.empty ? adminDb.collection("products").doc() : q.docs[0].ref;
          const isCreate = q.empty;
          return { ref, p, isCreate };
        })
      );

      for (const { ref, p, isCreate } of refs) {
        batch.set(
          ref,
          {
            ownerId: uid,          // garante visibilidade na listagem
            vendorUid: uid,        // compat legado
            sku: p.sku,
            name: p.nome,
            price: p.preco,        // em R$ (número com ponto)
            stock: p.estoque,      // inteiro
            active: p.ativo,
            unit: p.unidade,
            images: p.images,      // array para UI (images[0])
            image: p.image,        // campo simples compat
            category: p.category || "", // <- NOVO: categoria derivada
            updatedAt: FieldValue.serverTimestamp(),
            ...(isCreate ? { createdAt: FieldValue.serverTimestamp() } : {}),
          },
          { merge: true }
        );
      }

      await batch.commit();
      upsertedTotal += group.length;
    }

    return json({ upserted: upsertedTotal }, 200);
  } catch (e: any) {
    if (e?.message === "UID_MISSING") {
      return json(
        { error: "uid ausente (envie no body ou autentique com Bearer token)" },
        400
      );
    }
    console.error("IMPORT /api/products/import ->", e);
    return json({ error: e?.message || "erro desconhecido" }, 500);
  }
}