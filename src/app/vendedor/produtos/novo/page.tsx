// src/app/vendedor/produtos/novo/page.tsx
"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { uploadProductImage } from "@/lib/uploadImage";

/** ===================== Helpers locais (sem libs externas) ===================== */
type CategoryOption = { label: string; slug: string; prefix: string };
const CATEGORY_OPTIONS: CategoryOption[] = [
  { label: "Automático (tentar deduzir)", slug: "", prefix: "" },

  // BR (linhas comuns no varejo de materiais de construção)
  { label: "Cimentos e Argamassas", slug: "cimentos-argamassas", prefix: "CIM" },
  { label: "Concretos e Agregados", slug: "concretos-agregados", prefix: "CON" },
  { label: "Esquadrias e Portas", slug: "esquadrias-portas", prefix: "ESQ" },
  { label: "Telhas e Coberturas", slug: "telhas-coberturas", prefix: "TEL" },

  { label: "Tintas e Acessórios", slug: "tintas", prefix: "TIN" },
  { label: "Materiais Elétricos", slug: "eletrica", prefix: "ELE" },
  { label: "Hidráulica e Conexões", slug: "hidraulica", prefix: "HID" },
  { label: "Iluminação", slug: "iluminacao", prefix: "ILU" },

  { label: "Revestimentos e Pisos", slug: "revestimentos", prefix: "REV" },
  { label: "Ferragens e Fixadores", slug: "ferragens", prefix: "FER" },
  { label: "Madeiras e Compensados", slug: "madeiras", prefix: "MAD" },
  { label: "Insumos", slug: "insumos", prefix: "INS" },
  { label: "Ferramentas", slug: "ferramentas", prefix: "FERM" },
  { label: "Acessórios de Obra (EPI)", slug: "acessorios-obra", prefix: "ACE" },

  // histórico
  { label: "Tubos (Hidráulica)", slug: "hidraulica", prefix: "TUB" },
];

function normalizeSku(raw: string) {
  return (raw || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function stripExistingPrefix(sku: string) {
  const s = normalizeSku(sku);
  return s.replace(/^[A-Z]{2,5}[-_]/, "");
}
function applyPrefixToSku(sku: string, newPrefix: string) {
  const body = stripExistingPrefix(sku || "0001");
  return newPrefix ? `${newPrefix}-${body}` : body;
}
function currentPrefix(sku: string): string | null {
  const m = normalizeSku(sku).match(/^([A-Z]{2,5})[-_]/);
  return m ? m[1] : null;
}

const KEYWORD_FALLBACKS: Array<{ re: RegExp; slug: string }> = [
  { re: /\b(cimento|argamassa|rejunte|massa|cp-?ii)\b/i, slug: "cimentos-argamassas" },
  { re: /\b(brita|areia|cascalho|concreto)\b/i, slug: "concretos-agregados" },
  { re: /\b(janela|porta|basculant|caixilho|alum[ií]nio|vidro)\b/i, slug: "esquadrias-portas" },
  { re: /\b(telha|cumeeira|calha|pingadeir|forro|telhado)\b/i, slug: "telhas-coberturas" },

  { re: /\b(tinta|látex|latex|acrílic|acrilic|esmalte|primer|selador)\b/i, slug: "tintas" },
  { re: /\b(fio|cabo|tomada|disjuntor|interruptor|dj|quadro)\b/i, slug: "eletrica" },
  { re: /\b(tub|pvc|regist|torneir|conex|joelh|válvula)\b/i, slug: "hidraulica" },
  { re: /\b(lâmpad|lampad|ilumin|led|spot|arandela)\b/i, slug: "iluminacao" },

  { re: /\b(piso|porcelanat|azulej|revest|rodap[ée])\b/i, slug: "revestimentos" },
  { re: /\b(parafus|preg|bucha|ferrag|dobradiç|cadead|trinco|suporte)\b/i, slug: "ferragens" },
  { re: /\b(madeira|sarraf|viga|caibro|mdf|osb|compens)\b/i, slug: "madeiras" },
  { re: /\b(vedação|silicone|manta|isolante|impermeabilizante|resina)\b/i, slug: "insumos" },
  { re: /\b(martelo|chave|alicate|serrote|furadeir|martelete|nivelador)\b/i, slug: "ferramentas" },
  { re: /\b(epi|luva|[óo]culos|m[aá]scara|bota|cinto)\b/i, slug: "acessorios-obra" },
];

const PREFIX_TO_SLUG: Record<string, string> = {
  CIM: "cimentos-argamassas",
  CON: "concretos-agregados",
  ESQ: "esquadrias-portas",
  TEL: "telhas-coberturas",
  ACE: "acessorios-obra",
  FERM: "ferramentas",
  ELE: "eletrica",
  ILU: "iluminacao",
  ILUM: "iluminacao",
  HID: "hidraulica",
  TUB: "hidraulica",
  PIS: "pisos",
  REV: "revestimentos",
  TIN: "tintas",
  PIN: "tintas",
  PINT: "tintas",
  FER: "ferragens",
  MAD: "madeiras",
  INS: "insumos",
};

function deriveCategoryFromSkuOrName(
  sku: string,
  name?: string,
  opts?: { ignoreSkuPrefix?: boolean }
): { slug: string | null; source: "prefix" | "keyword" | "none" } {
  const s = normalizeSku(sku);

  if (!opts?.ignoreSkuPrefix) {
    const m = s.match(/^([A-Z]{2,5})[-_]/);
    if (m && PREFIX_TO_SLUG[m[1]]) {
      return { slug: PREFIX_TO_SLUG[m[1]], source: "prefix" };
    }
  }
  if (name) {
    for (const rule of KEYWORD_FALLBACKS) {
      if (rule.re.test(name)) return { slug: rule.slug, source: "keyword" };
    }
  }
  return { slug: null, source: "none" };
}

function parsePrecoBr(v: string) {
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(norm);
  return Number.isFinite(n) ? n : 0;
}
/** ===================================================================================== */

export default function NovoProdutoPage() {
  const router = useRouter();

  const [categorySlug, setCategorySlug] = useState<string>("");
  const [sku, setSku] = useState("");
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("0,00");
  const [estoque, setEstoque] = useState("0");
  const [urls, setUrls] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // auto-prefixo (UX)
  const [userPrefixedSku, setUserPrefixedSku] = useState(false);
  const autoApplyingRef = useRef(false);
  const lastAutoPrefixRef = useRef<string | null>(null);

  function handleCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const slug = e.target.value;
    setCategorySlug(slug);
    const opt = CATEGORY_OPTIONS.find((o) => o.slug === slug);
    if (!opt?.prefix) return; // Automático -> não mexe
    setSku((prev) => applyPrefixToSku(prev, opt.prefix));
    setUserPrefixedSku(true);
    lastAutoPrefixRef.current = null;
  }

  const autoSuggestion = useMemo(() => {
    if (categorySlug) return null;
    const ignorePrefix = !!lastAutoPrefixRef.current;
    const d = deriveCategoryFromSkuOrName(sku, nome, { ignoreSkuPrefix: ignorePrefix });
    return d.slug;
  }, [categorySlug, sku, nome]);

  useEffect(() => {
    if (categorySlug) return;
    const cur = currentPrefix(sku);
    if (userPrefixedSku && cur && cur !== lastAutoPrefixRef.current) return;

    const ignorePrefix = !!lastAutoPrefixRef.current;
    const d = deriveCategoryFromSkuOrName(sku, nome, { ignoreSkuPrefix: ignorePrefix });
    const opt = d.slug ? CATEGORY_OPTIONS.find((o) => o.slug === d.slug) : null;
    const desiredPrefix = opt?.prefix || null;
    const canSystemChange = !cur || cur === lastAutoPrefixRef.current;

    if (desiredPrefix && canSystemChange) {
      autoApplyingRef.current = true;
      setSku((prev) => applyPrefixToSku(prev, desiredPrefix));
      lastAutoPrefixRef.current = desiredPrefix;
      autoApplyingRef.current = false;
    }
  }, [categorySlug, sku, nome, userPrefixedSku]);

  // refs para debounce de sugestão por nome
  const nameSuggestAbort = useRef<AbortController | null>(null);
  const nameSuggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // auto-sugestão pelo nome (debounce)
  useEffect(() => {
    const typed = (nome || "").trim();
    if (!typed) return;
    if (categorySlug) return;
    if (userPrefixedSku) return;

    if (nameSuggestTimer.current) clearTimeout(nameSuggestTimer.current);

    nameSuggestTimer.current = setTimeout(async () => {
      try {
        nameSuggestAbort.current?.abort();
        const ac = new AbortController();
        nameSuggestAbort.current = ac;

        const res = await fetch(`/api/catalog/suggest?name=${encodeURIComponent(typed)}`, {
          signal: ac.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (ac.signal.aborted) return;

        if (data?.prefix && data?.category && (data.confidence ?? 0) >= 0.7) {
          const curPrefix = (sku || "").toUpperCase().match(/^([A-Z]{2,5})[-_]/)?.[1] || null;
          if (!curPrefix || curPrefix === data.prefix) {
            setSku((prev) => {
              const body = (prev || "").replace(/^[A-Z]{2,5}[-_]/, "");
              return `${data.prefix}-${body || "0001"}`;
            });
            setCategorySlug((cur) => cur || data.category);
          }
        }
      } catch {
        // silencioso
      }
    }, 350);

    return () => {
      if (nameSuggestTimer.current) clearTimeout(nameSuggestTimer.current);
      nameSuggestAbort.current?.abort();
    };
  }, [nome, categorySlug, userPrefixedSku, sku]);

  // Upload + auto-sugestão por filename
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const user = auth.currentUser;
      if (!user) {
        alert("Faça login para enviar imagens.");
        return;
      }

      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadProductImage(file, user.uid);
        newUrls.push(url);
      }

      setUrls((prev) => {
        const base = (prev || "").trim();
        const block = newUrls.join("\n");
        return base ? `${base}\n${block}` : block;
      });

      // auto-sugestão por filename
      try {
        const first = files[0];
        if (first && !categorySlug) {
          const base = first.name.replace(/\.[a-z0-9]+$/i, "");
          const res = await fetch(`/api/catalog/suggest?filename=${encodeURIComponent(base)}`);
          const data = await res.json().catch(() => ({}));
          if (data?.prefix && data?.category && (data.confidence ?? 0) >= 0.7) {
            setSku((prev) => {
              const body = (prev || "").replace(/^[A-Z]{2,5}[-_]/, "");
              return `${data.prefix}-${body || "0001"}`;
            });
            setCategorySlug(data.category);
          }
        }
      } catch {
        // ignore sugestão de filename
      }
    } catch (err: any) {
      console.error("[NovoProduto] upload imagem:", err);
      alert(err?.message ?? "Falha ao enviar imagem");
    } finally {
      e.target.value = "";
    }
  }

  /** Fluxo principal */
  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setErro(null);
    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        setErro("Faça login para salvar o produto.");
        return;
      }

      const resCat = await fetch("/api/products/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nome.trim(),
          subcategory: undefined,
          unit: "un",
          active: true,
        }),
      });
      const cat = await resCat.json().catch(() => ({}));
      if (!resCat.ok) throw new Error(cat?.error || `Falha no catálogo`);

      const skuRoot: string | undefined = cat?.sku_root;
      const normName: string = cat?.name || nome.trim();
      const categoryCode: string | undefined = cat?.categoryCode;
      if (!skuRoot) throw new Error("Não foi possível gerar/obter o SKU.");

      const resSeller = await fetch("/api/seller-products/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId: user.uid,
          sku: skuRoot,
          name: normName,
          categoryCode,
          price: parsePrecoBr(preco),
          stock: parseInt(estoque || "0", 10),
          imageUrls: (urls || "")
            .split("\n")
            .map((u) => u.trim())
            .filter(Boolean),
          active: ativo,
        }),
      });
      const seller = await resSeller.json().catch(() => ({}));
      if (!resSeller.ok) throw new Error(seller?.error || `Falha no vendedor`);

      localStorage.setItem("orcasmart_toast", "Produto criado com sucesso!");
      router.push("/vendedor/produtos");
    } catch (err: any) {
      setErro(err?.message ?? "Falha ao salvar produto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Novo produto</h1>

      {erro && (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {erro}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Categoria (só sugestão/UX) */}
          <label className="block">
            <span className="block text-sm text-slate-600 mb-1">
              Categoria (define prefixo do SKU — sugestão)
            </span>
            <select
              value={categorySlug}
              onChange={handleCategoryChange}
              className="w-full rounded-md border px-3 py-2"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.slug}>
                  {opt.label}
                </option>
              ))}
            </select>
            {!categorySlug && autoSuggestion && (
              <p className="mt-1 text-xs text-slate-500">
                Sugestão automática: <b>{autoSuggestion}</b>
              </p>
            )}
          </label>

          {/* SKU */}
          <label className="block">
            <span className="block text-sm text-slate-600 mb-1">SKU</span>
            <input
              value={sku}
              onChange={(e) => {
                const val = e.target.value;
                if (!autoApplyingRef.current) {
                  const typedPrefix = /^[A-Z]{2,5}[-_]/.test(val.toUpperCase());
                  setUserPrefixedSku(typedPrefix);
                  if (typedPrefix) lastAutoPrefixRef.current = null;
                  if (!typedPrefix && val.trim() === "") {
                    setUserPrefixedSku(false);
                    lastAutoPrefixRef.current = null;
                  }
                }
                setSku(val);
              }}
              placeholder="EX: CIM-CP32"
              className="w-full rounded-md border px-3 py-2"
            />
          </label>

          {/* Nome */}
          <label className="block">
            <span className="block text-sm text-slate-600 mb-1">Nome</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Cimento CP-II 50kg"
              className="w-full rounded-md border px-3 py-2"
            />
          </label>

          {/* Preço */}
          <label className="block">
            <span className="block text-sm text-slate-600 mb-1">Preço (R$)</span>
            <input
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              placeholder="34,90"
              inputMode="decimal"
            />
          </label>

          {/* Estoque */}
          <label className="block">
            <span className="block text-sm text-slate-600 mb-1">Estoque</span>
            <input
              value={estoque}
              onChange={(e) => setEstoque(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              placeholder="42"
              inputMode="numeric"
            />
          </label>
        </div>

        {/* Upload de imagens */}
        <div className="space-y-2">
          <span className="block text-sm text-slate-600">Imagens</span>
          <input type="file" multiple className="block" onChange={handleFileSelect} />
        </div>

        {/* URLs de imagens */}
        <div>
          <label className="block">
            <span className="block text-sm text-slate-600 mb-1">
              URLs de imagens (uma por linha)
            </span>
            <textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              rows={6}
              placeholder={"https://.../foto1.jpg\nhttps://.../foto2.jpg"}
              className="w-full rounded-md border px-3 py-2"
            />
          </label>
        </div>

        {/* Ativo */}
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
          />
          <span>Produto ativo</span>
        </label>

        {/* Ações */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-medium px-5 py-2.5"
          >
            {saving ? "Salvando..." : "Salvar produto"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/vendedor/produtos")}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Cancelar
          </button>
        </div>
      </form>
    </main>
  );
}