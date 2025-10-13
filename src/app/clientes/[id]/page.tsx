"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

export default function EditarClientePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoadingUser(false);
      if (!u) {
        router.replace("/auth/login");
        return;
      }

      if (id) {
        const snap = await getDoc(doc(db, "clients", id));
        if (snap.exists()) {
          const data = snap.data() as any;
          setName(data.name ?? "");
          setEmail(data.email ?? "");
          setPhone(data.phone ?? "");
          setAddress(data.address ?? "");
        }
      }
    });

    return () => unsub();
  }, [id, router]);

  async function salvar() {
    if (!id) return;
    startTransition(async () => {
      await updateDoc(doc(db, "clients", id), {
        name,
        email,
        phone,
        address,
        updatedAt: serverTimestamp(),
      });
      router.push("/clientes");
    });
  }

  async function excluir() {
    if (!id) return;
    const confirma = confirm("Deseja realmente excluir este cliente?");
    if (!confirma) return;
    startTransition(async () => {
      await deleteDoc(doc(db, "clients", id));
      router.push("/clientes");
    });
  }

  if (loadingUser) return <main className="p-6">Carregando…</main>;
  if (!user) return null;

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Editar Cliente</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 bg-transparent"
            placeholder="Nome do cliente"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 bg-transparent"
            placeholder="email@cliente.com"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Telefone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 bg-transparent"
            placeholder="(00) 00000-0000"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Endereço</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 bg-transparent"
            placeholder="Rua, número, cidade"
          />
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={salvar}
          disabled={isPending}
          className="rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 disabled:opacity-60"
        >
          Salvar
        </button>
        <button
          onClick={excluir}
          disabled={isPending}
          className="rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 disabled:opacity-60"
        >
          Excluir
        </button>
      </div>
    </main>
  );
}