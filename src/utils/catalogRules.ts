// src/utils/catalogRules.ts

/**
 * Regras e validações do catálogo de produtos
 * Centraliza a padronização de nomes, categorias e SKUs.
 */

export type CatalogItem = {
  sku: string;
  nome: string;
  preco: number;
  estoque?: number;
  ativo: boolean;
  unidade?: string;
  imagem?: string;
  imagens?: string[];
  categoria?: string;
};

/**
 * Normaliza valores numéricos vindos de CSV ou formulário.
 */
export function parseNumber(value: string | number | undefined): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const normalized = String(value)
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

/**
 * Garante que o nome da categoria seja formatado corretamente.
 */
export function formatCategoryName(raw: string | undefined): string {
  if (!raw) return "";
  return raw.trim().replace(/\s+/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Valida um item do catálogo.
 */
export function validateCatalogItem(item: unknown): CatalogItem | null {
  if (!item || typeof item !== "object") return null;

  const data = item as Record<string, unknown>;

  const sku = String(data.sku ?? "").trim();
  const nome = String(data.nome ?? "").trim();
  const preco = parseNumber(data.preco as string | number | undefined);
  const ativo =
    typeof data.ativo === "boolean"
      ? data.ativo
      : String(data.ativo ?? "").toLowerCase() === "true";

  if (!sku || !nome) return null;

  return {
    sku,
    nome,
    preco,
    estoque: parseNumber(data.estoque as string | number | undefined),
    ativo,
    unidade: String(data.unidade ?? "").trim() || undefined,
    imagem: String(data.imagem ?? "").trim() || undefined,
    imagens: Array.isArray(data.imagens)
      ? (data.imagens as string[]).filter(Boolean)
      : undefined,
    categoria: formatCategoryName(data.categoria as string | undefined),
  };
}

/**
 * Regras adicionais — ex: garantir SKU único, categoria padrão etc.
 */
export function applyCatalogRules(items: CatalogItem[]): CatalogItem[] {
  const seen = new Set<string>();
  return items.map((item) => {
    let sku = item.sku;
    if (seen.has(sku)) {
      sku = `${sku}-${Math.floor(Math.random() * 9999)}`;
    }
    seen.add(sku);

    return {
      ...item,
      categoria: item.categoria || "Outros",
    };
  });
}