// src/lib/firebase.ts
// Módulos CLIENTE para usar no navegador (App Router / componentes "use client")

import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  // usar SEMPRE o domínio .firebasestorage.app no client
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!, // ex: orcasmart-57561.firebasestorage.app
};

// Evita reinicialização em HMR (dev)
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Serviços CLIENT
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// (Opcional) Aviso útil se o bucket estiver errado
if (typeof window !== "undefined") {
  const expected = "firebasestorage.app";
  if (!firebaseConfig.storageBucket.endsWith(expected)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Firebase] storageBucket esperado com domínio .${expected}. Atual: ${firebaseConfig.storageBucket}`
    );
  }
}