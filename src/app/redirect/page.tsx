"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function RedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth/login");
        return;
      }

      try {
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();
          if (data.role === "vendedor") {
            router.replace("/vendedor");
          } else {
            router.replace("/cliente");
          }
        } else {
          // se não tiver role, joga como cliente por padrão
          router.replace("/cliente");
        }
      } catch (err) {
        console.error("Erro ao buscar role:", err);
        router.replace("/cliente");
      }
    });

    return () => unsub();
  }, [router]);

  return (
    <main className="p-6">
      <p>Carregando sua área…</p>
    </main>
  );
}