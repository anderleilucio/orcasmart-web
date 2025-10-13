"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, Package, ShoppingCart, MessageCircle, Truck, Percent, Settings, Store } from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const items = [
    { href: "/vendedor", icon: BarChart2, label: "Visão geral" },
    { href: "/vendedor/produtos", icon: Package, label: "Produtos" },
    { href: "/vendedor/pedidos", icon: ShoppingCart, label: "Pedidos" },
    { href: "/vendedor/mensagens", icon: MessageCircle, label: "Mensagens" },
    { href: "/vendedor/entregas", icon: Truck, label: "Entregas" },
    { href: "/vendedor/promocoes", icon: Percent, label: "Promoções" },
    { href: "/vendedor/config", icon: Settings, label: "Configurações" },
  ];

  return (
    <aside className="fixed top-0 left-0 h-screen w-64 border-r bg-white z-50">
      <div className="p-4 flex items-center gap-2">
        <Store className="h-6 w-6" />
        <div>
          <p className="text-sm text-slate-500">Loja</p>
          <p className="font-semibold leading-5">Materiais Pinhal</p>
        </div>
      </div>

      <nav className="px-2 space-y-1">
        {items.map((it) => {
          const active = pathname === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-slate-100 ${
                active ? "bg-slate-100 font-medium" : ""
              }`}
            >
              <it.icon className="h-4 w-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto absolute bottom-3 left-4 text-xs text-slate-400">
        OrçaSmart © 2025
      </div>
    </aside>
  );
}