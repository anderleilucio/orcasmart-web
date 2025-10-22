// src/hooks/useCatalogSuggest.ts
"use client";

export type SuggestResponse = {
  category: string | null;
  prefix: string | null;
  source: "model" | "rule" | "keyword" | "none";
  confidence: number; // 0..1
};

type SuggestInput = {
  name?: string;
  filename?: string;
  sku?: string;
};

function timeout<T>(p: Promise<T>, ms = 6000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("Suggest timeout")), ms);
    p.then((v) => {
      clearTimeout(id);
      resolve(v);
    }).catch((e) => {
      clearTimeout(id);
      reject(e);
    });
  });
}

export default function useCatalogSuggest() {
  async function suggestOne(input: SuggestInput): Promise<SuggestResponse> {
    // evita chamadas vazias
    const payload: SuggestInput = {};
    if (input.name) payload.name = input.name;
    if (input.filename) payload.filename = input.filename;
    if (input.sku) payload.sku = input.sku;

    if (Object.keys(payload).length === 0) {
      return { category: null, prefix: null, source: "none", confidence: 0 };
    }

    const req = fetch("/api/catalog/suggest", {
      method: "POST", // <- altera para POST (resolve 405)
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // credenciais não são necessárias aqui; Auth é feita no endpoint via token se aplicável
    });

    const res = await timeout(req, 8000);
    if (!res.ok) {
      // Em falha, devolve fallback “none”, sem quebrar o fluxo
      return { category: null, prefix: null, source: "none", confidence: 0 };
    }
    const data = (await res.json()) as Partial<SuggestResponse> | undefined;

    return {
      category: data?.category ?? null,
      prefix: data?.prefix ?? null,
      source: (data?.source as SuggestResponse["source"]) ?? "none",
      confidence: typeof data?.confidence === "number" ? data!.confidence : 0,
    };
  }

  return { suggestOne };
}