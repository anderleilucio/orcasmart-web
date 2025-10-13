// src/app/api/catalog/suggest/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SuggestSource = "none" | "keyword" | "rule";

export type SuggestResponse = {
  category: string | null; // slug/código de categoria quando aplicável
  prefix: string | null;   // ex.: "TIN", "ELE"
  source: SuggestSource;   // de onde veio a sugestão
  confidence: number;      // 0..1
};

type SuggestBody = {
  filename?: string;
  name?: string;
  sku?: string;
};

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Tabela de mapeamento (mesma ideia do cliente, porém no servidor)
const KEYWORDS: Array<{ prefix: string; category: string | null; terms: string[] }> = [
  { prefix: "TIN", category: "tintas",                terms: ["tinta", "tintas", "latex", "pva", "acrilica", "esmalte", "primer", "selador", "verniz", "suvinil", "coral"] },
  { prefix: "CIM", category: "cimentos-argamassas",   terms: ["cimento", "cp-ii", "cp ii", "argamassa", "rejunte", "massa corrida"] },
  { prefix: "CON", category: "concretos-agregados",   terms: ["brita", "areia", "cascalho", "concreto", "pedra", "pedras"] },
  { prefix: "ESQ", category: "esquadrias-portas",     terms: ["janela", "portas", "porta", "basculante", "caixilho", "aluminio", "vidro"] },
  { prefix: "TEL", category: "telhas-coberturas",     terms: ["telha", "telhas", "cumeeira", "calha", "pingadeira", "forro pvc", "telhado"] },
  { prefix: "ELE", category: "eletrica",              terms: ["cabo", "fio", "tomada", "interruptor", "disjuntor", "eletroduto", "quadro de distribuicao"] },
  { prefix: "HID", category: "hidraulica",            terms: ["tubo", "cano", "pvc", "torneira", "registro", "joelho", "conexao", "ralo", "caixa d agua"] },
  { prefix: "ILU", category: "iluminacao",            terms: ["lampada", "luminaria", "spot", "led", "refletor", "arandela"] },
  { prefix: "REV", category: "revestimentos",         terms: ["revestimento", "azulejo", "pastilha", "rodape", "porcelanato", "piso vinilico"] },
  { prefix: "FER", category: "ferragens",             terms: ["vergalhao", "ferro", "aco", "parafuso", "parafusos", "bucha", "dobradica", "trinco", "cadeado", "suporte"] },
  { prefix: "MAD", category: "madeiras",              terms: ["madeira", "sarrafo", "viga", "caibro", "mdf", "osb", "compensado", "batente"] },
  { prefix: "FERM", category: "ferramentas",          terms: ["martelo", "alicate", "chave de fenda", "serrote", "furadeira", "martelete", "trena", "nivelador"] },
  { prefix: "ACE", category: "acessorios-obra",       terms: ["epi", "luva", "oculos", "mascara", "bota", "cinto"] },
  { prefix: "INS", category: "insumos",               terms: ["lixa", "silicone", "manta", "impermeabilizante", "resina", "cola", "adesivo", "tijolo", "tijolos"] },
];

// busca dando preferência a termos mais longos
function suggestFromText(text: string): SuggestResponse {
  const t = norm(text);
  const terms: Array<{ key: string; len: number; prefix: string; category: string | null }> = [];
  for (const g of KEYWORDS) for (const k of g.terms) terms.push({ key: norm(k), len: k.length, prefix: g.prefix, category: g.category });
  terms.sort((a, b) => b.len - a.len);

  for (const item of terms) {
    if (item.key && t.includes(item.key)) {
      return {
        category: item.category,
        prefix: item.prefix,
        source: "keyword",
        confidence: 0.7,
      };
    }
  }

  return { category: null, prefix: null, source: "none", confidence: 0 };
}

/** Apenas POST é necessário aqui (o hook envia JSON) */
export async function POST(req: NextRequest) {
  try {
    const bodyUnknown = await req.json().catch(() => ({}));
    if (!bodyUnknown || typeof bodyUnknown !== "object") {
      return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
    }

    const body = bodyUnknown as Record<string, unknown>;
    const payload: SuggestBody = {
      filename: typeof body.filename === "string" ? body.filename : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
      sku: typeof body.sku === "string" ? body.sku : undefined,
    };

    const base =
      payload.name?.trim() ||
      payload.filename?.trim() ||
      payload.sku?.trim() ||
      "";

    const result = base ? suggestFromText(base) : { category: null, prefix: null, source: "none", confidence: 0 };

    return NextResponse.json(result as SuggestResponse, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
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