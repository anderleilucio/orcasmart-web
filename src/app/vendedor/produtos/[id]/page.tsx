// src/app/vendedor/produtos/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import uploadProductImage, { uploadProductImageWithPath } from "@/lib/uploadImage";

type Prod = {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
  active?: boolean;
  imageUrls?: string[];
  imageStoragePaths?: string[]; // <- novo campo que pode vir do backend
};

export default function EditarProdutoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  // dados
  const [prod, setProd] = useState<Prod | null>(null);
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("0,00");
  const [estoque, setEstoque] = useState("0");
  const [urls, setUrls] = useState("");
  const [ativo, setAtivo] = useState(true);

  // NOVO: manter também os caminhos no Storage (para deleção futura)
  const [imagePaths, setImagePaths] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setChecking(false);
      if (!u) router.replace("/auth/login");
    });
    return () => unsub();
  }, [router]);

  // carregar produto
  useEffect(() => {
    if (!user || !params?.id) return;
    let abort = false;

    (async () => {
      setLoading(true);
      setErro(null);
      try {
        const res = await fetch(`/api/seller-products/${encodeURIComponent(params.id)}`, {
          method: "GET",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

        if (abort) return;
        const p: Prod = {
          id: data.id,
          sku: data.sku || "",
          name: data.name || "",
          price: typeof data.price === "number" ? data.price : Number(data.price ?? 0),
          stock: typeof data.stock === "number" ? data.stock : Number(data.stock ?? 0),
          active: data.active !== false,
          imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
          imageStoragePaths: Array.isArray(data.imageStoragePaths) ? data.imageStoragePaths : [],
        };
        setProd(p);
        setNome(p.name);
        setPreco(p.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
        setEstoque(String(p.stock ?? 0));
        setAtivo(p.active !== false);
        setUrls((p.imageUrls || []).join("\n"));

        // inicializa os paths que vierem do backend
        setImagePaths(p.imageStoragePaths || []);
      } catch (e: any) {
        if (!abort) setErro(e?.message ?? "Falha ao carregar produto.");
      } finally {
        if (!abort) setLoading(false);
      }
    })();

    return () => {
      abort = true;
    };
  }, [user, params?.id]);

  // upload de imagens => gera URLs e acrescenta no textarea + acumula paths
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const u = auth.currentUser;
      if (!u) {
        alert("Faça login para enviar imagens.");
        return;
      }

      const uploadedUrls: string[] = [];
      const uploadedPaths: string[] = [];

      for (const f of Array.from(files)) {
        const { url, path } = await uploadProductImageWithPath(f, u.uid);
        uploadedUrls.push(url);
        uploadedPaths.push(path);
      }

      // adiciona URLs no textarea
      setUrls((prev) => {
        const base = (prev || "").trim();
        const block = uploadedUrls.join("\n");
        return base ? `${base}\n${block}` : block;
      });

      // acumula paths no estado
      setImagePaths((prev) => [...prev, ...uploadedPaths]);

      setToast(`${uploadedUrls.length} imagem(ns) enviada(s).`);
      setTimeout(() => setToast(null), 2000);
    } catch (err: any) {
      alert(err?.message ?? "Falha ao enviar imagem");
    } finally {
      // permite selecionar o mesmo arquivo de novo, se quiser
      e.target.value = "";
    }
  }

  function parsePrecoBr(v: string) {
    const s = (v || "").trim().replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  async function onSave() {
    if (!user || !prod) return;
    setSaving(true);
    setErro(null);
    try {
      const body: any = {
        sellerId: user.uid,
        sku: prod.sku,
        name: nome.trim(),
        price: parsePrecoBr(preco),
        stock: parseInt(estoque || "0", 10),
        imageUrls: (urls || "")
          .split("\n")
          .map((u) => u.trim())
          .filter(Boolean),
        active: ativo,
        // mantém categoryCode existente se tiver
        categoryCode: undefined,
      };

      // Envie também os paths (se houver). Se quiser que NÃO sobrescreva quando vazio,
      // basta enviar SÓ quando tiver algo:
      if (imagePaths.length > 0) {
        body.imageStoragePaths = imagePaths;
      }
      // Se você quiser poder LIMPAR no servidor, envie sempre:
      // body.imageStoragePaths = imagePaths;

      const res = await fetch("/api/seller-products/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Falha (HTTP ${res.status})`);

      localStorage.setItem("orcasmart_toast", "Produto atualizado.");
      router.push("/vendedor/produtos");
    } catch (e: any) {
      setErro(e?.message ?? "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!prod) return;
    const ok = window.confirm("Tem certeza que deseja excluir este produto?");
    if (!ok) return;
    try {
      const res = await fetch(`/api/seller-products/${encodeURIComponent(prod.id)}`, {
        method: "DELETE",
        headers: { "Cache-Control": "no-store" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Falha (HTTP ${res.status})`);
      localStorage.setItem("orcasmart_toast", "Produto removido.");
      router.push("/vendedor/produtos");
    } catch (e: any) {
      alert(e?.message ?? "Falha ao excluir.");
    }
  }

  const previews = useMemo(() => {
    return (urls || "")
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean)
      .slice(0, 6);
  }, [urls]);

  if (checking) return <main className="p-6">Carregando…</main>;
  if (!user) return null;

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Editar produto</h1>
        <Link href="/vendedor/produtos" className="rounded-lg border px-3 py-1.5 text-sm">
          ← Voltar
        </Link>
      </div>

      {toast && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-green-700 text-sm">
          {toast}
        </div>
      )}
      {erro && (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {erro}
        </div>
      )}

      {loading || !prod ? (
        <div className="rounded-xl border px-4 py-6">Carregando…</div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
          className="space-y-6"
        >
          <div className="text-sm opacity-60">SKU: {prod.sku}</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <label className="block">
              <span className="block text-sm text-slate-600 mb-1">Nome</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
            </label>

            <label className="block">
              <span className="block text-sm text-slate-600 mb-1">Preço (R$)</span>
              <input
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
                placeholder="0,00"
                inputMode="decimal"
              />
            </label>

            <label className="block">
              <span className="block text-sm text-slate-600 mb-1">Estoque</span>
              <input
                value={estoque}
                onChange={(e) => setEstoque(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
                placeholder="0"
                inputMode="numeric"
              />
            </label>
          </div>

          <div className="space-y-2">
            <span className="block text-sm text-slate-600">Adicionar fotos (gera URL e insere abaixo)</span>
            <input type="file" multiple accept="image/*" onChange={handleFileSelect} className="block" />
            {previews.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {previews.map((u, i) => (
                  <img
                    key={i}
                    src={u}
                    alt=""
                    className="h-16 w-16 rounded-md border object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ))}
              </div>
            )}

            {/* (Opcional) Mostra quantos paths já temos guardados */}
            {imagePaths.length > 0 && (
              <div className="text-xs text-slate-500">
                {imagePaths.length} caminho(s) de Storage preparado(s) para salvar.
              </div>
            )}
          </div>

          <div>
            <label className="block">
              <span className="block text-sm text-slate-600 mb-1">URLs de imagens (uma por linha)</span>
              <textarea
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                rows={8}
                placeholder={"https://.../foto1.jpg\nhttps://.../foto2.jpg"}
                className="w-full rounded-md border px-3 py-2"
              />
            </label>
          </div>

          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            <span>Produto ativo</span>
          </label>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-medium px-5 py-2.5"
            >
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg border border-red-300 text-red-600 px-4 py-2 text-sm"
            >
              Excluir
            </button>
          </div>
        </form>
      )}
    </main>
  );
}