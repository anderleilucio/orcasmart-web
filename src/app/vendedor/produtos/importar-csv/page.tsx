// src/app/vendedor/produtos/importar-csv/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Papa from "papaparse";

type Row = {
  sku: string;
  nome?: string;
  name?: string;
  preco?: string | number;
  price?: string | number;
  estoque?: string | number;
  stock?: string | number;
  ativo?: string | boolean;
  unidade?: string;
  images?: string | string[];
  imagens?: string | string[];
  imagem?: string;
  image?: string;
  categoryCode?: string;
  category?: string;
  categoria?: string;
};

function parseBool(v: any, def = true) {
  const s = String(v ?? "").trim().toLowerCase();
  if (["false", "0", "nao", "não", "no", "n", "inativo"].includes(s)) return false;
  if (["true", "1", "sim", "yes", "y", "ativo"].includes(s)) return true;
  return typeof v === "boolean" ? v : def;
}

function parseNumBR(v: any, def = 0) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s) return def;
  let t = s.replace(/\s+/g, "");
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : def;
}

function toArrayImages(anyVal: any): string[] {
  if (Array.isArray(anyVal)) return anyVal.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof anyVal === "string") {
    return anyVal
      .split(/\n|;|,|\|/g)
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
}

export default function ImportarCsvPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [valid, setValid] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      if (!u) router.replace("/auth/login");
    });
    return () => unsub();
  }, [router]);

  const validCount = valid.length;

  function handleFile(file: File) {
    setMsg(null);
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        const data = (res.data || []).map((r) => {
          const sku = String(r.sku ?? "").trim();
          const nome = String(r.nome ?? r.name ?? "").trim();
          const preco = parseNumBR(r.preco ?? r.price, 0);
          const estoque = parseNumBR(r.estoque ?? r.stock, 0);
          const ativo = parseBool(r.ativo, true);
          const unidade = String((r as any).unidade ?? "un").trim() || "un";
          const categoryCode =
            String((r as any).categoryCode ?? (r as any).category ?? (r as any).categoria ?? "")
              .trim() || undefined;

          const imageUrls = toArrayImages(
            (r as any).imagens ?? (r as any).images ?? (r as any).imagem ?? (r as any).image
          );

          return {
            sku,
            name: nome,
            price: preco,
            stock: estoque,
            active: ativo,
            unit: unidade,
            categoryCode,
            imageUrls,
          } as any;
        });

        setRows(res.data);
        setValid(data.filter((x: any) => x.sku && (x.name || "").trim()));
      },
      error: (e) => setMsg(e?.message || "Falha ao ler CSV."),
      encoding: "utf-8",
    });
  }

  async function doImport() {
    if (!uid) return alert("Faça login.");
    if (!validCount) return alert("Nenhuma linha válida.");
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
        body: JSON.stringify({ items: valid }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${res.status}`);
      setMsg(`Importação concluída. Itens processados: ${j?.upserted ?? validCount}.`);
    } catch (e: any) {
      setMsg(e?.message || "Falha ao importar.");
    } finally {
      setBusy(false);
    }
  }

  const preview = useMemo(() => {
    return valid.slice(0, 20);
  }, [valid]);

  if (!uid) return <main className="p-6">Carregando…</main>;

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Importar produtos (CSV)</h1>
        <Link href="/vendedor/produtos" className="rounded-lg border px-3 py-1.5 text-sm">← Hub de produtos</Link>
      </div>

      <p className="text-sm opacity-70">
        Faça upload de um arquivo <code>.csv</code> com cabeçalhos: <strong>SKU, Nome, Preço, Estoque, Ativo, Unidade, Imagens</strong>.
      </p>

      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <button
          onClick={doImport}
          disabled={!validCount || busy}
          className="rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 text-sm"
        >
          {busy ? "Importando…" : "Importar no catálogo"}
        </button>
      </div>

      {msg && (
        <div className="rounded-lg border px-4 py-3 text-sm">{msg}</div>
      )}

      <div className="text-sm">
        Linhas válidas: <strong>{validCount}</strong> {rows.length ? `(de ${rows.length})` : null}
      </div>

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
              {preview.map((r: any, i: number) => (
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
                    {(r.imageUrls || []).slice(0, 2).map((u: string, k: number) => (
                      <span key={k} className="mr-2 underline">{u.length > 28 ? u.slice(0, 28) + "…" : u}</span>
                    ))}
                    {(r.imageUrls || []).length > 2 ? "…" : null}
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