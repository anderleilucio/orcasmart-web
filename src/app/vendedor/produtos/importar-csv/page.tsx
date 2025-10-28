// src/app/vendedor/produtos/importar-csv/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa, { ParseResult } from "papaparse";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

/* -------- Next cache control (não prerender) -------- */
export const dynamic = "force-dynamic";

/* -------- Tipos -------- */
type CsvRow = Record<string, any>;

type NormalizedRow = {
  sku: string;
  name: string;
  price: number;
  stock: number;
  active: boolean;
  unit: string;
  imageUrls: string[];
  categoryCode?: string;
};

/* -------- Utils -------- */
function parseBool(v: any, def = true): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (["false", "0", "nao", "não", "no", "n", "inativo", "inactive"].includes(s)) return false;
  if (["true", "1", "sim", "yes", "y", "ativo", "active"].includes(s)) return true;
  return def;
}

function parseNumBR(v: any, def = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const str = String(v ?? "").trim();
  if (!str) return def;
  let t = str.replace(/\s+/g, "");
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : def;
}

function toImages(val: any): string[] {
  const raw =
    Array.isArray(val) ? val :
    typeof val === "string" ? val :
    "";
  const list = Array.isArray(raw)
    ? raw
    : String(raw)
        .split(/\n|;|,|\|/g)
        .map((s) => s.trim())
        .filter(Boolean);
  return Array.from(new Set(list));
}

ffunction headerKey(s: string): string {
  // Normaliza cabeçalhos: remove BOM, acentos, espaços e deixa lowercase
  return s
    .replace(/\ufeff/g, "") // 🧹 remove caractere BOM (UTF-8 com BOM)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function normalizeRow(r: CsvRow): NormalizedRow | null {
  // Mapear campos por aliases
  const map: Record<string, any> = {};
  for (const [k, v] of Object.entries(r)) {
    map[headerKey(k)] = v;
  }

  const sku = String(map["sku"] ?? "").trim();
  const name = String(map["nome"] ?? map["name"] ?? "").trim();
  if (!sku || !name) return null;

  const price = parseNumBR(map["preco"] ?? map["preço"] ?? map["price"], 0);
  const stock = parseNumBR(map["estoque"] ?? map["stock"], 0);
  const active = parseBool(map["ativo"] ?? map["active"], true);
  const unit = (String(map["unidade"] ?? map["unit"] ?? "un").trim() || "un");
  const categoryCode = String(map["categorycode"] ?? map["category"] ?? map["categoria"] ?? "")
    .trim() || undefined;

  const imageUrls = toImages(
    map["imagens"] ??
    map["images"] ??
    map["imagem"] ??
    map["image"]
  );

  return { sku, name, price, stock, active, unit, imageUrls, categoryCode };
}

/* -------- Parsing robusto: tenta vírgula, “;” e encoding fallback -------- */
function parseCsvFile(file: File): Promise<ParseResult<CsvRow>> {
  const attempt = (opts: Partial<Papa.ParseLocalConfig<CsvRow>>): Promise<ParseResult<CsvRow>> =>
    new Promise((resolve, reject) => {
      Papa.parse<CsvRow>(file, {
        header: true,
        skipEmptyLines: "greedy",
        ...opts,
        complete: (res) => resolve(res),
        error: (err) => reject(err),
      });
    });

  return (async () => {
    // 1) Tentativa padrão: UTF-8, autodetect delimiter
    let res = await attempt({ encoding: "utf-8" });

    // Se veio 1 campo só e parece “SKU;Nome;…”, reparse com ';'
    const fields = (res.meta.fields || []).map((f) => String(f));
    if (fields.length <= 1) {
      // Reparse com ';'
      res = await attempt({ encoding: "utf-8", delimiter: ";" });
    }

    // Se ainda falhar (campos 1), tenta fallback de encoding ISO-8859-1
    const fields2 = (res.meta.fields || []).map((f) => String(f));
    if (fields2.length <= 1) {
      res = await attempt({ encoding: "ISO-8859-1" });
      const fields3 = (res.meta.fields || []).map((f) => String(f));
      if (fields3.length <= 1) {
        res = await attempt({ encoding: "ISO-8859-1", delimiter: ";" });
      }
    }

    return res;
  })();
}

/* -------- Página -------- */
export default function ImportarCsvPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);

  const [rawRows, setRawRows] = useState<CsvRow[]>([]);
  const [validRows, setValidRows] = useState<NormalizedRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      if (!u) router.replace("/auth/login");
    });
    return () => unsub();
  }, [router]);

  async function onPickFile(f: File) {
    setMsg(null);
    setBusy(true);
    try {
      const parsed = await parseCsvFile(f);

      const data = (parsed.data || []) as CsvRow[];

      // Normaliza cada linha e descarta inválidas (SKU/Nome faltando)
      const normalized: NormalizedRow[] = [];
      for (const r of data) {
        const n = normalizeRow(r);
        if (n) normalized.push(n);
      }

      setRawRows(data);
      setValidRows(normalized);

      if (!normalized.length) {
        setMsg(
          "Nenhuma linha válida encontrada. Verifique os cabeçalhos (SKU, Nome, Preço/Preco, Estoque, Ativo, Unidade, Imagens) e o separador (vírgula ou ponto e vírgula)."
        );
      }
    } catch (e: any) {
      setMsg(e?.message || "Falha ao ler o arquivo CSV.");
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    if (!uid) return alert("Faça login.");
    if (!validRows.length) return alert("Nenhuma linha válida para importar.");

    setBusy(true);
    setMsg(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ items: validRows }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${res.status}`);
      setMsg(`✅ Importação concluída. Itens processados: ${j?.upserted ?? validRows.length}.`);
    } catch (e: any) {
      setMsg(e?.message || "Falha ao importar.");
    } finally {
      setBusy(false);
    }
  }

  const preview = useMemo(() => validRows.slice(0, 20), [validRows]);

  if (!uid) return <main className="p-6">Carregando…</main>;

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Importar produtos (CSV)</h1>
        <Link href="/vendedor/produtos" className="rounded-lg border px-3 py-1.5 text-sm">
          ← Hub de produtos
        </Link>
      </div>

      <p className="text-sm opacity-70">
        Faça upload de um arquivo <code>.csv</code> com cabeçalhos:
        <strong> SKU, Nome, Preço/Preco, Estoque, Ativo, Unidade, Imagens</strong>.
        Aceita vírgula <code>,</code> ou ponto e vírgula <code>;</code>.
      </p>

      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && onPickFile(e.target.files[0])}
        />
        <button
          onClick={doImport}
          disabled={!validRows.length || busy}
          className="rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 text-sm"
        >
          {busy ? "Importando…" : "Importar no catálogo"}
        </button>
      </div>

      <div className="text-sm">
        Linhas válidas: <strong>{validRows.length}</strong>
        {rawRows.length ? <> (de {rawRows.length})</> : null}
      </div>

      {msg && (
        <div className="rounded-lg border px-4 py-3 text-sm">{msg}</div>
      )}

      {preview.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left p-2">SKU</th>
                <th className="text-left p-2">Nome</th>
                <th className="text-right p-2">Preço</th>
                <th className="text-right p-2">Estoque</th>
                <th className="text-left p-2">Ativo</th>
                <th className="text-left p-2">Un.</th>
                <th className="text-left p-2">Imagens</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{r.sku}</td>
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 text-right">
                    {Number(r.price ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-2 text-right">{r.stock ?? 0}</td>
                  <td className="p-2">{r.active ? "sim" : "não"}</td>
                  <td className="p-2">{r.unit || "un"}</td>
                  <td className="p-2">
                    {r.imageUrls?.slice(0, 2).map((u, k) => (
                      <span key={k} className="mr-2 underline">
                        {u.length > 28 ? u.slice(0, 28) + "…" : u}
                      </span>
                    ))}
                    {r.imageUrls && r.imageUrls.length > 2 ? "…" : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}