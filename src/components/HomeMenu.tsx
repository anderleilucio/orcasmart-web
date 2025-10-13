"use client";

import Link from "next/link";

const items = [
  { href: "/orcamentos", title: "Orçamentos", desc: "Crie e gerencie orçamentos" },
  { href: "/clientes",   title: "Clientes",   desc: "Cadastre e acompanhe clientes" },
  { href: "/sobre",      title: "Sobre",      desc: "Informações do OrçaSmart" },
];

export default function HomeMenu() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-10">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-2xl border border-gray-200 dark:border-gray-800 p-6 hover:shadow-md transition-shadow"
        >
          <h3 className="text-lg font-semibold mb-1">{item.title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">{item.desc}</p>
        </Link>
      ))}
    </div>
  );
}