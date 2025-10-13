// src/components/UploadImagens.tsx
"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { uploadProductImage } from "@/lib/uploadImage";
import useCatalogSuggest, { SuggestResponse } from "@/hooks/useCatalogSuggest";

type Row = {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  image_url: string; // uma URL por linha (o importador usa "Imagens" com uma URL)
  unit: string;
  price: string; // "0,00" na UI; no CSV vamos exportar 0.00
  stock: string;
  active: boolean;
  note?: string;
};

function stripExtAndNormalize(s: string) {
  const noExt = (s || "").replace(/\.[a-z0-9]+$/i, "");
  return noExt.replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}
function derivePrefixFromSku(sku: string): string | null {
  const m = (sku || "").toUpperCase().match(/^([A-Z]{2,5})[-_]/);
  return m ? m[1] : null;
}
function pad(n: number, width = 4) {
  const s = String(n);
  return s.length >= width ? s : "0".repeat(width - s.length) + s;
}
function parseMoneyText(t: string) {
  if (!t) return 0;
  const norm = t.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(norm);
  return Number.isFinite(num) ? num : 0;
}
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

// Sanitiza SKU para evitar “vazio” no CSV por hifens especiais/espaços invisíveis
function sanitizeSku(s: string) {
  const cleaned = (s ?? "")
    .toString()
    .normalize("NFKC")
    // remove invisíveis comuns (NBSP/ZWSP/ZWNJ/ZWJ/BOM)
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, "")
    // todos os tipos de traço para hífen ASCII
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .toUpperCase()
    .trim();
  // mantém apenas A-Z, 0-9 e hífen
  return cleaned.replace(/[^A-Z0-9-]/g, "");
}

// ---------- Fallback local simples (palavras-chave → prefixo) ----------
function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const LOCAL_KEYWORDS: Array<{ prefix: string; terms: string[] }> = [
  { prefix: "TIN", terms: ["tinta", "suvinil", "coral", "latex", "laitex", "pva", "acrilica", "verniz", "selador"] },
  { prefix: "ALV", terms: ["bloco", "blocos", "tijolo", "tijolos", "cimento", "argamassa", "areia", "brita", "pedra", "concreto"] },
  { prefix: "INS", terms: ["lixa", "prego", "parafuso", "bucha", "silicone", "cola"] },
  { prefix: "FER", terms: ["ferro", "vergalhao", "aço", "aco"] },
  { prefix: "ELE", terms: ["cabo", "fio", "tomada", "interruptor", "disjuntor", "eletroduto"] },
  { prefix: "HID", terms: ["tubo", "cano", "pvc", "torneira", "ralo", "joelho", "conexao", "registro"] },
  { prefix: "ILU", terms: ["lampada", "lâmpada", "luminaria", "spot", "led", "refletor"] },
  { prefix: "PIS", terms: ["piso", "porcelanato", "ceramica"] },
  { prefix: "REV", terms: ["revestimento", "azulejo", "pastilha"] },
  { prefix: "MAD", terms: ["madeira", "porta", "batente", "rodape"] },
];

function guessPrefixLocally(name: string): string | null {
  const target = norm(name);
  // dá preferência para termos mais longos
  const entries: Array<{ prefix: string; term: string }> = [];
  for (const g of LOCAL_KEYWORDS) for (const t of g.terms) entries.push({ prefix: g.prefix, term: t });
  entries.sort((a, b) => b.term.length - a.term.length);
  for (const e of entries) {
    if (target.includes(norm(e.term))) return e.prefix;
  }
  return null;
}

export default function UploadImagens() {
  const { suggestOne } = useCatalogSuggest();

  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefixMaxFromCatalog, setPrefixMaxFromCatalog] = useState<Record<string, number>>({});

  // Carrega rapidamente o catálogo para descobrir o maior número por prefixo
  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch("/api/products?limit=50");
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        const maxMap: Record<string, number> = {};
        for (const it of data.items || []) {
          const sku: string = it.sku || "";
          const pfx = derivePrefixFromSku(sku);
          const mNum = sku.match(/^[A-Z]{2,5}[-_](\d{1,})$/);
          if (pfx && mNum) {
            const num = parseInt(mNum[1], 10);
            if (Number.isFinite(num)) {
              if (!maxMap[pfx] || num > maxMap[pfx]) maxMap[pfx] = num;
            }
          }
        }
        setPrefixMaxFromCatalog(maxMap);
      } catch (e: any) {
        console.warn("Não foi possível carregar catálogo p/ numerar SKU:", e?.message);
      }
    })();
  }, []);

  // Próximo número considerando catálogo + o que já está na lista
  const nextNumberForPrefix = (prefix: string): string => {
    let currentMax = prefixMaxFromCatalog[prefix] || 0;
    for (const r of rows) {
      const pfx = derivePrefixFromSku(r.sku);
      if (pfx !== prefix) continue;
      const m = r.sku.match(/^[A-Z]{2,5}[-_](\d{1,})$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > currentMax) currentMax = n;
      }
    }
    return pad(currentMax + 1, 4);
  };

  async function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;

    setBusy(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Faça login para continuar.");

      // contador local por prefixo para ESTE lote (evita duplicar -0001)
      const localMax: Record<string, number> = { ...prefixMaxFromCatalog };
      for (const r of rows) {
        const pfx = derivePrefixFromSku(r.sku || "");
        const m = r.sku.match(/^[A-Z]{2,5}[-_](\d{1,})$/);
        if (pfx && m) {
          const n = parseInt(m[1], 10);
          if (!localMax[pfx] || n > localMax[pfx]) localMax[pfx] = n;
        }
      }

      const additions: Row[] = [];
      for (const file of files) {
        const baseName = stripExtAndNormalize(file.name);

        let suggest: SuggestResponse = {
          category: null,
          prefix: null,
          source: "none",
          confidence: 0,
        };
        // 1ª tentativa: filename
        try {
          suggest = await suggestOne({ filename: baseName });
        } catch {}

        // 2ª tentativa: name (alguns casos casam melhor)
        if (!suggest?.prefix) {
          try {
            const s2 = await suggestOne({ name: baseName });
            if (s2?.prefix) suggest = s2;
          } catch {}
        }

        // 3º fallback local (cliente)
        if (!suggest?.prefix) {
          const local = guessPrefixLocally(baseName);
          if (local) {
            suggest = {
              category: null, // não temos o slug aqui, só o prefixo
              prefix: local,
              source: "keyword",
              confidence: 0.6,
            };
          }
        }

        // monta SKU se tiver prefixo sugerido
        let sku = "";
        if (suggest.prefix) {
          const p = suggest.prefix.toUpperCase();
          const next = (localMax[p] || 0) + 1;
          localMax[p] = next;
          sku = `${p}-${pad(next)}`;
        }

        const url = await uploadProductImage(file, user.uid);

        additions.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: baseName || file.name,
          sku,
          category: suggest.category,
          image_url: url,
          unit: "un",
          price: "0,00",
          stock: "0",
          active: true,
          note:
            suggest.prefix
              ? suggest.source === "keyword" && suggest.confidence < 0.7
                ? "Baixa confiança (verificar)"
                : undefined
              : "Sem sugestão (verificar categoria)",
        });
      }

      setRows((prev) => [...prev, ...additions]);
    } catch (e: any) {
      setError(e?.message || "Falha ao processar imagens");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  // Garante SKU para todos antes de exportar
  const ensureSkusForAll = async () => {
    const updated: Row[] = [];
    // estado máximo por prefixo, recalculado aqui
    const max: Record<string, number> = { ...prefixMaxFromCatalog };
    for (const r of rows) {
      const pfx = derivePrefixFromSku(r.sku || "");
      const m = r.sku.match(/^[A-Z]{2,5}[-_](\d{1,})$/);
      if (pfx && m) {
        const n = parseInt(m[1], 10);
        if (!max[pfx] || n > max[pfx]) max[pfx] = n;
      }
    }

    for (const r of rows) {
      let sku = sanitizeSku(r.sku);
      if (!sku) {
        let prefix: string | null = null;
        try {
          // usa 'name' (o hook não aceita 'text')
          const s = await suggestOne({ name: r.name || "", sku: r.sku });
          prefix = s?.prefix ? s.prefix.toUpperCase() : null;
        } catch {
          prefix = null;
        }
        // fallback local também no CSV
        if (!prefix) prefix = guessPrefixLocally(r.name || "") || null;

        if (prefix) {
          const next = (max[prefix] || 0) + 1;
          max[prefix] = next;
          sku = `${prefix}-${pad(next)}`;
        } else {
          // ✅ fallback quando NÃO houver correspondência
          sku = "SKU-";
        }
      }
      updated.push({ ...r, sku });
    }
    setRows(updated);
    return updated;
  };

  // CSV (com sanitização de SKU)
  async function downloadCSV() {
    const ready = await ensureSkusForAll();

    const headers = ["SKU", "Nome", "Preco", "Estoque", "Ativo", "Unidade", "Imagens"];
    const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;

    const lines = [
      headers.join(","),
      ...ready.map((r) => {
        const precoNumber = parseMoneyText(r.price);
        const sku = sanitizeSku(r.sku);
        return [
          esc(sku),
          esc(r.name || ""),
          esc(precoNumber.toFixed(2)),
          esc(String(parseInt(r.stock || "0", 10) || 0)),
          esc(r.active ? "true" : "false"),
          esc(r.unit || "un"),
          esc(r.image_url || ""),
        ].join(",");
      }),
    ];

    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "produtos-com-imagens.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const anyRows = rows.length > 0;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2">
          <span className="text-sm">Enviar imagens:</span>
          <input type="file" multiple onChange={onFilesSelected} />
        </label>

        <button
          onClick={downloadCSV}
          disabled={!anyRows || busy}
          className="ml-auto rounded-lg border px-4 py-2 disabled:opacity-60"
        >
          Baixar CSV
        </button>
      </div>

      {!anyRows ? (
        <p className="text-slate-600 text-sm">
          Nenhuma imagem enviada ainda. Selecione arquivos acima para gerar URLs e o CSV no formato:{" "}
          <code>SKU, Nome, Preco, Estoque, Ativo, Unidade, Imagens</code>.
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border p-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.image_url}
                    alt={r.name}
                    className="w-28 h-28 object-contain border rounded-md"
                  />
                </div>

                <label className="block md:col-span-2">
                  <span className="block text-xs text-slate-600 mb-1">SKU</span>
                  <input
                    value={r.sku}
                    onChange={(e) => updateRow(r.id, { sku: e.target.value })}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="INS-0001"
                  />
                </label>

                <label className="block md:col-span-3">
                  <span className="block text-xs text-slate-600 mb-1">Nome</span>
                  <input
                    value={r.name}
                    onChange={(e) => updateRow(r.id, { name: e.target.value })}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="Martelo"
                  />
                </label>

                <label className="block md:col-span-1">
                  <span className="block text-xs text-slate-600 mb-1">Unidade</span>
                  <input
                    value={r.unit}
                    onChange={(e) => updateRow(r.id, { unit: e.target.value })}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="un"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="block text-xs text-slate-600 mb-1">Preço (R$)</span>
                  <input
                    value={r.price}
                    onChange={(e) => updateRow(r.id, { price: e.target.value })}
                    className="w-full rounded-md border px-3 py-2"
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </label>

                <label className="block md:col-span-1">
                  <span className="block text-xs text-slate-600 mb-1">Estoque</span>
                  <input
                    value={r.stock}
                    onChange={(e) => updateRow(r.id, { stock: e.target.value })}
                    className="w-full rounded-md border px-3 py-2"
                    inputMode="numeric"
                    placeholder="0"
                  />
                </label>

                <label className="inline-flex items-center gap-2 md:col-span-1">
                  <input
                    type="checkbox"
                    checked={r.active}
                    onChange={(e) => updateRow(r.id, { active: e.target.checked })}
                  />
                  <span>Ativo</span>
                </label>
              </div>

              <div className="mt-2 text-xs">
                <div className="truncate">
                  <a
                    className="text-slate-700 underline break-all"
                    href={r.image_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.image_url}
                  </a>
                </div>
                {r.note && <div className="text-slate-500 mt-1">{r.note}</div>}
              </div>

              <div className="mt-2">
                <button onClick={() => removeRow(r.id)} className="text-sm rounded-md border px-3 py-1.5">
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}