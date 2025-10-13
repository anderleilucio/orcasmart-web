"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Bell, Home, Search } from "lucide-react";

type Weather = { emoji: string; label: string; temp: string };

export default function GlobalHeader() {
  const router = useRouter();
  const pathname = usePathname();

  // mostra só na área logada
  const show =
    pathname?.startsWith("/vendedor") ||
    pathname?.startsWith("/clientes") ||
    pathname?.startsWith("/orcamentos");

  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setWeather({ emoji: "🙂", label: "—", temp: "" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        // Simula clima baseado no horário
        const hour = new Date().getHours();
        const isNight = hour < 6 || hour >= 18;
        setWeather({
          emoji: isNight ? "🌙" : "⛅️",
          label: isNight ? "Noite" : "Parcial",
          temp: "23°C",
        });
      },
      () => {
        setWeather({ emoji: "🙂", label: "—", temp: "" });
      },
      { timeout: 3000 }
    );
  }, []);

  async function handleLogout() {
    try {
      await signOut(auth);
    } finally {
      router.replace("/auth/login");
    }
  }

  if (!show) return null;

  return (
    <header className="fixed top-0 left-64 right-0 z-40 border-b bg-white/80 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
        {/* Busca centralizada */}
        <div className="relative flex-1 max-w-2xl mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            className="pl-9 w-full h-10 rounded-xl border bg-white px-3 text-sm"
            placeholder="Buscar em pedidos, produtos, clientes…"
          />
        </div>

        {/* Casa → início do vendedor */}
        <button
          onClick={() => router.push("/vendedor")}
          title="Início do vendedor"
          className="h-10 w-10 rounded-xl border flex items-center justify-center"
        >
          <Home className="h-5 w-5" />
        </button>

        {/* Sino */}
        <button className="h-10 w-10 rounded-xl border flex items-center justify-center">
          <Bell className="h-5 w-5" />
        </button>

        {/* “Clima” */}
        <div className="h-10 rounded-xl border px-3 flex items-center gap-2">
          <span className="text-lg">{weather?.emoji ?? "🙂"}</span>
          <span className="text-sm opacity-70">{weather?.temp ?? ""}</span>
        </div>

        {/* Sair */}
        <button
          onClick={handleLogout}
          className="h-10 rounded-xl bg-slate-900 text-white px-4 text-sm"
        >
          Sair
        </button>
      </div>
    </header>
  );
}