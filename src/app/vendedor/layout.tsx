"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import {
  BarChart2,
  Bell,
  Home,
  MessageCircle,
  Package,
  Percent,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  LogOut,
  Search,
} from "lucide-react";

export default function VendedorLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
      if (!u) router.replace("/auth/login");
    });
  }, [router]);

  async function doLogout() {
    try {
      await signOut(auth);
    } finally {
      router.replace("/auth/login");
    }
  }

  if (checking) return <div className="p-6">Carregando…</div>;
  if (!user) return null;

  return (
    <div className="h-screen w-full bg-slate-50 text-slate-900 flex">
      {/* LADO ESQUERDO FIXO */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col gap-2 border-r bg-white/80 backdrop-blur p-4 sticky top-0 h-screen">
        <div className="flex items-center gap-2 px-2 py-1">
          <Store className="h-6 w-6" />
          <div>
            <p className="text-sm text-slate-500">Loja</p>
            <p className="font-semibold leading-5">Materiais Pinhal</p>
          </div>
        </div>

        <nav className="mt-2 space-y-1">
          <Link
            href="/vendedor"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-slate-100"
          >
            <BarChart2 className="h-4 w-4" /> Visão geral
          </Link>

          {/* 🔁 Agora aponta para o HUB de produtos */}
          <Link
            href="/vendedor/produtos/hub"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-slate-100"
          >
            <Package className="h-4 w-4" /> Produtos
          </Link>

          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-slate-100">
            <ShoppingCart className="h-4 w-4" /> Pedidos
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-slate-100">
            <MessageCircle className="h-4 w-4" /> Mensagens
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-slate-100">
            <Truck className="h-4 w-4" /> Entregas
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-slate-100">
            <Percent className="h-4 w-4" /> Promoções
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-slate-100">
            <Settings className="h-4 w-4" /> Configurações
          </button>
        </nav>

        <div className="mt-auto text-xs text-slate-400 px-2">OrçaSmart © 2025</div>
      </aside>

      {/* COLUNA DIREITA (HEADER FIXO + CONTEÚDO ROLÁVEL) */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                className="pl-9 w-full h-9 rounded-xl border bg-white px-3 text-sm"
                placeholder="Buscar em pedidos, produtos, clientes…"
              />
            </div>

            <button
              onClick={() => router.push("/vendedor")}
              title="Início do vendedor"
              className="h-9 w-9 rounded-xl border flex items-center justify-center"
            >
              <Home className="h-4 w-4" />
            </button>

            <button className="h-9 w-9 rounded-xl border flex items-center justify-center">
              <Bell className="h-4 w-4" />
            </button>

            {/* avatar/indicador */}
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500" />

            <button
              onClick={doLogout}
              className="hidden sm:inline-flex items-center gap-2 h-9 px-3 rounded-xl border text-sm hover:bg-slate-100"
              title="Sair"
            >
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </header>

        {/* CONTEÚDO */}
        <main className="max-w-7xl mx-auto w-full px-4 py-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}