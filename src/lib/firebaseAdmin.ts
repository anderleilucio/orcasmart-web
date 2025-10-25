import "server-only";
import {
  App,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { ServiceAccount } from "firebase-admin";

/* ======================================================
   🔧 Monta credenciais do Admin SDK (via variáveis .env)
====================================================== */
function buildServiceAccount(): ServiceAccount {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();

  let rawKey =
    process.env.FIREBASE_PRIVATE_KEY ??
    (process.env.FIREBASE_PRIVATE_KEY_B64
      ? Buffer.from(process.env.FIREBASE_PRIVATE_KEY_B64, "base64").toString("utf8")
      : undefined);

  if (!projectId || !clientEmail || !rawKey) {
    throw new Error("Faltam variáveis do Firebase Admin (projectId, clientEmail ou privateKey).");
  }

  // normaliza quebra de linha do private key
  const privateKey = rawKey.replace(/\\n/g, "\n").trim();

  return { projectId, clientEmail, privateKey } as ServiceAccount;
}

/* ======================================================
   🚀 Inicializa o Firebase Admin (singleton)
====================================================== */
function ensureAdminApp(): App {
  const existing = getApps().find((a) => a.name === "orcasmart-admin");
  if (existing) return existing;

  const serviceAccount = buildServiceAccount();
  const app = initializeApp(
    {
      credential: cert(serviceAccount),
      storageBucket: "orcasmart-57561.firebasestorage.app", // ✅ bucket definitivo
    },
    "orcasmart-admin"
  );

  console.info(`[firebaseAdmin] ✅ Conectado ao projeto ${serviceAccount.projectId}`);
  return app;
}

/* ======================================================
   🌍 Exports globais (Admin)
====================================================== */
export const adminApp = ensureAdminApp();
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export const adminStorage = getStorage(adminApp).bucket();

adminDb.settings({ ignoreUndefinedProperties: true });