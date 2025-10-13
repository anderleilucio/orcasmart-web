// src/app/auth/login/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "firebase/auth";

export default function LoginPage() {
  const router = useRouter();
  const qp = useSearchParams();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // se já estiver logado, redireciona
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        const to = qp.get("to") || "/vendedor/produtos";
        router.replace(to);
      }
    });
    return () => unsub();
  }, [router, qp]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      if (!email.trim() || !senha) {
        throw new Error("Informe e-mail e senha.");
      }
      await signInWithEmailAndPassword(auth, email.trim(), senha);
      // redirecionamento ocorre no onAuthStateChanged
    } catch (err: any) {
      let msg = err?.message || "Falha ao entrar.";
      // mensagens mais amigáveis
      if (err?.code === "auth/invalid-credential") msg = "E-mail ou senha inválidos.";
      if (err?.code === "auth/too-many-requests") msg = "Muitas tentativas. Tente novamente em instantes.";
      if (err?.code === "auth/network-request-failed") msg = "Sem conexão. Verifique sua internet.";
      setErro(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center bg-white">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">Entrar</h1>
          <p className="text-sm text-slate-600">Acesse sua conta do OrcaSmart</p>
        </div>

        {erro && (
          <div className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">
            {erro}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">E-mail</span>
            <input
              type="email"
              autoComplete="email"
              className="w-full rounded-md border px-3 py-2"
              placeholder="voce@empresa.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">Senha</span>
            <div className="flex items-stretch gap-2">
              <input
                type={showPwd ? "text" : "password"}
                autoComplete="current-password"
                className="w-full rounded-md border px-3 py-2"
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="rounded-md border px-3 text-sm"
                title={showPwd ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPwd ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium px-4 py-2.5 disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          <Link
            href="/auth/reset"
            className="text-violet-700 hover:underline"
          >
            Esqueci minha senha
          </Link>
          <Link
            href="/auth/register"
            className="text-slate-700 hover:underline"
          >
            Criar conta
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Protegido por Firebase Authentication
        </p>
      </div>
    </main>
  );
}