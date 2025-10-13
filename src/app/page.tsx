// src/app/page.tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">OrçaSmart</h1>

      <p className="mt-3 text-slate-600">
        Bem-vindo! Escolha uma área para começar.
      </p>

      <div className="mt-6 flex gap-3">
        <Link
          href="/vendedor/produtos/"
          className="rounded-lg border px-4 py-2 hover:bg-slate-50"
        >
          Ir para Produtos (Vendedor)
        </Link>

        <Link
          href="/vendedor/hub/categorizacao"
          className="rounded-lg border px-4 py-2 hover:bg-slate-50"
        >
          Hub de Categorização
        </Link>
      </div>
    </main>
  );
}