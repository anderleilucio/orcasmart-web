// ==== Categoria ↔ Prefixo (garantia no backend) ====
type CatOpt = { slug: string; prefix: string };
const CAT_OPTS: CatOpt[] = [
  { slug: "eletrica",      prefix: "ELE" },
  { slug: "hidraulica",    prefix: "HID" },
  { slug: "iluminacao",    prefix: "ILU" },
  { slug: "pisos",         prefix: "PIS" },
  { slug: "revestimentos", prefix: "REV" },
  { slug: "tintas",        prefix: "TIN" }, // aceita PIN/PINT também
  { slug: "ferragens",     prefix: "FER" },
  { slug: "madeiras",      prefix: "MAD" },
  { slug: "insumos",       prefix: "INS" },
  { slug: "hidraulica",    prefix: "TUB" }, // variação
];

const PREFIX_TO_SLUG: Record<string, string> = {
  ELE: "eletrica",
  HID: "hidraulica",
  ILU: "iluminacao",
  ILUM: "iluminacao",
  PIS: "pisos",
  REV: "revestimentos",
  TIN: "tintas",
  PIN: "tintas",
  PINT: "tintas",
  FER: "ferragens",
  MAD: "madeiras",
  INS: "insumos",
  TUB: "hidraulica",
};

function normalizeSku(raw?: string) {
  return (raw ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function stripExistingPrefix(sku: string) {
  const s = normalizeSku(sku);
  return s.replace(/^[A-Z]{2,5}[-_]/, "");
}
function hasPrefix(sku: string) {
  return /^[A-Z]{2,5}[-_]/.test(normalizeSku(sku));
}
function applyPrefixToSku(sku: string, prefix: string) {
  const body = stripExistingPrefix(sku || "0001");
  return prefix ? `${prefix}-${body}` : body;
}

function deriveFromSkuOrName(sku: string, name?: string): { slug: string | null; source: "prefix"|"keyword"|"none" } {
  const s = normalizeSku(sku);
  const m = s.match(/^([A-Z]{2,5})[-_]/);
  if (m && PREFIX_TO_SLUG[m[1]]) return { slug: PREFIX_TO_SLUG[m[1]], source: "prefix" };

  if (name) {
    const rules: Array<{ re: RegExp; slug: string }> = [
      { re: /\b(lâmpad|lampad|ilumin|led)\b/i, slug: "iluminacao" },
      { re: /\b(tub|pvc|regist|torneir|conex|joelh)\b/i, slug: "hidraulica" },
      { re: /\b(piso|porcelanat|azulej|revest)\b/i, slug: "revestimentos" },
      { re: /\b(tinta|látex|latex|acrílic|acrilic|esmalte)\b/i, slug: "tintas" },
      { re: /\b(parafus|ferrag|dobradiç|dobradic|cadead|trinco)\b/i, slug: "ferragens" },
      { re: /\b(madeira|sarraf|viga|compens)\b/i, slug: "madeiras" },
      { re: /\b(argamassa|rejunte|adesivo|massa)\b/i, slug: "insumos" },
      { re: /\b(fio|cabo|tomada|disjuntor|interruptor)\b/i, slug: "eletrica" },
    ];
    for (const r of rules) if (r.re.test(name)) return { slug: r.slug, source: "keyword" };
  }
  return { slug: null, source: "none" };
}

/** Garante categoria/sku finais. Idempotente e reversível. */
export function finalizeCategoryAndSku(input: {
  sku?: string;
  name?: string;
  category?: string | null; // slug vindo do front (ou nulo)
}) {
  let sku = input.sku ?? "";
  let category = input.category ?? null;
  let category_source: "prefix" | "keyword" | "none" = "none";

  if (!category || category === "") {
    const d = deriveFromSkuOrName(sku, input.name);
    category = d.slug;
    category_source = d.source;
    const opt = CAT_OPTS.find(o => o.slug === category);
    if (opt?.prefix && !hasPrefix(sku)) {
      sku = applyPrefixToSku(sku, opt.prefix);
    }
  } else {
    // usuário escolheu manualmente → força prefixo correspondente
    const opt = CAT_OPTS.find(o => o.slug === category);
    if (opt?.prefix) sku = applyPrefixToSku(sku, opt.prefix);
    category_source = "prefix";
  }

  return { sku, category, category_source };
}