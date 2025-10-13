"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export default function NovoClientePage() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth/login");
        return;
      }

      try {
        const ref = await addDoc(collection(db, "clients"), {
          uid: user.uid,
          name: "Novo cliente",
          email: "",
          phone: "",
          address: "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        router.replace(`/clientes/${ref.id}`);
      } catch (e) {
        console.error(e);
        router.replace("/clientes");
      }
    });

    return () => unsub();
  }, [router]);

  return (
    <main className="max-w-4xl mx-auto p-6">
      <div className="rounded-xl border px-5 py-8 text-center text-gray-600 dark:text-gray-300">
        Criando novo cliente…
      </div>
    </main>
  );
}