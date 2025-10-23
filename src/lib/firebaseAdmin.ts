import "server-only";

import {
  App,
  cert,
  getApp,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { ServiceAccount } from "firebase-admin";

/* ======================================================================
 * Construção das credenciais (aceita múltiplos formatos)
 * ====================================================================== */
function buildServiceAccount(): ServiceAccount {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

  // 🟢 Caso tenha um JSON completo (direto ou base64)
  if (jsonRaw) {
    const maybeDecoded =
      /^[A-Za-z0-9+/=\s]+$/.test(jsonRaw)
        ? Buffer.from(jsonRaw, "base64").toString("utf8")
        : jsonRaw;

    try {
      const parsed = JSON.parse(maybeDecoded) as Record<string, unknown>;
      const key = String(parsed.private_key ?? "").replace(/\\n/g, "\n");
      return {
        projectId: String(parsed.project_id ?? ""),
        clientEmail: String(parsed.client_email ?? ""),
        privateKey: key,
      };
    } catch (err) {
      console.warn(
        "[firebaseAdmin] Erro ao decodificar FIREBASE_SERVICE_ACCOUNT_JSON:",
        err
      );
      // cai para os envs separados
    }
  }

  // 🔵 Alternativa: variáveis separadas
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();

  let rawKey =
    process.env.FIREBASE_PRIVATE_KEY ??
    (process.env.FIREBASE_PRIVATE_KEY_B64
      ? Buffer.from(
          process.env.FIREBASE_PRIVATE_KEY_B64,
          "base64"
        ).toString("utf8")
      : undefined);

  if (!projectId || !clientEmail || !rawKey) {
    throw new Error(
      "❌ Defina FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY (ou _B64 / _JSON)."
    );
  }

  // 🧹 Remove aspas externas e normaliza quebras de linha
  rawKey = rawKey.trim().replace(/^"|"$/g, "");
  const privateKey = rawKey.replace(/\\n/g, "\n");

  return { projectId, clientEmail, privateKey } as ServiceAccount;
}

/* ======================================================================
 * Normalização do bucket de Storage
 * ====================================================================== */
function normalizeBucket(input?: string, fallbackProjectId?: string): string {
  let s = (input || "").trim();

  if (!s) {
    const p = fallbackProjectId || process.env.FIREBASE_PROJECT_ID || "";
    if (!p)
      throw new Error(
        "❌ Não foi possível deduzir o bucket do Storage (sem projectId)."
      );
    return `${p}.appspot.com`;
  }

  s = s
    .replace(/^gs:\/\//i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^storage\.googleapis\.com\//i, "")
    .split("/")[0];

  // converte .firebasestorage.app → .appspot.com
  if (s.endsWith(".firebasestorage.app")) {
    const project = s.replace(".firebasestorage.app", "");
    return `${project}.appspot.com`;
  }

  if (s.endsWith(".appspot.com")) return s;
  if (!s.includes(".")) return `${s}.appspot.com`;

  return s;
}

/* ======================================================================
 * Singleton (garante apenas uma instância global)
 * ====================================================================== */
function ensureAdminApp(): App {
  const existing = getApps().find((a) => a.name === "orcasmart-admin");
  if (existing) return existing;

  const serviceAccount = buildServiceAccount();
  const storageBucket = normalizeBucket(
    process.env.FIREBASE_STORAGE_BUCKET,
    serviceAccount.projectId
  );

  const app = initializeApp(
    {
      credential: cert(serviceAccount),
      storageBucket,
    },
    "orcasmart-admin"
  );

  console.info(`[firebaseAdmin] ✅ Conectado ao projeto ${serviceAccount.projectId}`);
  return app;
}

/* ======================================================================
 * Exports globais
 * ====================================================================== */
export const adminApp = ensureAdminApp();
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export const adminStorage = getStorage(adminApp).bucket();

adminDb.settings({ ignoreUndefinedProperties: true });