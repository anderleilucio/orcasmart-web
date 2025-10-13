"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
// …(outros imports que você já tem)

function RegisterInner() {
  const qp = useSearchParams();
  const router = useRouter();

  // TODO: mantenha aqui TODO o código atual da sua página que usa qp/router,
  // estados, handlers, JSX etc. Nada muda além de estar dentro deste componente.
  return (
    /* seu JSX atual da página de registro */
    <div>...</div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Carregando…</div>}>
      <RegisterInner />
    </Suspense>
  );
}