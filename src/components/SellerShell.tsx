"use client";

import React from "react";

/**
 * Shell do vendedor SEM:
 * - Topbar (busca + casa/sino/avatar + Sair)
 * - Sidebar (Loja/Visão geral/Produtos/etc.)
 * - FAB "+ Novo produto"
 *
 * Mantém apenas o conteúdo do dashboard.
 */
export default function SellerShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      {/* Topbar REMOVIDA */}
      {/* Sidebar REMOVIDA */}

      {/* Conteúdo principal em largura total */}
      <main className="w-full max-w-[1200px] mx-auto px-4 py-6">
        {children}
      </main>

      {/* FAB "+ Novo produto" REMOVIDO */}
    </div>
  );
}