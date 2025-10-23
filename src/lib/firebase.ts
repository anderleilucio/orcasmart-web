"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

/**
 * 🔧 Configuração do Firebase (Client SDK)
 * Usa .firebasestorage.app (novo domínio oficial do Firebase Storage)
 */

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
const defaultBucket = `${projectId}.firebasestorage.app`;

// Se variável estiver ausente, usa fallback correto (.firebasestorage.app)
const storageBucketEnv =
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || defaultBucket;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId,
  storageBucket: storageBucketEnv,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// 🟡 Alerta apenas em modo DEV (para evitar ruído no console em produção)
if (
  process.env.NODE_ENV !== "production" &&
  storageBucketEnv.endsWith(".appspot.com")
) {
  console.warn(
    `[Firebase] storageBucket deveria terminar com ".firebasestorage.app", mas está: "${storageBucketEnv}".`
  );
}

// Singleton para evitar múltiplas inicializações
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Exports
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;