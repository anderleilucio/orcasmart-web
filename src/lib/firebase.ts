// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
const storageBucketEnv =
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  `${projectId}.firebasestorage.app`; // <- garante domínio correto

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId,
  storageBucket: storageBucketEnv, // <- usa .firebasestorage.app
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

if (storageBucketEnv.endsWith(".appspot.com")) {
  // ajuda a detectar build antigo / variável faltando
  console.warn(
    "[Firebase] storageBucket deveria terminar com .firebasestorage.app, mas está:",
    storageBucketEnv
  );
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
// não precisa passar bucket manualmente — já vem do config acima
export const storage = getStorage(app);