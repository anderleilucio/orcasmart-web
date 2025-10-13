"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  /** Texto do item. Default: "Produtos" */
  label?: string;
  /** Classe extra para integrar no seu sidebar */
  className?: string;
};

/**
 * Item de menu "Produtos" apontando para o Hub:
 * /vendedor/produtos/hub
 *
 * - Comporta-se como um <li> do seu sidebar: só renderiza o link.
 * - Usa active state quando a URL atual começa com /vendedor/produtos
 * - Não altera nada do que você já tem; é um drop-in replacement.
 */
export default function VendorProductsMenuItem({ label = "Produtos", className = "" }: Props) {
  const pathname = usePathname();
  const isActive =
    pathname === "/vendedor/produtos/hub" ||
    pathname?.startsWith("/vendedor/produtos");

  return (
    <li className={["list-none", className].filter(Boolean).join(" ")}>
      <Link
        href="/vendedor/produtos/hub"
        className={[
          "flex items-center gap-2 rounded-lg px-3 py-2 transition",
          isActive ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100",
        ].join(" ")}
      >
        {/* Ícone simples (substitua pelo seu, se tiver) */}
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <rect x="3" y="4" width="18" height="6" rx="1" />
          <rect x="3" y="14" width="18" height="6" rx="1" />
        </svg>
        <span className="text-sm">{label}</span>
      </Link>

      {/* Subitens opcionais (links diretos), sem interferir em nada existente */}
      <ul className="mt-1 ml-8 space-y-1 text-sm">
        <li>
          <Link href="/vendedor/imagens" className="text-gray-600 hover:underline">
            Usar imagens → CSV
          </Link>
        </li>
        <li>
          <Link href="/vendedor/produtos/importar" className="text-gray-600 hover:underline">
            Importar CSV
          </Link>
        </li>
        <li>
          <Link href="/vendedor/produtos/novo" className="text-gray-600 hover:underline">
            Cadastrar manualmente
          </Link>
        </li>
        <li>
          {/* mantém acesso direto ao catálogo atual (sua listagem existente) */}
          <Link href="/vendedor/produtos" className="text-gray-600 hover:underline">
            Ver catálogo
          </Link>
        </li>
      </ul>
    </li>
  );
}