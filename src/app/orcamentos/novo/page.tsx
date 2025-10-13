"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export default function NovoOrcamentoPage() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth/login");
        return;
      }

      try {
        const ref = await addDoc(collection(db, "quotes"), {
          uid: user.uid,
          title: "Novo orçamento",
          clientName: "",
          clientId: null,              // <- vínculo do cliente (a ser escolhido depois)
          status: "draft",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          items: [],                   // opcional: itens do orçamento
        });

        // redireciona direto para a edição do novo orçamento
        router.replace(`/orcamentos/${ref.id}`);
      } catch (e) {
        console.error(e);
        router.replace("/orcamentos");
      }
    });

    return () => unsub();
  }, [router]);

  return (
    <main className="max-w-4xl mx-auto p-6">
      <div className="rounded-xl border px-5 py-8 text-center text-gray-600 dark:text-gray-300">
        Criando novo orçamento…
      </div>
    </main>
  );
}