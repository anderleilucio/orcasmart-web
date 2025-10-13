// src/app/vendedor/produtos/page.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

type Prod = {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
  active?: boolean;
  imageUrls?: string[];
};

type SortKey =
  | "name-asc"
  | "name-desc"
  | "price-asc"
  | "price-desc"
  | "stock-asc"
  | "stock-desc";

export default function ProdutosPage() {
  const router = useRouter();

  // ---------------- Auth ----------------
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setChecking(false);
      if (!u) router.replace("/auth/login");
    });
    return () => unsub();
  }, [router]);

  // ---------------- Dados base + paginação (sem paginação server por enquanto) ----------------
  const [items, setItems] = useState<Prod[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loadingFirst, setLoadingFirst] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // evita condições de corrida ao recarregar
  const lastReqSeq = useRef(0);

  // evita duplo clique no excluir e mostra "Excluindo…"
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Toast de feedback
  const [toast, setToast] = useState<string | null>(null);

  // Lê toast salvo por outras telas (ex.: "Criado com sucesso!")
  useEffect(() => {
    const t = localStorage.getItem("orcasmart_toast");
    if (t) {
      setToast(t);
      localStorage.removeItem("orcasmart_toast");
    }
  }, []);

  // Some automaticamente em 2s sempre que houver toast
  useEffect(() => {
    if (!toast) return;
    const tm = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(tm);
  }, [toast]);

  // ---------------- Filtros/ordenação client-side ----------------
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<"all" | "active" | "inactive">("active"); // padrão: só ativos
  const [sortKey, setSortKey] = useState<SortKey>("name-asc");

  const mergePage = useCallback((prev: Prod[], next: Prod[]) => {
    const seen = new Set(prev.map((p) => p.id));
    const merged = [...prev];
    for (const n of next) {
      if (!seen.has(n.id)) merged.push(n);
    }
    return merged;
  }, []);

  // ---------------- Carregar lista ----------------
  const loadFirstPage = useCallback(async () => {
    if (!user) return;

    const mySeq = ++lastReqSeq.current;

    setErro(null);
    setLoadMoreError(null);
    setLoadingFirst(true);
    setLoadingMore(false);
    setHasMore(false);
    setItems([]);

    const ac = new AbortController();

    try {
      const token = await user.getIdToken();
      const url = new URL("/api/seller-products/list", window.location.origin);
      url.searchParams.set("sellerId", user.uid);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: ac.signal,
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);

      const page: Prod[] = Array.isArray(body.items)
        ? body.items.map((x: any) => ({
            id: x.id,
            sku: x.sku || "",
            name: x.name || "",
            price: typeof x.price === "number" ? x.price : Number(x.price ?? 0),
            stock: typeof x.stock === "number" ? x.stock : Number(x.stock ?? 0),
            active: x.active !== false,
            imageUrls: Array.isArray(x.imageUrls) ? x.imageUrls : [],
          }))
        : [];

      if (lastReqSeq.current !== mySeq) return; // resposta antiga: ignora
      setItems(page);
      setHasMore(false); // a rota atual não pagina
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      if (lastReqSeq.current !== mySeq) return; // resposta antiga: ignora
      setErro(e?.message ?? "Falha ao carregar produtos");
      setItems([]);
      setHasMore(false);
    } finally {
      if (lastReqSeq.current === mySeq) setLoadingFirst(false);
    }

    return () => ac.abort();
  }, [user]);

  // recarrega quando logar OU quando a aba ganhar foco
  useEffect(() => {
    if (user) {
      const cleanup = loadFirstPage();
      return () => {
        // @ts-expect-error cleanup possivelmente Promise<void | (()=>void)>
        if (typeof cleanup === "function") cleanup();
      };
    }
  }, [user, loadFirstPage]);

  useEffect(() => {
    const onFocus = () => {
      if (user) loadFirstPage();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user, loadFirstPage]);

  // próxima página (placeholder – sem paginação servidor)
  const loadNextPage = useCallback(async () => {
    if (!user || loadingMore) return;
    setLoadMoreError(null);
    setLoadingMore(true);

    const ac = new AbortController();

    try {
      const token = await user.getIdToken();
      const url = new URL("/api/seller-products/list", window.location.origin);
      url.searchParams.set("sellerId", user.uid);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: ac.signal,
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);

      const page: Prod[] = Array.isArray(body.items)
        ? body.items.map((x: any) => ({
            id: x.id,
            sku: x.sku || "",
            name: x.name || "",
            price: typeof x.price === "number" ? x.price : Number(x.price ?? 0),
            stock: typeof x.stock === "number" ? x.stock : Number(x.stock ?? 0),
            active: x.active !== false,
            imageUrls: Array.isArray(x.imageUrls) ? x.imageUrls : [],
          }))
        : [];

      setItems((prev) => mergePage(prev, page));
      setHasMore(false);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setLoadMoreError(e?.message ?? "Falha ao carregar mais");
    } finally {
      setLoadingMore(false);
    }

    return () => ac.abort();
  }, [user, loadingMore, mergePage]);

  // ---------------- Exclusão (DELETE no backend de seller) ----------------
  async function handleDelete(id: string) {
    if (!user) return;

    if (deletingIds.has(id)) return; // evita duplo clique
    const ok = window.confirm("Tem certeza que deseja excluir este produto?");
    if (!ok) return;

    // marca “deletando” e remove otimista
    setDeletingIds((s) => new Set(s).add(id));
    const prev = items;
    setItems((cur) => cur.filter((p) => p.id !== id));

    try {
      const token = await user.getIdToken().catch(() => undefined);
      const res = await fetch(`/api/seller-products/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Cache-Control": "no-store",
        },
      });

      if (!res.ok) {
        setItems(prev); // rollback
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Falha (HTTP ${res.status}) ao excluir.`);
      }

      // recarrega do servidor para estado “verdade”
      await loadFirstPage();
      setToast("Produto removido.");
    } catch (err: any) {
      setItems(prev);
      alert(err?.message ?? "Falha ao excluir.");
    } finally {
      setDeletingIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  // ---------------- Exportar CSV (compatível com Safari/Chrome/Edge) ----------------
  async function handleExportCsv() {
    if (!user) return;
    try {
      const qs = new URLSearchParams({ sellerId: user.uid });
      const res = await fetch(`/api/catalog/export?${qs.toString()}`, { method: "GET" });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }

      const ct = (res.headers.get("content-type") || "").toLowerCase();

      // 1) CSV retornado direto pelo endpoint
      if (ct.includes("text/csv") || ct.includes("application/octet-stream")) {
        const blob = await res.blob();
        const filename =
          res.headers.get("x-filename") ||
          res.headers.get("content-disposition")?.match(/filename="?([^"]+)"?/)?.[1] ||
          "catalogo.csv";

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }

      // 2) JSON { url } ou { dataUrl, filename }
      const json = await res.json().catch(() => ({}));
      const url: string | undefined = json?.url || json?.dataUrl;
      const filename: string = json?.filename || "catalogo.csv";
      if (!url) throw new Error("Resposta inválida da exportação.");

      if (url.startsWith("data:")) {
        // Safari bloqueia window.open(data:...), então força download via <a download>
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }

      // 3) URL http/https normal (ex.: link assinado do Storage)
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      alert(e?.message || "Falha ao exportar CSV");
    }
  }

  // ---------------- Busca + filtro + ordenação ----------------
  const visibleItems = useMemo(() => {
    const q = (query ?? "").trim().toLowerCase();

    const filtered = (items ?? []).filter((p) => {
      const passQuery =
        !q ||
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q);

      const isActive = p.active !== false;
      const passStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
          ? isActive
          : !isActive;

      return passQuery && passStatus;
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name-asc":
          return (a.name || "").localeCompare(b.name || "", "pt-BR");
        case "name-desc":
          return (b.name || "").localeCompare(a.name || "", "pt-BR");
        case "price-asc":
          return Number(a.price) - Number(b.price);
        case "price-desc":
          return Number(b.price) - Number(a.price);
        case "stock-asc":
          return Number(a.stock ?? 0) - Number(b.stock ?? 0);
        case "stock-desc":
          return Number(b.stock ?? 0) - Number(a.stock ?? 0);
        default:
          return 0;
      }
    });

    return sorted;
  }, [items, query, statusFilter, sortKey]);

  // ---------------- Scroll infinito (placeholder) ----------------
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e.isIntersecting) {
          loadNextPage();
        }
      },
      { rootMargin: "1200px 0px 1200px 0px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadNextPage]);

  // ---------------- UI ----------------
  if (checking) return <main className="p-6">Carregando…</main>;
  if (!user) return null;

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      {toast && (
        <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-green-700 text-sm">
          {toast}
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm opacity-70">Gerencie seu catálogo</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="rounded-lg border px-4 py-2.5 text-sm"
            title="Exportar CSV para download"
          >
            Exportar CSV
          </button>

          <Link
            href="/vendedor/produtos/importar"
            className="rounded-lg border px-4 py-2.5 text-sm"
            title="Importar via planilha CSV"
          >
            Importar CSV
          </Link>

          <Link
            href="/vendedor/produtos/novo"
            className="rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2.5"
          >
            + Novo produto
          </Link>
        </div>
      </div>

      {/* Busca + filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome ou SKU…"
          className="w-full rounded-lg border px-3 py-2 bg-transparent"
        />

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "all" | "active" | "inactive")
          }
          className="rounded-lg border px-3 py-2 bg-transparent sm:w-44"
        >
          <option value="all">Todos</option>
          <option value="active">Apenas ativos</option>
          <option value="inactive">Apenas inativos</option>
        </select>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-lg border px-3 py-2 bg-transparent sm:w-44"
        >
          <option value="name-asc">Nome (A→Z)</option>
          <option value="name-desc">Nome (Z→A)</option>
          <option value="price-asc">Preço ↑</option>
          <option value="price-desc">Preço ↓</option>
          <option value="stock-asc">Estoque ↑</option>
          <option value="stock-desc">Estoque ↓</option>
        </select>
      </div>

      {/* Erro geral */}
      {erro && (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {erro}
        </div>
      )}

      {/* Lista */}
      {loadingFirst ? (
        <div className="rounded-xl border px-4 py-6">Carregando lista…</div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-xl border px-5 py-10 text-center">
          <p className="mb-4">Nenhum produto encontrado com os filtros atuais.</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                setQuery("");
                setStatusFilter("active");
                setSortKey("name-asc");
              }}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Limpar filtros
            </button>
            <Link
              href="/vendedor/produtos/novo"
              className="inline-flex rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2.5"
            >
              Cadastrar primeiro produto
            </Link>
          </div>
        </div>
      ) : (
        <>
          <ul className="divide-y rounded-xl border">
            {visibleItems.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-4 py-4"
              >
                <div className="flex items-center gap-3">
                  {p.imageUrls?.length ? (
                    <img
                      src={p.imageUrls[0]}
                      alt=""
                      className="h-14 w-14 rounded-lg border object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56'/>";
                      }}
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-lg border bg-slate-50" />
                  )}

                  <div>
                    <div className="font-medium">
                      {p.name} <span className="opacity-60">— {p.sku}</span>
                    </div>
                    <div className="text-sm opacity-70">
                      Preço: R$
                      {Number(p.price).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      • Estoque: {p.stock ?? 0} •{" "}
                      {p.active !== false ? "ativo" : "inativo"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/vendedor/produtos/${p.id}`}
                    className="rounded-lg border px-3 py-1.5 text-sm"
                  >
                    Editar
                  </Link>
                  <button
                    onClick={() => handleDelete(p.id)}
                    disabled={deletingIds.has(p.id)}
                    aria-busy={deletingIds.has(p.id)}
                    className="rounded-lg border border-red-300 text-red-600 px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingIds.has(p.id) ? "Excluindo…" : "Excluir"}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-col items-center justify-center gap-3">
            {loadingMore && (
              <div className="text-sm opacity-70">Carregando mais…</div>
            )}
            {loadMoreError && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-500">{loadMoreError}</span>
                <button
                  onClick={loadNextPage}
                  className="rounded border px-2 py-1 text-sm"
                >
                  Tentar novamente
                </button>
              </div>
            )}
            {hasMore && <div ref={sentinelRef} className="h-1 w-1" />}
          </div>
        </>
      )}
    </main>
  );
}