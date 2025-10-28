"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { uploadProductImage } from "@/lib/uploadImage";

type Row = {
  sku: string;
  nome: string;
  preco: string;
  estoque: string;
  ativo: string;
  unidade: string;
  imagens: string[];
};

export default function ImportarProdutosPage() {
  const [user, setUser] = useState<firebase.default.User | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [imported, setImported] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // login gate
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ?? null));
    return () => unsub();
  }, []);

  function baseSkuFromName(name: string) {
    const s = (name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toUpperCase();
    return s || "SKU";
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!auth.currentUser) {
      alert("Faça login para enviar imagens.");
      e.target.value = "";
      return;
    }

    setBusy(true);
    setErrors([]);
    try {
      const byName: Record<string, Row> = {};

      for (const f of Array.from(files)) {
        const uploadedUrl = await uploadProductImage(f, auth.currentUser!.uid);

        const bare = f.name.replace(/\.[a-z0-9]+$/i, "");
        const displayName = bare.replace(/[_\-]+/g, " ").trim();
        const key = baseSkuFromName(bare);

        if (!byName[key]) {
          byName[key] = {
            sku: key,
            nome: displayName || bare,
            preco: "0,00",
            estoque: "0",
            ativo: "true",
            unidade: "un",
            imagens: [],
          };
        }
        byName[key].imagens.push(uploadedUrl);
      }

      const newRows = Object.values(byName);
      setRows((prev) => {
        const map = new Map<string, Row>();
        for (const r of prev) map.set(r.sku, r);
        for (const r of newRows) {
          const cur = map.get(r.sku);
          if (cur) {
            const merged = Array.from(new Set([...(cur.imagens || []), ...r.imagens]));
            map.set(r.sku, { ...cur, imagens: merged });
          } else {
            map.set(r.sku, r);
          }
        }
        return Array.from(map.values());
      });
    } catch (err: any) {
      setErrors((p) => [...p, err?.message ?? String(err)]);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  const csvText = useMemo(() => {
    const header = ["SKU", "Nome", "Preco", "Estoque", "Ativo", "Unidade", "Imagens"].join(",");
    const lines = rows.map((r) => {
      const imagens = (r.imagens || []).join(" | ");
      const escape = (s: string) =>
        /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      return [
        r.sku,
        escape(r.nome),
        r.preco,
        r.estoque,
        r.ativo,
        r.unidade,
        escape(imagens),
      ].join(",");
    });
    return [header, ...lines].join("\n");
  }, [rows]);

  function downloadCSV() {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalogo_orcasmart.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ✅ Função que envia os produtos para o Firestore via API
  async function salvarNoCatalogo() {
    if (!user) return alert("Faça login primeiro.");
    if (rows.length === 0) return alert("Nenhum produto para salvar.");

    setBusy(true);
    setErrors([]);
    setImported(0);

    try {
      const token = await auth.currentUser?.getIdToken();

      for (const row of rows) {
        const body = {
          sku: row.sku,
          nome: row.nome,
          preco: row.preco.replace(",", "."),
          estoque: row.estoque.replace(",", "."),
          ativo: row.ativo === "true",
          unidade: row.unidade,
          imagens: row.imagens,
        };

        const res = await fetch("/api/products", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Erro ao salvar ${row.sku}: ${txt}`);
        }
        setImported((v) => v + 1);
      }

      alert(`✅ ${rows.length} produtos enviados para o catálogo com sucesso!`);
    } catch (e: any) {
      setErrors((p) => [...p, e?.message || String(e)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <button
        onClick={() => history.back()}
        className="text-sm rounded-lg border px-3 py-1.5"
      >
        ← Hub de produtos
      </button>

      <h1 className="text-2xl font-bold">Importar produtos (OrçaSmart)</h1>
      <p className="text-sm opacity-70">
        Envie imagens para gerar links automáticos e grave seus produtos no catálogo.
      </p>

      {!user && (
        <div className="rounded-lg border px-4 py-3 text-amber-700 bg-amber-50">
          Faça login para continuar.
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 cursor-pointer">
          <span>Escolher imagens</span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFiles}
            className="hidden"
            disabled={!user || busy}
            accept="image/*"
          />
        </label>

        <button
          className="rounded-lg border px-4 py-2"
          onClick={downloadCSV}
          disabled={rows.length === 0}
        >
          Baixar CSV
        </button>

        <button
          className="rounded-lg bg-purple-600 hover:bg-purple-700 text-white px-4 py-2"
          onClick={salvarNoCatalogo}
          disabled={rows.length === 0 || busy}
        >
          Importar no catálogo
        </button>
      </div>

      {busy && (
        <div className="rounded-lg border px-4 py-3 text-sm">
          Processando… ({imported}/{rows.length})
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600 space-y-1">
          {errors.map((e, i) => (
            <div key={i}>• {e}</div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-sm opacity-70">Nenhuma imagem enviada ainda.</div>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2">SKU</th>
                <th className="text-left p-2">Nome</th>
                <th className="text-left p-2">Preço</th>
                <th className="text-left p-2">Estoque</th>
                <th className="text-left p-2">Ativo</th>
                <th className="text-left p-2">Unidade</th>
                <th className="text-left p-2">Imagens</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sku} className="border-t">
                  <td className="p-2">{r.sku}</td>
                  <td className="p-2">{r.nome}</td>
                  <td className="p-2">{r.preco}</td>
                  <td className="p-2">{r.estoque}</td>
                  <td className="p-2">{r.ativo}</td>
                  <td className="p-2">{r.unidade}</td>
                  <td className="p-2">{r.imagens.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}