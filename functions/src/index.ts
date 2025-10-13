// functions/src/index.ts
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const storage = admin.storage();

// ===== util: deleta objetos do Storage em lote, ignorando erros individuais
async function deleteStorageObjects(paths: string[]) {
  if (!paths?.length) return;
  const bucket = storage.bucket();
  const jobs = paths.map(async (p) => {
    try {
      await bucket.file(p).delete({ ignoreNotFound: true });
    } catch {
      // ignora 404/perm
    }
  });
  await Promise.allSettled(jobs);
}

// ====== 1) Cascata: ao deletar um item do catálogo "products/{sku}"
// - Marca todos seller_products com o mesmo SKU como inativos
// - (opcional) se existir "imageStoragePaths" num seller_product, apaga os arquivos
export const cascadeOnCatalogDelete = functions.firestore
  .document("products/{sku}")
  .onDelete(async (snap, ctx) => {
    const sku = ctx.params.sku as string;
    const BATCH_SIZE = 300;

    let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let processed = 0;

    while (true) {
      let q = db
        .collection("seller_products")
        .where("sku", "==", sku)
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(BATCH_SIZE);

      if (last) q = q.startAfter(last);

      const page = await q.get();
      if (page.empty) break;

      const batch = db.batch();
      const toDeletePaths: string[] = [];

      page.docs.forEach((doc) => {
        // soft delete
        batch.set(
          doc.ref,
          { active: false, updatedAt: new Date() },
          { merge: true }
        );

        // (opcional) coleta caminhos do storage se existirem
        const paths = (doc.get("imageStoragePaths") || []) as string[];
        for (const p of paths) if (p && typeof p === "string") toDeletePaths.push(p);
      });

      await batch.commit();
      processed += page.size;

      // apaga imagens fora do batch para não estourar write time
      if (toDeletePaths.length) {
        await deleteStorageObjects(toDeletePaths);
      }

      last = page.docs[page.docs.length - 1];
      if (page.size < BATCH_SIZE) break;
    }

    console.log(`[cascadeOnCatalogDelete] SKU=${sku} processed=${processed}`);
  });