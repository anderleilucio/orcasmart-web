import Image from "next/image";

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-6 row-start-2 items-center sm:items-start">
        <Image
          src="/orcamento_logo.png"
          alt="Logo OrçaSmart"
          width={180}
          height={38}
          priority
        />

        <h1 className="text-4xl font-bold text-center sm:text-left">
          Bem-vindo ao OrçaSmart 🚀
        </h1>

        <p className="text-lg text-gray-600 dark:text-gray-300 text-center sm:text-left max-w-xl">
          A forma mais rápida e inteligente de fazer orçamentos de construção.
        </p>

        <div className="flex gap-4 items-center flex-col sm:flex-row mt-6">
          <a
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-purple-600 text-white gap-2 hover:bg-purple-700 font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-6 sm:w-auto"
            href="/vendedor/produtos"
          >
            Começar agora
          </a>
          <a
            className="rounded-full border border-solid border-gray-400 dark:border-gray-600 transition-colors flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-6 sm:w-auto"
            href="/sobre"
          >
            Saiba mais
          </a>
        </div>
      </main>

      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        <p>© {new Date().getFullYear()} OrçaSmart. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}