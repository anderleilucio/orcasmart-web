'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Loga no console do navegador e no terminal do Next
  // (útil para ver stack trace)
  console.error('[GlobalError]', error);

  return (
    <html lang="pt-BR">
      <body style={{
        margin: 0,
        padding: '24px',
        fontFamily: 'ui-sans-serif, system-ui',
        background: '#fff',
        color: '#111',
      }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Ocorreu um erro na interface</h1>
        <p style={{ marginBottom: 16 }}>
          Em vez de tela branca, mostramos esta página para você poder corrigir rapidamente.
        </p>

        <pre style={{
          background: '#f6f6f6',
          padding: '12px',
          borderRadius: 8,
          overflowX: 'auto',
          lineHeight: 1.4,
          maxHeight: 320,
        }}>
{String(error?.message || error).slice(0, 4000)}
        </pre>

        <button
          onClick={() => reset()}
          style={{
            marginTop: 16,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #ddd',
            cursor: 'pointer',
            background: '#fafafa',
          }}
        >
          Tentar novamente
        </button>
      </body>
    </html>
  );
}