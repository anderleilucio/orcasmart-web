// src/app/dev/export/page.tsx
"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import BackToHub from "@/components/nav/BackToHub";

type Prod = {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
  active?: boolean;
  images?: string[];
  unit?: string;
};

const PAGE_SIZE = 50; // a API limita a 50

export default function ExportarCSVPage() {
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function fetchAll(): Promise<Prod[]> {
    const user = auth.currentUser;
    if (!user) throw new Error("Faça login para exportar.");
    const token = await user.getIdToken();

    let startAfter: string | null = null;
    const all: Prod[] = [];

    // paginação até acabar
    // (sem parâmetro ?active → traz todos: ativos e arquivados)
    while (true) {
      const url = new URL("/api/products", window.location.origin);
      url.searchParams.set("limit", String(PAGE_SIZE));
      if (startAfter) url.searchParams.set("startAfter", startAfter);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Falha HTTP ${res.status}`);

      const page: Prod[] = Array.isArray(body.items) ? body.items : [];
      all.push(...page);

      startAfter = body?.nextCursor ?? null;
      if (!startAfter) break;
    }

    return all;
  }

  function buildCsv(products: Prod[]): Blob {
    // Cabeçalhos compatíveis com o import:
    const header = "SKU,Nome,Preco,Estoque,Ativo,Unidade,Imagens\n";
    const rows = products.map((p) => {
      const sku = (p.sku ?? "").replace(/[,]/g, " ");
      const nome = (p.name ?? "").replace(/[,]/g, " ");
      // preço em número (p.price já é number), ponto como decimal
      const preco = Number(p.price ?? 0);
      const estoque = Number(p.stock ?? 0);
      const ativo = p.active !== false ? "true" : "false";
      const unidade = (p.unit ?? "un").replace(/[,]/g, " ");
      const imagens = Array.isArray(p.images) ? p.images.join("|") : ""; // mantém todas, separadas por |

      return `${sku},${nome},${preco},${estoque},${ativo},${unidade},${imagens}`;
    });

    const csv = header + rows.join("\n");
    return new Blob([csv], { type: "text/csv;charset=utf-8;" });
  }

  async function baixarCSV() {
    setMsg(null);
    setDownloading(true);
    try {
      const products = await fetchAll();
      const blob = buildCsv(products);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "catalogo-orcasmart.csv";
      a.click();
      URL.revokeObjectURL(url);

      setMsg(`Catálogo exportado: ${products.length} item(ns).`);
    } catch (e: any) {
      setMsg(e?.message ?? "Falha ao exportar.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="min-h-[70vh] max-w-4xl mx-auto p-6">
      {/* topo com botão de hub */}
      <div className="mb-8">
        <BackToHub />
      </div>

      {/* centro absoluto visual */}
      <div className="flex flex-col items-center justify-center text-center gap-4 mt-10">
        <h1 className="text-2xl font-bold">Exportar catálogo (CSV)</h1>
        <p className="text-sm opacity-70">
          Clique para baixar seu catálogo no formato do import.
        </p>

        <button
          onClick={baixarCSV}
          disabled={downloading}
          className="mt-2 rounded-lg bg-black text-white px-5 py-2.5 disabled:opacity-60"
        >
          {downloading ? "Gerando…" : "Baixar CSV"}
        </button>

        {msg && <div className="text-sm mt-2 opacity-80">{msg}</div>}
      </div>
    </main>
  );
}