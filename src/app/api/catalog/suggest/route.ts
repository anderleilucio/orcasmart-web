// src/app/api/catalog/suggest/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Normaliza texto p/ match de palavras-chave */
function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos
}

/** Remove extensão e normaliza separadores do filename */
function stripFilename(name: string): string {
  const noExt = (name || "").replace(/\.[a-z0-9]+$/i, "");
  return noExt
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Regras simples de keyword -> {slug, prefix} (ordem definida por termo mais longo) */
const KEYWORDS: Array<{ slug: string; prefix: string; terms: string[] }> = [
  { slug: "cimentos-argamassas", prefix: "CIM", terms: ["cimento", "argamassa", "rejunte", "cp-ii", "cp ii"] },
  { slug: "concretos-agregados", prefix: "CON", terms: ["brita", "areia", "cascalho", "concreto"] },
  { slug: "esquadrias-portas",   prefix: "ESQ", terms: ["janela", "porta", "basculant", "caixilho", "aluminio", "alumínio", "vidro"] },
  { slug: "telhas-coberturas",   prefix: "TEL", terms: ["telha", "cumeeira", "calha", "pingadeira", "forro", "telhado"] },

  { slug: "tintas",              prefix: "TIN", terms: ["tinta", "latex", "látex", "pva", "acrilica", "acrílica", "esmalte", "primer", "selador"] },
  { slug: "eletrica",            prefix: "ELE", terms: ["cabo", "fio", "tomada", "interruptor", "disjuntor", "eletroduto"] },
  { slug: "hidraulica",          prefix: "HID", terms: ["tubo", "cano", "pvc", "torneira", "ralo", "joelho", "conexao", "conexão", "registro"] },
  { slug: "iluminacao",          prefix: "ILU", terms: ["lampada", "lâmpada", "luminaria", "spot", "led", "refletor"] },

  { slug: "revestimentos",       prefix: "REV", terms: ["revestimento", "azulejo", "pastilha", "rodape", "rodapé"] },
  { slug: "ferragens",           prefix: "FER", terms: ["vergalhao", "vergalhão", "ferro", "aco", "aço", "parafuso", "bucha", "dobradiça"] },
  { slug: "madeiras",            prefix: "MAD", terms: ["madeira", "mdf", "osb", "compensado", "batente"] },
  { slug: "insumos",             prefix: "INS", terms: ["silicone", "cola", "manta", "impermeabilizante", "resina"] },
  { slug: "ferramentas",         prefix: "FERM", terms: ["martelo", "alicate", "serrote", "furadeira", "martelete", "nivelador"] },
  { slug: "acessorios-obra",     prefix: "ACE", terms: ["epi", "luva", "oculos", "óculos", "mascara", "máscara", "bota", "cinto"] },
];

/** Retorna melhor match por “termo contido”, priorizando termos mais longos */
function deduceByKeywords(text: string): { slug: string; prefix: string; matched: string } | null {
  const target = norm(text);
  if (!target) return null;

  const entries: Array<{ slug: string; prefix: string; term: string }> = [];
  for (const g of KEYWORDS) for (const t of g.terms) entries.push({ slug: g.slug, prefix: g.prefix, term: t });
  entries.sort((a, b) => b.term.length - a.term.length);

  for (const e of entries) {
    if (target.includes(norm(e.term))) return { slug: e.slug, prefix: e.prefix, matched: e.term };
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name") ?? "";
    const filenameParam = searchParams.get("filename") ?? "";
    const sku = searchParams.get("sku") ?? "";

    // 1) Se o SKU já tiver prefixo claro (AAA-...), prioriza isso
    const skuPrefix = (sku || "").toUpperCase().match(/^([A-Z]{2,5})[-_]/)?.[1] || null;
    const PREFIX_TO_SLUG: Record<string, string> = {
      CIM: "cimentos-argamassas", CON: "concretos-agregados", ESQ: "esquadrias-portas", TEL: "telhas-coberturas",
      ELE: "eletrica", ILU: "iluminacao", HID: "hidraulica", TIN: "tintas", REV: "revestimentos",
      FER: "ferragens", MAD: "madeiras", INS: "insumos", FERM: "ferramentas", ACE: "acessorios-obra",
    };
    if (skuPrefix && PREFIX_TO_SLUG[skuPrefix]) {
      return NextResponse.json(
        {
          category: PREFIX_TO_SLUG[skuPrefix],
          prefix: skuPrefix,
          source: "prefix",
          confidence: 0.95,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 2) Base de texto: nome OU filename normalizado
    const basis = name?.trim() || stripFilename(filenameParam);
    if (!basis) {
      return NextResponse.json(
        { category: null, prefix: null, source: "none", confidence: 0 },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 3) Heurística por palavras-chave
    const hit = deduceByKeywords(basis);
    if (hit) {
      return NextResponse.json(
        {
          category: hit.slug,
          prefix: hit.prefix,
          source: "keyword",
          matchedTerm: hit.matched,
          confidence: 0.75,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 4) Nenhum match
    return NextResponse.json(
      { category: null, prefix: null, source: "none", confidence: 0 },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Erro interno" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store",
    },
  });
}