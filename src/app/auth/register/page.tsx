// src/app/auth/register/page.tsx
"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
} from "firebase/auth";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function RegisterInner() {
  const router = useRouter();
  const qp = useSearchParams();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // se já logado, redireciona
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        const to = qp.get("to") || "/vendedor/produtos";
        router.replace(to);
      }
    });
    return () => unsub();
  }, [router, qp]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);

    if (!nome.trim()) {
      setErro("Informe seu nome.");
      return;
    }
    if (!email.trim() || !senha) {
      setErro("Informe e-mail e senha.");
      return;
    }
    if (senha !== confirma) {
      setErro("As senhas não conferem.");
      return;
    }
    if (senha.length < 6) {
      setErro("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        senha
      );

      // salva nome no perfil
      if (cred.user && nome.trim()) {
        await updateProfile(cred.user, { displayName: nome.trim() });
      }

      // e-mail de verificação (não bloqueia o fluxo)
      try {
        if (cred.user) await sendEmailVerification(cred.user);
      } catch {}

      // redireciona (onAuthStateChanged também cobre)
      const to = qp.get("to") || "/vendedor/produtos";
      router.replace(to);
    } catch (err: unknown) {
      let msg = "Falha ao criar conta.";
      if (isRecord(err)) {
        if (typeof err.message === "string") msg = err.message;
        if (typeof err.code === "string") {
          if (err.code === "auth/email-already-in-use")
            msg = "E-mail já cadastrado.";
          if (err.code === "auth/invalid-email")
            msg = "E-mail inválido.";
          if (err.code === "auth/weak-password")
            msg = "Senha muito fraca (mín. 6 caracteres).";
          if (err.code === "auth/network-request-failed")
            msg = "Sem conexão. Verifique sua internet.";
        }
      }
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
          <p className="text-sm text-slate-600">
            Cadastre-se para usar o OrçaSmart
          </p>
        </div>

        {erro && (
          <div className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">
            {erro}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">Nome</span>
            <input
              type="text"
              autoComplete="name"
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
            <span className="mb-1 block text-sm text-slate-700">
              Confirmar senha
            </span>
            <input
              type={showPwd ? "text" : "password"}
              autoComplete="new-password"
              className="w-full rounded-md border px-3 py-2"
              placeholder="••••••••"
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium px-4 py-2.5 disabled:opacity-60"
          >
            {loading ? "Criando..." : "Criar conta"}
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

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Carregando...</div>}>
      <RegisterInner />
    </Suspense>
  );
}