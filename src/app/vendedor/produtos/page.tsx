// src/app/vendedor/produtos/page.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

/** ---------- Helpers ---------- */
// Conserta URLs do Firebase Storage para uso direto em <img>
function fixImageUrl(u?: string): string | undefined {
  if (!u) return u;
  // .firebasestorage.app -> API googleapis
  u = u.replace(
    /^https:\/\/([^/]+)\.firebasestorage\.app\/o\//,
    "https://firebasestorage.googleapis.com/v0/b/$1/o/"
  );
  // garante ?alt=media
  if (
    /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\//.test(u) &&
    !/[?&]alt=media\b/.test(u)
  ) {
    u += (u.includes("?") ? "&" : "?") + "alt=media";
  }
  return u;
}

// Converte qualquer formato (string/array/campos alternativos) em array de URLs
function coerceImageUrls(x: any): string[] {
  const raw =
    x?.imageUrls ??
    x?.images ??
    x?.imagens ??
    x?.imageUrl ??
    x?.imageURL ??
    x?.imagem ??
    x?.image ??
    [];

  const list = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(/\n|;|,|\|/g)
        .map((s) => s.trim())
        .filter(Boolean);

  // remove vazios/duplicados
  return Array.from(
    new Set(
      list
        .filter((u) => typeof u === "string" && u.length > 0)
        .map((u) => u.trim())
    )
  );
}

type Prod = {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
  active?: boolean;
  image?: string;
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
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [items, setItems] = useState<Prod[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setChecking(false);
      if (!u) router.replace("/auth/login");
    });
    return () => unsub();
  }, [router]);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<"all" | "active" | "inactive">("all");
  const [sortKey, setSortKey] = useState<SortKey>("name-asc");

  function normalizeApiItem(x: any): Prod {
    const id =
      x?.id ||
      x?.docId ||
      x?._id ||
      x?.refId ||
      x?.sku ||
      (typeof crypto !== "undefined"
        ? crypto.randomUUID()
        : `${x?.sku}-${Math.random()}`);

    // aceita qualquer campo e converte para array
    const imageUrls = coerceImageUrls(x);

    // image (se vier vazio, usa primeira da lista)
    const image =
      (typeof x?.image === "string" && x.image.trim()) ||
      (typeof x?.imageUrl === "string" && x.imageUrl.trim()) ||
      (typeof x?.imageURL === "string" && x.imageURL.trim()) ||
      (typeof x?.imagem === "string" && x.imagem.trim()) ||
      imageUrls[0] ||
      undefined;

    return {
      id,
      sku: String(x?.sku ?? ""),
      name: String(x?.name ?? x?.nome ?? ""),
      price: Number(x?.price ?? x?.preco ?? 0),
      stock: Number(x?.stock ?? x?.estoque ?? 0),
      active: x?.active !== false && x?.ativo !== false,
      image,
      imageUrls,
    };
  }

  async function fetchProducts(uid: string) {
    const token = await auth.currentUser?.getIdToken();
    const url = `/api/seller-products/list?sellerId=${encodeURIComponent(uid)}&_=${Date.now()}`;

    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      next: { revalidate: 0 },
    });

    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.ok === false) {
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }

    const listRaw: any[] = Array.isArray(body.items) ? body.items : [];
    return listRaw.map(normalizeApiItem);
  }

  const loadProducts = useCallback(async () => {
    if (!user) return;
    setErro(null);
    setLoading(true);
    try {
      const data = await fetchProducts(user.uid);
      setItems(data);
    } catch (e: any) {
      setErro(e?.message || "Falha ao carregar produtos");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user?.uid) loadProducts();
  }, [user?.uid, loadProducts]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (items ?? []).filter((p) => {
      const passQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q);
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
          return a.price - b.price;
        case "price-desc":
          return b.price - a.price;
        case "stock-asc":
          return a.stock - b.stock;
        case "stock-desc":
          return b.stock - a.stock;
        default:
          return 0;
      }
    });
    return sorted;
  }, [items, query, statusFilter, sortKey]);

  if (checking) return <main className="p-6">Carregando…</main>;
  if (!user) return null;

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      {toast && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-green-700 text-sm">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm opacity-70">Gerencie seu catálogo</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/vendedor/produtos/importar-csv"
            className="rounded-lg border px-4 py-2.5 text-sm"
          >
            Importar CSV
          </Link>

          <Link
            href="/vendedor/produtos/novo"
            className="rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2.5"
          >
            + Novo produto
          </Link>

          <button
            onClick={loadProducts}
            className="rounded-lg border px-3 py-2 text-sm"
            title="Recarregar"
          >
            Recarregar
          </button>
        </div>
      </div>

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

      {erro && (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {erro}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border px-4 py-6">Carregando lista…</div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-xl border px-5 py-10 text-center">
          <p className="mb-4">Nenhum produto encontrado com os filtros atuais.</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
                setSortKey("name-asc");
                loadProducts();
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
        <ul className="divide-y rounded-xl border">
          {visibleItems.map((p) => {
            // aplica fix apenas na hora de renderizar
            const thumb = fixImageUrl(p.image || p.imageUrls?.[0]) || "";
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-4 py-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-lg border bg-white overflow-hidden flex items-center justify-center">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={p.name}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-xs opacity-50">sem foto</span>
                    )}
                  </div>

                  <div>
                    <div className="font-medium">
                      {p.name} <span className="opacity-60">— {p.sku}</span>
                    </div>
                    <div className="text-sm opacity-70">
                      R{"$"}
                      {Number(p.price).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      • Estoque: {p.stock ?? 0} •{" "}
                      {p.active !== false ? "ativo" : "inativo"}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Link
                    href={`/vendedor/produtos/${encodeURIComponent(p.id)}`}
                    className="rounded-lg border px-3 py-2 text-sm"
                  >
                    Editar
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}