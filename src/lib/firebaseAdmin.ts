// src/lib/firebaseAdmin.ts
import "server-only";

import { App, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { ServiceAccount } from "firebase-admin";

/* ======================================================================
 * Credenciais do Admin
 * Aceita:
 *  - FIREBASE_SERVICE_ACCOUNT_JSON (JSON puro ou base64)
 *  - OU: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY(_B64)
 * ====================================================================== */
function buildServiceAccount(): ServiceAccount {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

  if (jsonRaw) {
    // Heurística simples: se parecer base64, decodifica; senão, usa como JSON direto
    const maybeDecoded =
      /^[A-Za-z0-9+/=\s]+$/.test(jsonRaw)
        ? Buffer.from(jsonRaw, "base64").toString("utf8")
        : jsonRaw;

    try {
      const parsed = JSON.parse(maybeDecoded) as Record<string, unknown>;
      const key = String(parsed.private_key ?? "");
      return {
        projectId: String(parsed.project_id ?? ""),
        clientEmail: String(parsed.client_email ?? ""),
        privateKey: key.replace(/\\n/g, "\n"),
      };
    } catch {
      // se falhar o parse, cai para os envs separados
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();

  // PRIVATE_KEY pode vir direta ou em base64
  let rawKey =
    process.env.FIREBASE_PRIVATE_KEY ??
    (process.env.FIREBASE_PRIVATE_KEY_B64
      ? Buffer.from(process.env.FIREBASE_PRIVATE_KEY_B64, "base64").toString("utf8")
      : undefined);

  if (!projectId || !clientEmail || !rawKey) {
    throw new Error(
      "Defina as credenciais do Firebase Admin via FIREBASE_SERVICE_ACCOUNT_JSON " +
        "(JSON/base64) ou via FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY(_B64)."
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
  s = s
    .replace(/^gs:\/\//i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^storage\.googleapis\.com\//i, "");

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
 * Singleton seguro (dev com HMR + produção)
 * ====================================================================== */
function ensureAdminApp(): App {
  if (getApps().length) return getApp();

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
    // nome explícito evita colisões em ambientes com HMR
    "orcasmart-admin"
  );

  return app;
}

/* ======================================================================
 * Exports
 * ====================================================================== */
export const adminApp = ensureAdminApp();
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export const adminStorage = getStorage(adminApp).bucket();

// Firestore: ignora undefined nos writes (opcional)
adminDb.settings({ ignoreUndefinedProperties: true });