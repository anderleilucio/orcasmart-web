"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

type Props = {
  /** Texto do botão (padrão: "Hub de produtos") */
  label?: string;
  /** Classes extras para ajuste de layout */
  className?: string;
  /** URL de destino (padrão: /vendedor/produtos/hub) */
  href?: string;
};

/**
 * Botão padrão para voltar ao Hub de Produtos.
 * Uso:
 *   <BackToHub className="mb-4" />
 */
export default function BackToHub({
  label = "Hub de produtos",
  className = "",
  href = "/vendedor/produtos/hub",
}: Props) {
  return (
    <div className={["w-full", className].filter(Boolean).join(" ")}>
      <Link
        href={href}
        className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
        aria-label={`Voltar para ${label}`}
      >
        <ChevronLeft className="h-4 w-4" />
        <span>← {label}</span>
      </Link>
    </div>
  );
}