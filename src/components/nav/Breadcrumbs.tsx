import Link from "next/link";

type Crumb = {
  label: string;
  href?: string; // se não passar, o item é o atual (sem link)
};

type Props = {
  items: Crumb[];
  className?: string;
};

/**
 * Breadcrumbs (trilha de navegação)
 * Exemplo de uso:
 * <Breadcrumbs items={[
 *   { label: "Produtos", href: "/vendedor/produtos/hub" },
 *   { label: "Importar CSV" } // atual (sem href)
 * ]} />
 */
export default function Breadcrumbs({ items, className = "" }: Props) {
  if (!items?.length) return null;

  return (
    <nav aria-label="Breadcrumb" className={["text-sm", className].filter(Boolean).join(" ")}>
      <ol className="flex items-center gap-2 text-slate-500">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={idx} className="flex items-center gap-2">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="hover:text-slate-900 hover:underline transition"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-slate-700 font-medium">{item.label}</span>
              )}

              {!isLast && (
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}