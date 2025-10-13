import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage().bucket(); // bucket padrão do projeto
const RETENTION_DAYS = 30;

export const purgeOldDeletedSellerProducts = functions.scheduler.onSchedule(
  "every day 03:00", // horário UTC
  async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    const q = await db
      .collection("seller_products")
      .where("active", "==", false)
      .where("deletedAt", "<=", cutoff)
      .limit(200) // processa em lotes
      .get();

    for (const doc of q.docs) {
      const d = doc.data() as any;

      // 1) Apagar imagens (usa path se disponível; senão tenta a partir da URL)
      const paths: string[] = Array.isArray(d.imageStoragePaths)
        ? d.imageStoragePaths
        : [];

      for (const p of paths) {
        try {
          await storage.file(p).delete({ ignoreNotFound: true });
        } catch (e) {
          console.warn("delete storage path failed", p, e);
        }
      }

      // (opcional) fallback muito simples a partir da URL pública
      if (!paths?.length && Array.isArray(d.imageUrls)) {
        for (const url of d.imageUrls) {
          try {
            // tenta extrair o path entre o bucket e o ?token=...
            const m = decodeURIComponent(url).match(/\/o\/([^?]+)\?/);
            const guessPath = m?.[1]?.replace(/%2F/g, "/");
            if (guessPath) await storage.file(guessPath).delete({ ignoreNotFound: true });
          } catch (e) {
            console.warn("delete from url failed", url, e);
          }
        }
      }

      // 2) Apagar o documento
      await doc.ref.delete();
    }

    console.log(`Purge done: ${q.size} docs processados`);
  }
);