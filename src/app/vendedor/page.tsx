// src/app/vendedor/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageCircle, Truck, Percent, Filter } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

/* -- dados de demonstração -- */
const kpis = [
  { label: "Vendas hoje", value: "R$ 7.540,00", delta: "+12%", positive: true },
  { label: "Pedidos pendentes", value: "18", delta: "−3", positive: true },
  { label: "Ticket médio", value: "R$ 312,40", delta: "+6%", positive: true },
  { label: "Estoque baixo", value: "9 itens", delta: "+2", positive: false },
];

const chartData = [
  { name: "Seg", vendas: 3200 },
  { name: "Ter", vendas: 4100 },
  { name: "Qua", vendas: 2950 },
  { name: "Qui", vendas: 5120 },
  { name: "Sex", vendas: 7480 },
  { name: "Sáb", vendas: 3840 },
  { name: "Dom", vendas: 2210 },
];

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "emerald" | "rose" | "yellow" | "blue";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-100 text-emerald-800",
    rose: "bg-rose-100 text-rose-800",
    yellow: "bg-yellow-100 text-yellow-800",
    blue: "bg-blue-100 text-blue-800",
  };
  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export default function VendedorDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
      if (!u) router.replace("/auth/login");
    });
    return () => unsub();
  }, [router]);

  if (checking) return <main className="p-6">Carregando…</main>;
  if (!user) return null;

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      {/* ❌ Sidebar removida */}
      {/* ❌ Header/topbar removida */}

      <main className="max-w-7xl mx-auto w-full px-4 py-6 space-y-6">
        {/* KPIs */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl border bg-white">
              <div className="px-4 pt-4 pb-1 text-sm text-slate-500 font-medium">
                {k.label}
              </div>
              <div className="px-4 pb-4 flex items-end justify-between">
                <div className="text-2xl font-semibold">{k.value}</div>
                <Badge tone={k.positive ? "emerald" : "rose"}>{k.delta}</Badge>
              </div>
            </div>
          ))}
        </section>

        {/* Gráfico + Ações rápidas */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="rounded-2xl border bg-white xl:col-span-2">
            <div className="px-4 pt-4 pb-0 flex items-center justify-between">
              <h3 className="font-semibold">Vendas da semana</h3>
              <select className="h-9 rounded-xl border px-2 text-sm">
                <option>Últimos 7 dias</option>
                <option>Últimos 30 dias</option>
                <option>Últimos 90 dias</option>
              </select>
            </div>
            <div className="h-64 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ left: 4, right: 4 }}>
                  <defs>
                    <linearGradient id="vendas" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="#6366F1"
                        stopOpacity={0.18}
                      />
                      <stop
                        offset="95%"
                        stopColor="#6366F1"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip
                    formatter={(v: unknown) =>
                      `R$ ${Number(v as number).toLocaleString("pt-BR")}`
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="vendas"
                    stroke="#6366F1"
                    fillOpacity={1}
                    fill="url(#vendas)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border bg-white">
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <h3 className="font-semibold">Ações rápidas</h3>
              <button className="text-sm inline-flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-100">
                <Filter className="h-4 w-4" /> Personalizar
              </button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <Link
                href="/vendedor/produtos?promo=queima"
                className="rounded-xl h-20 border bg-slate-50 hover:bg-slate-100 flex items-center justify-start gap-3 px-3 text-sm"
              >
                <Percent className="h-5 w-5" /> Queima de estoque
              </Link>
              <button className="rounded-xl h-20 border bg-slate-50 hover:bg-slate-100 flex items-center justify-start gap-3 px-3 text-sm">
                <Truck className="h-5 w-5" /> Regras de entrega
              </button>
              <button className="rounded-xl h-20 border bg-slate-50 hover:bg-slate-100 flex items-center justify-start gap-3 px-3 text-sm">
                <MessageCircle className="h-5 w-5" /> Orçamentos por Chat
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}