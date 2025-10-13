// src/utils/catalogRules.ts
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * Palavras muito comuns que não ajudam a classificar.
 * Ajuste livremente (mantive curto para evitar ruído).
 */
const STOPWORDS = new Set<string>([
  "de", "da", "do", "e", "ou", "a", "o", "as", "os", "para", "com", "sem", "por",
  "cp", "ii", "iii", "iv", "v", "kg", "mm", "cm", "m", "un", "und"
]);

/** Normaliza texto: minúsculas, sem acentos, só letras/números/espaço */
export function normTerm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Aprende 1–2 termos "bons" do nome e grava/atualiza em catalog_rules do usuário.
 * - Documento por dono+categoria: `${ownerId}:${slug}`
 * - Mantém lista de termos e contagem por termo (para priorização futura)
 * - Limite de termos por categoria para evitar ruído (default 30)
 */
export async function learnRuleTerm(
  ownerId: string,
  slug: string,
  rawName: string,
  maxPerCategory = 30
) {
  if (!ownerId || !slug || !rawName) return;

  // Tokeniza nome e filtra candidatos úteis
  const tokens = normTerm(rawName).split(" ").filter(Boolean);
  const candidates = tokens.filter((t) => t.length >= 4 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  if (!candidates.length) return;

  const docId = `${ownerId}:${slug}`;
  const docRef = adminDb.collection("catalog_rules").doc(docId);

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data =
      (snap.exists ? (snap.data() as any) : { ownerId, category: slug, terms: [], counts: {}, active: true }) ||
      { ownerId, category: slug, terms: [], counts: {}, active: true };

    // Escolhe no máx. 2 termos por chamada, simples e robusto.
    for (const term of candidates.slice(0, 2)) {
      if (!data.terms.includes(term)) {
        if (Array.isArray(data.terms) && data.terms.length >= maxPerCategory) break; // limita ruído
        data.terms = Array.isArray(data.terms) ? data.terms : [];
        data.terms.push(term);
      }
      data.counts = data.counts || {};
      data.counts[term] = (data.counts[term] || 0) + 1;
    }

    data.updatedAt = Date.now();
    tx.set(docRef, data, { merge: true });
  });
}