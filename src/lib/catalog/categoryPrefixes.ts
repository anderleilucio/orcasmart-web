export type CategoryOption = {
  label: string;  // visível no select
  slug: string;   // ex.: "eletrica"
  prefix: string; // ex.: "ELE"
};

export const CATEGORY_OPTIONS: CategoryOption[] = [
  { label: "Automático (tentar deduzir)", slug: "", prefix: "" },
  { label: "Elétrica",       slug: "eletrica",      prefix: "ELE" },
  { label: "Hidráulica",     slug: "hidraulica",    prefix: "HID" },
  { label: "Iluminação",     slug: "iluminacao",    prefix: "ILU" },
  { label: "Pisos",          slug: "pisos",         prefix: "PIS" },
  { label: "Revestimentos",  slug: "revestimentos", prefix: "REV" },
  { label: "Tintas",         slug: "tintas",        prefix: "TIN" }, // aceita PIN/PINT tb
  { label: "Ferragens",      slug: "ferragens",     prefix: "FER" },
  { label: "Madeiras",       slug: "madeiras",      prefix: "MAD" },
  { label: "Insumos",        slug: "insumos",       prefix: "INS" },
  { label: "Tubos (Hidráulica)", slug: "hidraulica", prefix: "TUB" },
];