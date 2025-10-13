// src/lib/catalog/taxonomy.ts
/**
 * Utilitários de taxonomia do catálogo
 * - normalização de texto (sem acento, minúsculo, limpo)
 * - detecção de categoria por sinônimos
 * - formatação de SKU (ex: EST-0001)
 */

export type Category = {
  id?: string;
  code: string;        // ex: "EST"
  name: string;        // ex: "Estrutura"
  synonyms: string[];  // ex: ["ferro","vergalhão","aço ca50","armadura"]
  counter?: number;    // usado para gerar o próximo SKU
};

/** Normaliza textos para comparação (remove acentos, pontuação, etc.) */
export function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")                       // separa acentos
    .replace(/[\u0300-\u036f]/g, "")        // remove acentos
    .replace(/[^a-z0-9\s\-]/g, " ")         // mantém letras, números e hífen
    .replace(/\s+/g, " ")                   // normaliza espaços
    .trim();
}

/** Procura uma categoria baseada nos sinônimos cadastrados */
export function matchCategoryBySynonyms(
  nameOrDesc: string,
  categories: Pick<Category, "code" | "name" | "synonyms">[]
): Pick<Category, "code" | "name"> | null {
  const base = normalize(nameOrDesc);
  for (const c of categories) {
    const pool = [c.name, ...(c.synonyms || [])].map(normalize);
    if (pool.some((s) => base.includes(s))) {
      return { code: c.code, name: c.name };
    }
  }
  return null;
}

/** Formata o SKU no padrão CODE-0001 */
export function formatSku(code: string, n: number) {
  return `${code}-${String(n).padStart(4, "0")}`;
}