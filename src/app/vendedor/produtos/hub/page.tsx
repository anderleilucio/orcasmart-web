// src/app/vendedor/produtos/hub/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Produtos — Hub | OrcaSmart",
};

export default function ProdutosHubPage() {
  const cards = [
    {
      title: "Gerar CSV (Fotos & URLs)",
      desc:
        "Selecione fotos e/ou cole URLs. Sugerimos categoria e prefixo do SKU automaticamente (ex.: ELE-, INS-).",
      // ✅ apontando para a sua página que já existe
      href: "/vendedor/imagens",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4 4h16v12H4z" />
          <path d="M4 16l4-4 3 3 5-5 4 4" />
        </svg>
      ),
      cta: "Abrir gerador de CSV",
    },
    {
      title: "Importar CSV para cadastrar",
      desc: "Carregue um arquivo CSV e cadastre/atualize produtos em lote.",
      href: "/vendedor/produtos/importar",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M4 19h16" />
        </svg>
      ),
      cta: "Importar CSV",
    },
    {
      title: "Cadastrar manualmente",
      desc: "Inclua um novo produto preenchendo os campos manualmente.",
      href: "/vendedor/produtos/novo",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      ),
      cta: "Novo produto",
    },
    {
      title: "Ver/Editar catálogo",
      desc: "Busque, filtre, ordene e edite seus produtos já cadastrados.",
      href: "/vendedor/produtos",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <rect x="3" y="4" width="18" height="6" rx="1" />
          <rect x="3" y="14" width="18" height="6" rx="1" />
        </svg>
      ),
      cta: "Abrir catálogo",
    },
    {
      title: "Exportar catálogo (CSV)",
      desc: "Baixe seu catálogo completo no formato compatível com o import.",
      href: "/dev/export",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M4 19h16" />
        </svg>
      ),
      cta: "Baixar CSV",
    },
    {
      title: "Regras de categorização (HUB)",
      desc:
        "Cadastre aliases por categoria (ex.: “cabo 3mm” em Elétrica). Suas sugestões terão prioridade.",
      // ✅ esta página criamos agora há pouco
      href: "/vendedor/hub/categorizacao",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
          <path d="M7 7v10" />
          <path d="M12 7v10" />
          <path d="M17 7v10" />
        </svg>
      ),
      cta: "Abrir regras",
    },
  ];

  return (
    <div className="px-6 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Produtos</h1>
        <p className="text-sm text-gray-600">
          Selecione uma das opções abaixo para gerenciar seu catálogo.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div
            key={c.title}
            className="group border rounded-2xl p-4 bg-white/60 hover:bg-white transition shadow-sm hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gray-100 text-gray-800">{c.icon}</div>
            </div>
            <h2 className="font-semibold text-lg">{c.title}</h2>
            <p className="text-sm text-gray-600 mt-1">{c.desc}</p>

            <div className="mt-4">
              <Link
                href={c.href}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border hover:bg-gray-50 transition"
              >
                {c.cta}
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-gray-500">
        Dica: depois de testar, você pode apontar o menu lateral “Produtos” para{" "}
        <code className="px-1 py-0.5 bg-gray-100 rounded">/vendedor/produtos/hub</code> sem
        alterar suas páginas atuais.
      </div>
    </div>
  );
}