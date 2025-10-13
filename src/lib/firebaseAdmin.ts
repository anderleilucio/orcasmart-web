// src/lib/firebaseAdmin.ts
import "server-only";
import * as admin from "firebase-admin";
import type { ServiceAccount } from "firebase-admin";

/**
 * Em dev, carregamos .env.local se faltar algo essencial.
 */
try {
  if (
    process.env.NODE_ENV !== "production" &&
    !process.env.FIREBASE_SERVICE_ACCOUNT_JSON &&
    (!process.env.FIREBASE_PROJECT_ID ||
      !process.env.FIREBASE_CLIENT_EMAIL ||
      !process.env.FIREBASE_PRIVATE_KEY ||
      !process.env.FIREBASE_PRIVATE_KEY_B64)
  ) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("dotenv").config({ path: ".env.local" });
  }
} catch {
  /* ignore */
}

/* ======================================================================
 * Credenciais do Admin
 * Aceita:
 *  - FIREBASE_SERVICE_ACCOUNT_JSON (JSON puro ou base64)
 *  - OU: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY(_B64)
 * ====================================================================== */
function buildServiceAccount(): ServiceAccount {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

  if (jsonRaw) {
    try {
      const maybeDecoded =
        // heurística simples de base64 (não perfeito, mas prático)
        /^[A-Za-z0-9+/=\s]+$/.test(jsonRaw) ? Buffer.from(jsonRaw, "base64").toString("utf8") : jsonRaw;

      const parsed = JSON.parse(maybeDecoded);
      if (parsed.private_key) {
        parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
      }
      return parsed as ServiceAccount;
    } catch (e) {
      console.error("[firebaseAdmin] Falha ao parsear FIREBASE_SERVICE_ACCOUNT_JSON:", e);
      // segue para o modo variáveis separadas
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  // PRIVATE_KEY pode vir direta ou em base64
  let rawKey =
    process.env.FIREBASE_PRIVATE_KEY ||
    (process.env.FIREBASE_PRIVATE_KEY_B64
      ? Buffer.from(process.env.FIREBASE_PRIVATE_KEY_B64, "base64").toString("utf8")
      : undefined);

  if (!projectId || !clientEmail || !rawKey) {
    throw new Error(
      "Defina as credenciais do Firebase Admin via FIREBASE_SERVICE_ACCOUNT_JSON " +
        "(JSON ou base64) ou via FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY(_B64)."
    );
  }

  // remove aspas externas e normaliza quebras de linha
  rawKey = rawKey.trim().replace(/^"|"$/g, "");
  const privateKey = rawKey.replace(/\\n/g, "\n");

  return { projectId, clientEmail, privateKey } as ServiceAccount;
}

/* ======================================================================
 * Bucket do Storage para Admin SDK (sempre .appspot.com)
 * Aceita:
 *  - FIREBASE_STORAGE_BUCKET com:
 *      • {project}.appspot.com (ok)
 *      • {project}.firebasestorage.app (converte)
 *      • gs://{project}.appspot.com ou URL https (normaliza)
 *  - Se não vier, deriva de projectId: {projectId}.appspot.com
 * ====================================================================== */
function normalizeBucket(input?: string, fallbackProjectId?: string): string {
  let s = (input || "").trim();

  if (!s) {
    const p = fallbackProjectId || process.env.FIREBASE_PROJECT_ID || "";
    if (!p) throw new Error("Não foi possível deduzir o Storage bucket (sem projectId).");
    return `${p}.appspot.com`;
  }

  // remove prefixos de esquema
  s = s.replace(/^gs:\/\//i, "").replace(/^https?:\/\//i, "").replace(/^storage\.googleapis\.com\//i, "");

  // se vier com caminho após o bucket, corta
  s = s.split("/")[0];

  // converte domínio firebasestorage.app -> appspot.com
  if (s.endsWith(".firebasestorage.app")) {
    const project = s.replace(".firebasestorage.app", "");
    return `${project}.appspot.com`;
  }

  // se já for .appspot.com, ok
  if (s.endsWith(".appspot.com")) return s;

  // se vier só o "projectId"
  if (!s.includes(".")) {
    return `${s}.appspot.com`;
  }

  // fallback conservador
  return s;
}

/* ======================================================================
 * Singleton seguro em dev (HMR) + produção
 * ====================================================================== */
declare global {
  // eslint-disable-next-line no-var
  var __FIREBASE_ADMIN_APP__: admin.app.App | undefined;
}

function initAdmin() {
  if (global.__FIREBASE_ADMIN_APP__) return global.__FIREBASE_ADMIN_APP__;
  if (admin.apps.length) {
    global.__FIREBASE_ADMIN_APP__ = admin.app();
    return global.__FIREBASE_ADMIN_APP__;
  }

  const serviceAccount = buildServiceAccount();

  // bucket pode vir por env; caso não venha, derivamos do projectId
  const desiredBucket = normalizeBucket(process.env.FIREBASE_STORAGE_BUCKET, serviceAccount.projectId);

  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: desiredBucket,
  });

  try {
    // @ts-ignore (compat opção antiga)
    admin.firestore(app).settings?.({ ignoreUndefinedProperties: true });
  } catch {
    /* ignore */
  }

  global.__FIREBASE_ADMIN_APP__ = app;
  return app;
}

/* ======================================================================
 * Exports
 * ====================================================================== */
export const adminApp = initAdmin();
export const adminAuth = admin.auth(adminApp);
export const adminDb = admin.firestore(adminApp);
export const adminStorage = admin.storage(adminApp).bucket(
  (adminApp.options?.storageBucket as string) ||
    normalizeBucket(process.env.FIREBASE_STORAGE_BUCKET, process.env.FIREBASE_PROJECT_ID)
);