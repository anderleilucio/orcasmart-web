// src/hooks/useCatalogSuggest.ts
"use client";

import { useCallback } from "react";
import { auth } from "@/lib/firebase";

/**
 * Tipos compatíveis com o endpoint /api/catalog/suggest
 */
export type SuggestResponse = {
  category: string | null;              // e.g. "eletrica" | "hidraulica" | ... | null
  prefix: string | null;                // e.g. "ELE" | "HID" | ... | null
  source: "user_rule" | "prefix" | "keyword" | "none";
  matchedTerm?: string;                 // termo que casou (se houver)
  confidence: number;                   // 0.0 ~ 1.0
};

export type FileSuggestResult = {
  file: File;
  baseName: string;                     // nome do arquivo sem extensão
  suggest: SuggestResponse;
};

type SuggestParams = {
  name?: string;        // texto livre (nome do produto)
  filename?: string;    // nome do arquivo (com ou sem extensão)
  sku?: string;         // opcional, caso já exista
};

async function authedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const user = auth.currentUser;
  if (!user) throw new Error("Faça login para continuar.");
  const token = await user.getIdToken();
  return fetch(input, {
    ...(init || {}),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
}

function stripExtension(name: string): string {
  // remove extensão e normaliza espaços/underscores/hífens
  const noExt = (name || "").replace(/\.[a-z0-9]+$/i, "");
  return noExt
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ----------------------------------------------------------------
 * Fallback local ("aprendizado" básico por palavras-chave)
 * ---------------------------------------------------------------- */

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // sem acentos
}

/** Mapa de termos -> categoria/prefixo */
const LOCAL_KEYWORDS: Array<{ slug: string; prefix: string; terms: string[] }> = [
  { slug: "tintas",        prefix: "TIN", terms: ["tinta", "suvinil", "coral", "latex", "laitex", "pva", "acrilica", "verniz", "selador"] },
  { slug: "alvenaria",     prefix: "ALV", terms: ["bloco", "blocos", "tijolo", "tijolos", "cimento", "argamassa", "areia", "brita", "pedra", "concreto", "reboco"] },
  { slug: "insumos",       prefix: "INS", terms: ["lixa", "prego", "parafuso", "bucha", "silicone", "cola"] },
  { slug: "ferragens",     prefix: "FER", terms: ["ferro", "vergalhao", "vergalhão", "aco", "aço"] },
  { slug: "eletrica",      prefix: "ELE", terms: ["cabo", "fio", "tomada", "interruptor", "disjuntor", "eletroduto", "caixa de passagem"] },
  { slug: "hidraulica",    prefix: "HID", terms: ["tubo", "cano", "pvc", "torneira", "ralo", "joelho", "conexao", "conexão", "registro", "caixa d agua", "caixa d'agua", "caixa de agua"] },
  { slug: "iluminacao",    prefix: "ILU", terms: ["lampada", "lâmpada", "luminaria", "spot", "led", "refletor"] },
  { slug: "pisos",         prefix: "PIS", terms: ["piso", "porcelanato", "ceramica", "cerâmica"] },
  { slug: "revestimentos", prefix: "REV", terms: ["revestimento", "azulejo", "pastilha", "rodape", "rodapé"] },
  { slug: "madeiras",      prefix: "MAD", terms: ["madeira", "mdf", "osb", "compensado", "sarraf", "viga", "caibro"] },
];

/**
 * Deduz apenas pelo nome/filename, localmente (sem API).
 * Retorna prefix/slug quando algum termo casar.
 */
export function guessPrefixLocally(
  nameOrFilename: string
): { prefix: string; slug: string; matched: string } | null {
  const target = norm(nameOrFilename);
  // Achamos por “termo contido”, priorizando termos mais longos (mais específicos)
  const entries: Array<{ slug: string; prefix: string; term: string }> = [];
  for (const g of LOCAL_KEYWORDS) {
    for (const t of g.terms) entries.push({ slug: g.slug, prefix: g.prefix, term: t });
  }
  entries.sort((a, b) => b.term.length - a.term.length);
  for (const e of entries) {
    if (target.includes(norm(e.term))) {
      return { prefix: e.prefix, slug: e.slug, matched: e.term };
    }
  }
  return null;
}

export function useCatalogSuggest() {
  /**
   * Sugere por texto livre (nome) OU por filename usando a API
   * (prioriza regras do cliente, depois heurística global do backend).
   */
  const suggestOne = useCallback(async (params: SuggestParams): Promise<SuggestResponse> => {
    const q = new URLSearchParams();
    if (params.name) q.set("name", params.name);
    if (params.filename) q.set("filename", params.filename);
    if (params.sku) q.set("sku", params.sku);

    const res = await authedFetch(`/api/catalog/suggest?${q.toString()}`);
    const data: unknown = await res.json();
    if (!res.ok) {
      const errMsg = typeof data === "object" && data !== null && "error" in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>).error)
        : `HTTP ${res.status}`;
      throw new Error(errMsg);
    }
    // Confia no contrato do endpoint
    return data as SuggestResponse;
  }, []);

  /**
   * Versão com fallback local:
   * 1) Tenta a API (/api/catalog/suggest)
   * 2) Se vier vazio, tenta palavras-chave locais (guessPrefixLocally)
   */
  const suggestWithFallback = useCallback(async (params: SuggestParams): Promise<SuggestResponse> => {
    // 1) API
    try {
      const api = await suggestOne(params);
      if (api?.prefix) return api; // já resolveu (user_rule / keyword / prefix)
    } catch {
      // ignora erro e tenta local
    }

    // 2) Local
    const basis = params.name || params.filename || "";
    const local = guessPrefixLocally(basis);
    if (local) {
      return {
        category: local.slug,
        prefix: local.prefix,
        source: "keyword",
        matchedTerm: local.matched,
        confidence: 0.72, // levemente abaixo das regras do usuário
      };
    }

    // 3) Nada encontrado
    return { category: null, prefix: null, source: "none", confidence: 0 };
  }, [suggestOne]);

  /**
   * Lote de arquivos (para upload/CSV):
   * - Lê o nome do arquivo
   * - Remove extensão -> baseName
   * - Consulta /api/catalog/suggest
   * - Fallback local quando necessário
   */
  const suggestFromFiles = useCallback(async (files: File[]): Promise<FileSuggestResult[]> => {
    const results: FileSuggestResult[] = [];
    for (const file of files) {
      const baseName = stripExtension(file.name);
      try {
        const suggest = await suggestWithFallback({ filename: baseName });
        results.push({ file, baseName, suggest });
      } catch {
        // Em caso de falha total, retorna "none"
        results.push({
          file,
          baseName,
          suggest: { category: null, prefix: null, source: "none", confidence: 0 },
        });
      }
    }
    return results;
  }, [suggestWithFallback]);

  return {
    suggestOne,
    suggestFromFiles,
    suggestWithFallback,
    guessPrefixLocally,
  };
}

export default useCatalogSuggest;