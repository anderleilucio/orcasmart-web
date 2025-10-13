"use client";

import UploadImagens from "@/components/UploadImagens";
import BackToHub from "@/components/nav/BackToHub";

export default function PaginaImagens() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Voltar para o Hub */}
      <BackToHub className="mb-6" />

      <section aria-labelledby="titulo-imagens">
        <h1 id="titulo-imagens" className="text-2xl font-bold mb-2">
          Enviar imagens (OrçaSmart)
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Faça upload das fotos dos produtos para gerar links e montar seu CSV automaticamente.
        </p>

        {/* Componente funcional responsável por toda a lógica */}
        <UploadImagens />
      </section>
    </main>
  );
}