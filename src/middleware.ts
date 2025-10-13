// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ paths públicos (NÃO exigem login)
  if (
    pathname.startsWith("/auth/login") ||
    pathname.startsWith("/api/_envcheck") // <-- liberar rota de diagnóstico
  ) {
    return NextResponse.next();
  }

  // ... seu código atual de verificação (cookies/session) ...
  // se não autenticado -> redirect para /auth/login
  // return NextResponse.redirect(new URL("/auth/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};