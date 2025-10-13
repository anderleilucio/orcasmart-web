// src/app/vendedor/hub/categorizacao/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";

/* =========================
   Tipos
========================= */
type Category = {
  id: string;
  label: string;
  slug: string;     // ex.: "insumos"
  prefix: string;   // ex.: "INS"
  createdAt?: number | null;
};

type Product = {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
  active: boolean;
  images: string[];
  category: string | null; // slug
  createdAt?: number | null;
};

/* =========================
   Helpers
========================= */
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

// Extrai 2–5 letras do prefixo de um SKU (ex.: "INS-0001" -> "INS")
function derivePrefixFromSku(sku: string | undefined | null): string | null {
  const m = (sku || "").toUpperCase().match(/^([A-Z]{2,5})[-_]/);
  return m ? m[1] : null;
}

// Normaliza a digitação do SKU para evitar "INS-ELE", "INS--0001", etc.
function normalizeSkuInput(raw: string | undefined | null): string {
  const s = (raw ?? "")
    .toUpperCase()
    .normalize("NFKC")
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, "") // invisíveis
    .replace(/[\u2010-\u2015\u2212]/g, "-")          // traços variados -> hífen
    .replace(/[^A-Z0-9-]/g, "")                      // mantém só A-Z 0-9 -
    .replace(/-+/g, "-")
    .trim();

  // Mantém apenas 1 prefixo + (opcional) dígitos finais.
  // "INS-ELE" -> "INS-"
  // "INS-ELE-0002" -> "INS-0002"
  // "ALV-0003" -> "ALV-0003"
  const m = s.match(/^([A-Z]{2,5})(?:-([A-Z]{2,5}))?(?:-(\d+))?$/);
  if (!m) return s;
  const prefix = m[1];
  const digits = m[3] ?? "";
  return digits ? `${prefix}-${digits}` : `${prefix}-`;
}

/* =========================
   Página
========================= */
function HubCategorizacaoPage() {
  // Categorias
  const [cats, setCats] = useState<Category[]>([]);
  const [catId, setCatId] = useState<string>("");
  const selectedCat = useMemo(
    () => cats.find((c) => c.id === catId) || null,
    [cats, catId]
  );

  // Mapa slug -> prefix (para fallback de exibição de SKU)
  const prefixBySlug = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of cats) m[c.slug] = c.prefix;
    return m;
  }, [cats]);

  // Editar categoria
  const [editCatMode, setEditCatMode] = useState(false);
  const [editCatLabel, setEditCatLabel] = useState("");
  const [editCatPrefix, setEditCatPrefix] = useState("");

  // Criar categoria (seção 2)
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatPrefix, setNewCatPrefix] = useState("");

  // Produtos
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState("");

  // UI
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Edição inline de produto
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProdDraft, setEditProdDraft] = useState<Partial<Product> & { sku?: string }>({});

  /* -------------------------
     Load inicial
  ------------------------- */
  useEffect(() => {
    (async () => {
      try {
        setBusy(true);
        await Promise.all([loadCategories(), loadProducts()]);
      } catch (e: any) {
        setError(e?.message || "Falha ao carregar dados");
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCategories() {
    const res = await authedFetch("/api/catalog/categories");
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setCats(data.items || []);
    if (data.items?.length && !data.items.find((c: Category) => c.id === catId)) {
      setCatId(data.items[0].id);
    }
  }

  async function loadProducts() {
    const acc: Product[] = [];
    let cursor: number | null = null;
    for (let i = 0; i < 4; i++) {
      const url = new URL("/api/products", window.location.origin);
      url.searchParams.set("limit", "50");
      if (cursor) url.searchParams.set("startAfter", String(cursor));
      const res = await authedFetch(url.toString());
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      acc.push(...(data.items || []));
      cursor = data.nextCursor || null;
      if (!cursor) break;
    }
    setAllProducts(acc);
  }

  // Auto-ocultar mensagens
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 2500);
    return () => clearTimeout(t);
  }, [error]);

  /* -------------------------
     Derivados
  ------------------------- */
  const productsOfSelected = useMemo(() => {
    if (!selectedCat) return [];
    const list = allProducts.filter((p) => (p.category || "") === selectedCat.slug);
    if (!filter.trim()) return list;
    const f = filter.trim().toLowerCase();
    return list.filter((p) => p.sku.toLowerCase().includes(f) || p.name.toLowerCase().includes(f));
  }, [selectedCat, allProducts, filter]);

  /* -------------------------
     Categoria — Edição
  ------------------------- */
  function startEditCategory() {
    if (!selectedCat) return;
    setEditCatMode(true);
    setEditCatLabel(selectedCat.label);
    setEditCatPrefix(selectedCat.prefix);
  }

  async function saveEditCategory() {
    if (!selectedCat) return;
    try {
      setBusy(true);
      setError(null);
      setNotice(null);

      const newPrefix = (editCatPrefix || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
      if (!editCatLabel.trim()) throw new Error("Nome inválido.");
      if (!newPrefix || newPrefix.length < 2) throw new Error("Prefixo inválido (mínimo 2 letras).");

      const conflict = cats.find((c) => c.prefix === newPrefix && c.id !== selectedCat.id);
      if (conflict) throw new Error("Prefixo já existe em outra categoria.");

      const url = `/api/catalog/categories?id=${encodeURIComponent(selectedCat.id)}`;
      const res = await authedFetch(url, {
        method: "PUT",
        body: JSON.stringify({ label: editCatLabel.trim(), prefix: newPrefix }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setEditCatMode(false);
      await loadCategories();
      setCatId(selectedCat.id);
      setNotice("Categoria atualizada.");
    } catch (e: any) {
      setError(e?.message || "Falha ao atualizar categoria");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCategory() {
    if (!selectedCat) return;
    const ok = confirm(
      `Excluir a categoria “${selectedCat.label}” (${selectedCat.prefix})?\nIsso não apaga os produtos.`
    );
    if (!ok) return;

    try {
      setBusy(true);
      setError(null);
      setNotice(null);
      const url = `/api/catalog/categories?id=${encodeURIComponent(selectedCat.id)}`;
      const res = await authedFetch(url, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      await loadCategories();
      setNotice("Categoria excluída.");
    } catch (e: any) {
      setError(e?.message || "Falha ao excluir categoria");
    } finally {
      setBusy(false);
    }
  }

  /* -------------------------
     Categoria — Criar (Seção 2)
  ------------------------- */
  async function handleCreateCategory() {
    try {
      setBusy(true);
      setError(null);
      setNotice(null);

      const label = newCatLabel.trim();
      const prefix = (newCatPrefix || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);

      if (!label) throw new Error("Informe o nome da categoria.");
      if (!prefix || prefix.length < 2) throw new Error("Informe um prefixo com ao menos 2 letras.");

      const conflict = cats.find((c) => c.prefix === prefix);
      if (conflict) throw new Error("Esse prefixo já está em uso por outra categoria.");

      const res = await authedFetch("/api/catalog/categories", {
        method: "POST",
        body: JSON.stringify({ label, prefix }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setNewCatLabel("");
      setNewCatPrefix("");
      await loadCategories();
      if (data?.item?.id) setCatId(data.item.id);
      setNotice("Categoria criada.");
    } catch (e: any) {
      setError(e?.message || "Falha ao criar categoria");
    } finally {
      setBusy(false);
    }
  }

  /* -------------------------
     Produto — Criar Rápido (Seção 3)
  ------------------------- */
  const [quickName, setQuickName] = useState("");

  async function handleCreateQuick() {
    if (!selectedCat) return;
    try {
      setBusy(true);
      setError(null);
      setNotice(null);

      if (!quickName.trim()) throw new Error("Informe o nome do produto.");

      const payload = {
        sku: `${selectedCat.prefix}-`, // salva só o prefixo (sem número)
        name: quickName.trim(),
        price: 0,
        stock: 0,
        active: true,
        category: selectedCat.slug,
        images: [],
      };

      const res = await authedFetch("/api/products", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setQuickName("");
      await loadProducts();
      setNotice("Produto cadastrado.");
    } catch (e: any) {
      setError(e?.message || "Falha ao cadastrar produto");
    } finally {
      setBusy(false);
    }
  }

  /* -------------------------
     Produto — Excluir
  ------------------------- */
  async function handleDeleteProduct(id: string, sku: string, name: string) {
    const ok = confirm(`Excluir o produto ${sku || "(sem SKU)"} — ${name}?`);
    if (!ok) return;

    try {
      setBusy(true);
      setError(null);
      setNotice(null);
      const url = `/api/products?id=${encodeURIComponent(id)}`;
      const res = await authedFetch(url, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      await loadProducts();
      setNotice("Produto excluído.");
    } catch (e: any) {
      setError(e?.message || "Falha ao excluir produto");
    } finally {
      setBusy(false);
    }
  }

  /* -------------------------
     Produto — Editar (normaliza SKU e move por prefixo)
  ------------------------- */
  function startEditProduct(p: Product) {
    setEditingProductId(p.id);
    setEditProdDraft({
      sku: p.sku,
      name: p.name,
      price: p.price,
      stock: p.stock,
      active: p.active,
    });
  }
  function cancelEditProduct() {
    setEditingProductId(null);
    setEditProdDraft({});
  }

  async function saveEditProduct(id: string) {
    try {
      setBusy(true);
      setError(null);
      setNotice(null);

      const original = allProducts.find((p) => p.id === id);

      const body: any = { id };
      if (editProdDraft.sku !== undefined) {
        body.sku = normalizeSkuInput(editProdDraft.sku);
      }
      if (editProdDraft.name !== undefined) body.name = String(editProdDraft.name || "");
      if (editProdDraft.price !== undefined) body.price = Number(editProdDraft.price) || 0;
      if (editProdDraft.stock !== undefined) body.stock = Number(editProdDraft.stock) || 0;
      if (editProdDraft.active !== undefined) body.active = !!editProdDraft.active;

      // Preserva imagens
      if (original?.images !== undefined) body.images = original.images;

      // Move categoria conforme o prefixo do SKU normalizado
      const newPrefix = derivePrefixFromSku(body.sku);
      if (newPrefix) {
        const catByPrefix = cats.find((c) => c.prefix.toUpperCase() === newPrefix);
        if (catByPrefix) {
          body.category = catByPrefix.slug;
        } else if (original && original.category !== undefined) {
          body.category = original.category;
        }
      } else if (original && original.category !== undefined) {
        body.category = original.category;
      }

      const res = await authedFetch("/api/products", { method: "PUT", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      await loadProducts();
      cancelEditProduct();
      setNotice("Produto atualizado.");
    } catch (e: any) {
      setError(e?.message || "Falha ao atualizar produto");
    } finally {
      setBusy(false);
    }
  }

  /* -------------------------
     Render helpers
  ------------------------- */
  function displaySku(p: Product) {
    if (p.sku && p.sku.trim()) return p.sku;
    const pref = p.category ? prefixBySlug[p.category] : undefined;
    return pref ? `${pref}-` : "—";
  }

  /* -------------------------
     JSX
  ------------------------- */
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Categorias & Cadastro rápido</h1>
      <p className="text-sm text-slate-600">
        Gerencie a categoria selecionada (defina o prefixo único) e cadastre itens rapidamente. O <b>SKU</b> é definido
        nas telas de <b>CSV/URLs</b> ou no cadastro manual.
      </p>

      {notice && (
        <div className="rounded-md border border-emerald-600/30 bg-emerald-100/40 text-emerald-800 px-4 py-2 text-sm">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-600/30 bg-red-100/50 text-red-800 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {/* 1) Categoria */}
      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">1) Categoria</h2>

        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <label className="flex-1">
            <span className="block text-sm text-slate-600 mb-1">Escolha a categoria</span>
            <select
              value={catId}
              onChange={(e) => setCatId(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
            >
              {cats.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label} ({o.prefix})
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            <button
              onClick={startEditCategory}
              disabled={!selectedCat || busy}
              className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
            >
              Editar categoria
            </button>
            <button
              onClick={handleDeleteCategory}
              disabled={!selectedCat || busy}
              className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
            >
              Excluir categoria
            </button>
          </div>
        </div>

        {editCatMode && selectedCat && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-end rounded-md border p-3">
            <label className="md:col-span-7">
              <span className="block text-sm text-slate-600 mb-1">Nome</span>
              <input
                value={editCatLabel}
                onChange={(e) => setEditCatLabel(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
            </label>

            <label className="md:col-span-2">
              <span className="block text-sm text-slate-600 mb-1">Prefixo</span>
              <input
                value={editCatPrefix}
                onChange={(e) => setEditCatPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                className="w-full rounded-md border px-3 py-2"
                maxLength={5}
              />
            </label>

            <div className="md:col-span-3 flex gap-2 justify-end">
              <button
                onClick={saveEditCategory}
                className="bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl px-5 py-2 transition"
              >
                Salvar
              </button>
              <button
                onClick={() => setEditCatMode(false)}
                className="border border-gray-300 text-gray-700 font-medium rounded-lg px-4 py-2 hover:bg-gray-100 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 2) Cadastrar nova categoria */}
      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">2) Cadastrar nova categoria</h2>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <label className="md:col-span-7">
            <span className="block text-sm text-slate-600 mb-1">Nome da categoria</span>
            <input
              value={newCatLabel}
              onChange={(e) => setNewCatLabel(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              placeholder="Ex.: Alvenaria"
            />
          </label>

          <label className="md:col-span-2">
            <span className="block text-sm text-slate-600 mb-1">Prefixo (SKU)</span>
            <input
              value={newCatPrefix}
              onChange={(e) => setNewCatPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
              className="w-full rounded-md border px-3 py-2"
              placeholder="Ex.: ALV"
              maxLength={5}
            />
          </label>

          <div className="md:col-span-3 flex justify-end">
            <button
              onClick={handleCreateCategory}
              disabled={busy}
              className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-5 py-2 disabled:opacity-50"
            >
              Salvar categoria
            </button>
          </div>
        </div>
      </section>

      {/* 3) Cadastro rápido */}
      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">3) Cadastro rápido</h2>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <label className="md:col-span-8">
            <span className="block text-sm text-slate-600 mb-1">Nome do produto</span>
            <input
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              placeholder="Ex.: Martelo"
              disabled={!selectedCat}
            />
          </label>

          <label className="md:col-span-4">
            <span className="block text-sm text-slate-600 mb-1">Prefixo (SKU)</span>
            <input
              disabled
              value={selectedCat ? selectedCat.prefix : ""}
              className="w-full rounded-md border px-3 py-2 bg-gray-50 text-gray-600"
            />
          </label>
        </div>

        <div>
          <button
            onClick={handleCreateQuick}
            disabled={!selectedCat || busy}
            className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-5 py-2 disabled:opacity-50"
          >
            Salvar produto
          </button>
        </div>
      </section>

      {/* 4) Produtos desta categoria */}
      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">4) Produtos desta categoria</h2>

        <div className="flex gap-3 items-center">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar por nome ou SKU…"
            className="flex-1 rounded-md border px-3 py-2"
          />
          <button onClick={loadProducts} disabled={busy} className="rounded-lg border px-3 py-2 text-sm">
            Atualizar lista
          </button>
        </div>

        {(!selectedCat || productsOfSelected.length === 0) && (
          <p className="text-slate-500 text-sm">Nenhum produto encontrado nesta categoria.</p>
        )}

        {selectedCat && productsOfSelected.length > 0 && (
          <div className="overflow-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2">SKU</th>
                  <th className="text-left px-3 py-2">Nome</th>
                  <th className="text-left px-3 py-2">Criado em</th>
                  <th className="text-right px-3 py-2 w-40">Ações</th>
                </tr>
              </thead>
              <tbody>
                {productsOfSelected.map((p) => {
                  const editing = editingProductId === p.id;
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            className="rounded-md border px-2 py-1 w-36"
                            value={editProdDraft.sku ?? p.sku ?? `${prefixBySlug[p.category ?? ""] || ""}-`}
                            onChange={(e) => setEditProdDraft((d) => ({ ...d, sku: e.target.value }))}
                          />
                        ) : (
                          displaySku(p)
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            className="rounded-md border px-2 py-1 w-full"
                            value={editProdDraft.name ?? p.name}
                            onChange={(e) => setEditProdDraft((d) => ({ ...d, name: e.target.value }))}
                          />
                        ) : (
                          p.name
                        )}
                      </td>
                      <td className="px-3 py-2">{p.createdAt ? new Date(p.createdAt).toLocaleString() : "-"}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          {editing ? (
                            <>
                              <button
                                onClick={() => saveEditProduct(p.id)}
                                className="rounded-md border px-3 py-1.5 text-xs"
                              >
                                Salvar
                              </button>
                              <button
                                onClick={cancelEditProduct}
                                className="rounded-md border px-3 py-1.5 text-xs"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEditProduct(p)}
                                className="rounded-md border px-3 py-1.5 text-xs"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(p.id, p.sku, p.name)}
                                className="rounded-md border px-3 py-1.5 text-xs"
                              >
                                Excluir
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {busy && <p className="text-xs text-slate-500">processando…</p>}
    </div>
  );
}

export default HubCategorizacaoPage;