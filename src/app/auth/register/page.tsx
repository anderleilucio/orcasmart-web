// src/app/auth/register/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
} from "firebase/auth";

export default function RegisterPage() {
  const router = useRouter();
  const qp = useSearchParams();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [erro, setErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // se já estiver logado, manda pra área do vendedor
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
    setOkMsg(null);

    try {
      if (!nome.trim()) throw new Error("Informe seu nome.");
      if (!email.trim()) throw new Error("Informe um e-mail válido.");
      if (senha.length < 6) throw new Error("A senha precisa ter ao menos 6 caracteres.");
      if (senha !== senha2) throw new Error("As senhas não conferem.");

      setLoading(true);

      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        senha
      );

      // salva o nome de exibição
      await updateProfile(cred.user, { displayName: nome.trim() });

      // dispara verificação de e-mail (opcional mas recomendado)
      try {
        await sendEmailVerification(cred.user);
        setOkMsg("Conta criada! Enviamos um e-mail para verificação.");
      } catch {
        /* ignore */
      }

      // redireciona para a área do vendedor (ou onboarding no futuro)
      const to = qp.get("to") || "/vendedor/produtos";
      router.replace(to);
    } catch (err: any) {
      let msg = err?.message || "Falha ao criar conta.";
      if (err?.code === "auth/email-already-in-use") msg = "Este e-mail já está em uso.";
      if (err?.code === "auth/invalid-email") msg = "E-mail inválido.";
      if (err?.code === "auth/weak-password") msg = "Senha fraca (mínimo 6 caracteres).";
      setErro(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center bg-white">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">Criar conta</h1>
          <p className="text-sm text-slate-600">Bem-vindo ao OrcaSmart</p>
        </div>

        {erro && (
          <div className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">
            {erro}
          </div>
        )}
        {okMsg && (
          <div className="mb-4 rounded-lg border border-green-400/40 bg-green-500/10 px-4 py-3 text-sm text-green-700">
            {okMsg}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">Nome</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="Seu nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </label>

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
                autoComplete="new-password"
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

          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">Confirmar senha</span>
            <input
              type={showPwd ? "text" : "password"}
              autoComplete="new-password"
              className="w-full rounded-md border px-3 py-2"
              placeholder="••••••••"
              value={senha2}
              onChange={(e) => setSenha2(e.target.value)}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium px-4 py-2.5 disabled:opacity-60"
          >
            {loading ? "Criando conta..." : "Criar conta"}
          </button>
        </form>

        <div className="mt-4 text-sm text-center">
          Já tem conta?{" "}
          <Link href="/auth/login" className="text-violet-700 hover:underline">
            Entrar
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Protegido por Firebase Authentication
        </p>
      </div>
    </main>
  );
}