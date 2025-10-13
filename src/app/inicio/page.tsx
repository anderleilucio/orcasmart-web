"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Home } from "lucide-react";

export default function InicioCliente() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) router.replace("/auth/login");
    });
    return () => unsub();
  }, [router]);

  if (!user) return <main className="p-6">Carregando…</main>;

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header simples, sem botão Sair */}
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Página do cliente</h1>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-slate-100"
          title="Ir para o início"
        >
          <Home className="h-4 w-4" />
          Início
        </Link>
      </header>

      <p className="opacity-80">Bem-vindo! Aqui vai o conteúdo do cliente.</p>
    </main>
  );
}