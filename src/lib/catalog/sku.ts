// src/lib/catalog/sku.ts
/**
 * Geração automática e segura de SKU por categoria.
 * Usa transação no Firestore para evitar duplicidade (ex: EST-0001, EST-0002...).
 */

import { adminDb } from "@/lib/firebaseAdmin";
import { formatSku } from "./taxonomy";

/**
 * Busca o próximo SKU disponível para uma categoria e incrementa o contador.
 * Exemplo: getNextSkuForCategory("EST") → "EST-0003"
 */
export async function getNextSkuForCategory(categoryCode: string): Promise<string> {
  // Busca a categoria pelo código
  const snap = await adminDb
    .collection("categories")
    .where("code", "==", categoryCode)
    .limit(1)
    .get();

  if (snap.empty) {
    throw new Error(`Categoria com code "${categoryCode}" não encontrada`);
  }

  const docRef = snap.docs[0].ref;
  let newNumber = 1;

  // Transação para evitar dois SKUs iguais
  await adminDb.runTransaction(async (tx) => {
    const doc = await tx.get(docRef);
    const current = (doc.get("counter") as number) || 0;
    newNumber = current + 1;
    tx.update(docRef, { counter: newNumber });
  });

  return formatSku(categoryCode, newNumber);
}