"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";

type Quote = {
  id: string;
  title: string;
  clientName?: string;
  status?: string;
  updatedAt?: Timestamp | null;
  total?: number | null;
};

export default function OrcamentosPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [items, setItems] = useState<Quote[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // exige login
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingUser(false);
      if (!u) router.replace("/auth/login");
    });
    return () => unsub();
  }, [router]);

  // carrega a lista do usuário
  useEffect(() => {
    if (!user) return;
    setLoadingList(true);

    const q = query(
      collection(db, "quotes"),
      where("uid", "==", user.uid),
      orderBy("updatedAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Quote[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            title: data.title ?? "(sem título)",
            clientName: data.clientName ?? "",
            status: data.status ?? "draft",
            updatedAt: (data.updatedAt as Timestamp) ?? null,
            total: typeof data.total === "number" ? data.total : null,
          };
        });
        setItems(rows);
        setLoadingList(false);
      },
      (err) => {
        console.error(err);
        setItems([]);
        setLoadingList(false);
      }
    );

    return () => unsub();
  }, [user]);

  const goNovo = () => router.push("/orcamentos/novo");

  const header = useMemo(
    () => (
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Orçamentos</h1>
          <p className="text-gray-600 dark:text-gray-300">
            Crie e gerencie seus orçamentos de construção.
          </p>
        </div>

        {/* Botão 100% confiável usando router.push */}
        <button
          onClick={goNovo}
          className="rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2.5"
          type="button"
        >
          + Novo orçamento
        </button>
      </div>
    ),
    []
  );

  if (loadingUser) return <main className="p-6">Carregando…</main>;
  if (!user) return null; // já redirecionou

  return (
    <main className="max-w-4xl mx-auto p-6">
      {header}

      {loadingList ? (
        <div className="rounded-xl border px-4 py-6">Carregando lista…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border px-5 py-8 text-center">
          <p className="mb-4">Você ainda não tem orçamentos.</p>
          <button
            onClick={goNovo}
            className="inline-flex rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2.5"
            type="button"
          >
            Criar primeiro orçamento
          </button>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {items.map((q) => {
            const dt = q.updatedAt?.toDate ? q.updatedAt.toDate() : null;

            return (
              <li key={q.id} className="px-4 py-4">
                {/* Item clicável — depois vamos apontar para /orcamentos/[id] */}
                <Link
                  href={`/orcamentos/${q.id}`}
                  className="flex items-center justify-between gap-3 group"
                >
                  <div>
                    <div className="font-medium group-hover:underline">
                      {q.title}
                      {q.clientName ? (
                        <span className="text-gray-500 dark:text-gray-400 ml-2">
                          — {q.clientName}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Status: {q.status}{" "}
                      {dt ? `• atualizado em ${dt.toLocaleDateString()}` : ""}
                    </div>
                  </div>

                  <div className="text-right">
                    {typeof q.total === "number" ? (
                      <div className="font-semibold">
                        {q.total.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </div>
                    ) : (
                      <div className="text-gray-400">—</div>
                    )}
                    <div className="text-xs text-gray-400">#{q.id.slice(0, 6)}</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}