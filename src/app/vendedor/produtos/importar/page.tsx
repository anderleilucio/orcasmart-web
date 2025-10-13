"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { auth } from "@/lib/firebase";

type CsvRow = {
  SKU?: string;
  Nome?: string;
  Preco?: string | number;
  Estoque?: string | number;
  Ativo?: string | boolean;
  Unidade?: string;
  Imagens?: string; // múltiplas URLs separadas por ; ou quebra de linha
};

type DraftItem = {
  uid: string;        // preenchido na hora do envio
  sku: string;
  name: string;
  price: number;      // reais (número), ex.: 29.9
  stock: number;      // inteiro
  active: boolean;
  unidade: string;
  images: string[];   // manter para futuras galerias; hoje usamos a primeira
  __row: number;      // linha do CSV (p/ referência)
  __error?: string;   // mensagem de erro por linha (se houver)
};

// ---------- helpers ----------
function toBool(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  if (["true", "1", "sim", "ativo", "yes"].includes(s)) return true;
  if (["false", "0", "nao", "não", "inativo", "no"].includes(s)) return false;
  return true; // default: ativo
}

/** Converte preço aceitando: "1.234,56" | "1234,56" | "1234.56" | number */
function toNumberPrecoBR(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  // remove espaços
  let t = s.replace(/\s+/g, "");
  // se tiver vírgula e ponto, assume BR: milhar '.' e decimal ','
  if (t.includes(",") && t.includes(".")) {
    t = t.replace(/\./g, "").replace(",", ".");
    return Number(t);
  }
  // se só vírgula, troca por ponto
  if (t.includes(",")) {
    t = t.replace(",", ".");
  }
  return Number(t);
}

/** Inteiro, removendo separadores */
function toInt(v: unknown): number {
  if (typeof v === "number") return Math.trunc(v);
  const s = String(v ?? "").trim().replace(/\./g, "").replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

/** Imagens separadas por ; ou quebra de linha */
function parseImages(v: unknown): string[] {
  const raw = String(v ?? "").trim();
  if (!raw) return [];
  const parts = raw
    .split(/\n|;/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)); // dedup
}

export default function ImportarProdutosPage() {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function validateRow(row: CsvRow, idx: number): DraftItem {
    const sku = String(row.SKU ?? "").trim();
    const name = String(row.Nome ?? "").trim();
    const unidade = String(row.Unidade ?? "un").trim() || "un";

    const price = toNumberPrecoBR(row.Preco);
    const stock = toInt(row.Estoque);
    const active = toBool(row.Ativo);
    const images = parseImages(row.Imagens);

    let err = "";
    if (!sku) err = "SKU obrigatório.";
    else if (!name) err = "Nome obrigatório.";
    else if (!Number.isFinite(price) || price < 0) err = "Preço inválido.";
    else if (!Number.isInteger(stock) || stock < 0) err = "Estoque inválido.";

    return {
      uid: "",
      sku,
      name,
      price,
      stock,
      active,
      unidade,
      images,
      __row: idx + 2, // cabeçalho é linha 1
      __error: err || undefined,
    };
  }

  function handleFile(file: File) {
    setParsing(true);
    setRows([]);
    setDrafts([]);
    setResultMsg(null);

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const data = (res.data || []).map((r) => ({
          SKU: r.SKU ?? r["sku"] ?? r["Sku"],
          Nome: r.Nome ?? r["nome"] ?? r["Name"] ?? r["name"],
          Preco: r.Preco ?? r["preco"] ?? r["price"] ?? r["Price"],
          Estoque: r.Estoque ?? r["estoque"] ?? r["stock"] ?? r["Stock"],
          Ativo: r.Ativo ?? r["ativo"] ?? r["active"] ?? r["Active"],
          Unidade: r.Unidade ?? r["unidade"] ?? r["Unit"] ?? r["unit"],
          Imagens: r.Imagens ?? r["imagens"] ?? r["images"] ?? r["Images"],
        }));

        const draftsLocal = data.map((row, i) => validateRow(row, i));
        setRows(data);
        setDrafts(draftsLocal);
        setParsing(false);
      },
      error: () => {
        setParsing(false);
        setResultMsg("Falha ao ler arquivo CSV.");
      },
    });
  }

  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setResultMsg("Formato não suportado. Exporte sua planilha como CSV.");
      return;
    }
    handleFile(file);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setResultMsg("Formato não suportado. Exporte sua planilha como CSV.");
      return;
    }
    handleFile(file);
  }

  const validCount = useMemo(() => drafts.filter((d) => !d.__error).length, [drafts]);

  async function importAll() {
    setImporting(true);
    setResultMsg(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Você precisa estar logado.");

      const uid = user.uid;
      const validItems = drafts.filter((d) => !d.__error);

      if (validItems.length === 0) {
        throw new Error("Nenhuma linha válida para importar.");
      }

      // monta payload para /api/products/import
      const products = validItems.map((d) => ({
        sku: d.sku,
        nome: d.name,
        preco: d.price,                     // em reais (número)
        estoque: d.stock,
        ativo: d.active,
        unidade: d.unidade || "un",
        imagem: d.images[0] || "",          // usa a primeira URL
      }));

      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, products }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `Falha HTTP ${res.status}`);
      }

      setResultMsg(`✅ Importação concluída. Itens processados: ${body?.upserted ?? products.length}.`);
    } catch (e: any) {
      setResultMsg(e?.message ?? "Falha ao importar.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Importar produtos (CSV)</h1>
          <p className="text-sm opacity-70">
            Arraste sua planilha exportada em CSV. Cada linha vira um produto.
          </p>
        </div>
        <Link href="/vendedor/produtos/hub" className="rounded-lg border px-3 py-2 text-sm">
          ← Hub de produtos
        </Link>
      </div>

      {/* Área de drop */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="rounded-xl border border-dashed px-6 py-10 text-center"
      >
        <p className="mb-3">
          Arraste aqui seu arquivo <b>.csv</b>
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="block mx-auto"
        />
        <div className="text-xs opacity-70 mt-3">
          Cabeçalhos aceitos: <code>SKU, Nome, Preco, Estoque, Ativo, Unidade, Imagens</code>
          <br />
          Exemplos: Preço <code>29,90</code> ou <code>29.90</code> • Estoque <code>1.000</code> ou <code>1000</code>
        </div>
      </div>

      {/* Status */}
      {parsing && <div className="rounded-lg border px-4 py-2 text-sm">Lendo planilha…</div>}
      {resultMsg && <div className="rounded-lg border px-4 py-2 text-sm">{resultMsg}</div>}

      {/* Prévia */}
      {drafts.length > 0 && (
        <div className="rounded-xl border overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Linha</th>
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-left">Preço</th>
                <th className="px-3 py-2 text-left">Estoque</th>
                <th className="px-3 py-2 text-left">Ativo</th>
                <th className="px-3 py-2 text-left">Unidade</th>
                <th className="px-3 py-2 text-left">Imagens</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{d.__row}</td>
                  <td className="px-3 py-2">{d.sku}</td>
                  <td className="px-3 py-2">{d.name}</td>
                  <td className="px-3 py-2">
                    R$ {Number(d.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2">{d.stock.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2">{d.active ? "ativo" : "inativo"}</td>
                  <td className="px-3 py-2">{d.unidade}</td>
                  <td className="px-3 py-2 max-w-[360px] truncate" title={d.images.join("; ")}>
                    {d.images.join("; ")}
                  </td>
                  <td className="px-3 py-2">
                    {d.__error ? (
                      <span className="text-red-600">{d.__error}</span>
                    ) : (
                      <span className="text-green-600">ok</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Importar */}
      {drafts.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-70">
            Linhas válidas: <b>{validCount}</b> de {drafts.length}
          </div>
          <button
            onClick={importAll}
            disabled={validCount === 0 || importing}
            className="rounded-lg bg-black hover:bg-gray-900 text-white font-medium px-4 py-2.5 disabled:opacity-60"
          >
            {importing ? "Importando…" : "Importar no catálogo"}
          </button>
        </div>
      )}
    </main>
  );
}