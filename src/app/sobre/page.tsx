export default function SobrePage() {
  return (
    <main className="max-w-2xl mx-auto py-16 px-6">
      <h1 className="text-4xl font-bold mb-4">Sobre o OrçaSmart</h1>
      <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
        O OrçaSmart é a forma mais rápida e inteligente de fazer orçamentos de
        construção. Nossa missão é facilitar a vida de clientes, lojistas e
        construtores com tecnologia simples e acessível.
      </p>

      <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
        <li>📊 Compare preços em tempo real</li>
        <li>🛒 Gere orçamentos em poucos cliques</li>
        <li>🚚 Entregas rápidas com parceiros locais</li>
        <li>💳 Pagamento fácil e seguro</li>
      </ul>
    </main>
  );
}