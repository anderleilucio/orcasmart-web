// src/app/api/products/add/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** -------------------- util -------------------- */
function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // sem acentos
    .replace(/\s+/g, " ")
    .trim();
}

/** Categoria -> código/prefixo */
const CATEGORY_MAP = {
  "cimentos-argamassas": { code: "CIM", prefix: "CIM" },
  "concretos-agregados": { code: "CON", prefix: "CON" },
  "esquadrias-portas":   { code: "ESQ", prefix: "ESQ" },
  "telhas-coberturas":   { code: "TEL", prefix: "TEL" },
  tintas:                { code: "TIN", prefix: "TIN" },
  eletrica:              { code: "ELE", prefix: "ELE" },
  hidraulica:            { code: "HID", prefix: "HID" },
  iluminacao:            { code: "ILU", prefix: "ILU" },
  revestimentos:         { code: "REV", prefix: "REV" },
  ferragens:             { code: "FER", prefix: "FER" },
  madeiras:              { code: "MAD", prefix: "MAD" },
  insumos:               { code: "INS", prefix: "INS" },
  ferramentas:           { code: "FERM", prefix: "FERM" },
  "acessorios-obra":     { code: "ACE", prefix: "ACE" },
} as const;

type CatKey = keyof typeof CATEGORY_MAP;

/**
 * Tabela de palavras-chave.
 * Quanto mais à frente no array, maior a prioridade (termos mais específicos).
 */
const KEYWORDS: Array<{ cat: CatKey; terms: string[] }> = [
  { cat: "cimentos-argamassas", terms: ["cp-ii", "cp ii", "cimento", "argamassa", "rejunte", "massa corrida"] },
  { cat: "concretos-agregados", terms: ["brita", "areia", "cascalho", "concreto", "pedra", "pedras"] },
  { cat: "esquadrias-portas",   terms: ["janelas", "janela", "portas", "porta", "basculante", "caixilho", "aluminio", "alumínio", "vidro temperado", "vidro"] },
  { cat: "telhas-coberturas",   terms: ["telha", "telhas", "cumeeira", "calha", "pingadeira", "forro pvc", "telhado"] },

  { cat: "tintas",              terms: ["tintas", "tinta", "latex", "látex", "pva", "acrilica", "acrílica", "esmalte", "primer", "selador", "verniz"] },
  { cat: "eletrica",            terms: ["cabo", "cabos", "fio", "fios", "tomada", "tomadas", "interruptor", "interruptores", "disjuntor", "eletroduto", "quadro de distribuição"] },
  { cat: "hidraulica",          terms: ["tubo", "tubos", "cano", "canos", "pvc", "torneira", "torneiras", "registro", "joelho", "conexao", "conexão", "ralo", "caixa d agua", "caixa d'agua", "caixa de agua"] },
  { cat: "iluminacao",          terms: ["lampada", "lâmpada", "lâmpadas", "luminaria", "luminária", "spot", "led", "refletor", "arandela"] },

  { cat: "revestimentos",       terms: ["revestimento", "revestimentos", "azulejo", "azulejos", "pastilha", "rodape", "rodapé", "porcelanato", "piso vinilico"] },
  { cat: "ferragens",           terms: ["vergalhao", "vergalhão", "ferro", "aço", "aco", "parafuso", "parafusos", "bucha", "dobradiça", "trinco", "cadeado", "suporte"] },
  { cat: "madeiras",            terms: ["madeira", "madeiras", "sarrafo", "viga", "caibro", "mdf", "osb", "compensado", "batente"] },
  { cat: "ferramentas",         terms: ["martelo", "alicate", "chave de fenda", "serrote", "furadeira", "martelete", "nivelador", "trena"] },
  { cat: "acessorios-obra",     terms: ["epi", "luva", "luvas", "oculos", "óculos", "mascara", "máscara", "bota", "cinto"] },

  // Itens genéricos / sem match claro caem em "insumos"
  { cat: "insumos",             terms: ["lixa", "silicone", "manta", "impermeabilizante", "resina", "cola", "adesivo", "tijolo", "tijolos"] },
];

/** Retorna a primeira categoria cujo termo aparece no texto normalizado */
function guessCategoryByName(name: string): CatKey {
  const n = norm(name);
  for (const group of KEYWORDS) {
    for (const t of group.terms) {
      if (n.includes(norm(t))) return group.cat;
    }
  }
  return "insumos";
}

/**
 * Gera SKU com contador atômico (sem índice composto):
 * - Doc: counters/products_<PREFIX> { next: number }
 * - Transação: incrementa e retorna o próximo sufixo.
 */
async function generateSku(prefix: string): Promise<string> {
  const counterRef = adminDb.collection("counters").doc(`products_${prefix}`);
  let next = 0;

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current =
      snap.exists && typeof snap.get("next") === "number"
        ? (snap.get("next") as number)
        : 0;
    next = current + 1;

    tx.set(
      counterRef,
      { next: FieldValue.increment(1), updatedAt: new Date() },
      { merge: true }
    );
  });

  const num = String(next).padStart(4, "0");
  return `${prefix}-${num}`;
}

/** -------------------- Handler -------------------- */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawName = String(body?.name || "");
    const name = norm(rawName);
    if (!name) {
      return NextResponse.json(
        { error: "Campo 'name' é obrigatório." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 1) Categoria por palavras-chave (robusto para plural/singular)
    const catKey = guessCategoryByName(name);
    const meta = CATEGORY_MAP[catKey];

    // 2) SKU raiz via contador
    const sku = await generateSku(meta.prefix);

    // 3) Upsert em products
    const now = new Date();
    await adminDb.collection("products").doc(sku).set(
      {
        sku,
        name: rawName.trim(), // mantém grafia original para exibir
        categoryCode: meta.code,
        prefix: meta.prefix,
        unit: body?.unit ?? "un",
        active: body?.active !== false,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return NextResponse.json(
      { ok: true, sku_root: sku, name: rawName.trim(), categoryCode: meta.code },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    console.error("[POST /api/products/add]", err);
    return NextResponse.json(
      { error: err?.message ?? "Erro interno" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
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