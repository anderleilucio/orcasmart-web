"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import TopBar from "@/components/TopBar";

type Cliente = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  updatedAt?: any;
};

export default function ClientesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [items, setItems] = useState<Cliente[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingUser(false);
      if (!u) router.replace("/auth/login");
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    setLoadingList(true);

    const q = query(
      collection(db, "clients"),
      where("uid", "==", user.uid),
      orderBy("updatedAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Cliente[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name ?? "(sem nome)",
            email: data.email ?? "",
            phone: data.phone ?? "",
            address: data.address ?? "",
            updatedAt: data.updatedAt ?? null,
          };
        });
        setItems(rows);
        setLoadingList(false);
      },
      () => setLoadingList(false)
    );

    return () => unsub();
  }, [user]);

  const header = useMemo(
    () => (
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-semibold">Clientes</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Cadastre e acompanhe seus clientes.
          </p>
        </div>
        <Link
          href="/clientes/novo"
          className="rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2.5"
        >
          + Novo cliente
        </Link>
      </div>
    ),
    []
  );

  if (loadingUser) return <main className="p-6">Carregando…</main>;
  if (!user) return null;

  return (
    <main className="max-w-4xl mx-auto p-6">
      <TopBar title="Clientes" />
      {header}

      {loadingList ? (
        <div className="rounded-xl border px-4 py-6">Carregando lista…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border px-5 py-8 text-center">
          <p className="mb-4">Você ainda não cadastrou clientes.</p>
          <Link
            href="/clientes/novo"
            className="inline-flex rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2.5"
          >
            Cadastrar primeiro cliente
          </Link>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {items.map((c) => {
            const dt = c.updatedAt?.toDate?.() ?? null;
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-4">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {c.email ? `${c.email} • ` : ""}
                    {c.phone}
                    {dt ? ` • atualizado em ${dt.toLocaleDateString()}` : ""}
                  </div>
                </div>
                <Link href={`/clientes/${c.id}`} className="text-sm underline text-purple-700">
                  editar
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}