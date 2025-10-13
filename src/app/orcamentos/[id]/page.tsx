"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";

type Quote = {
  id: string;
  uid: string;
  title: string;
  clientName?: string;
  clientId?: string | null;
  status?: "draft" | "open" | "em_andamento" | "entregue";
  updatedAt?: any;
};

type Cliente = {
  id: string;
  name: string;
};

export default function EditarOrcamentoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // dados do orçamento
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Quote["status"]>("draft");
  const [clientId, setClientId] = useState<string | "">(""); // "" = nenhum
  const [clientName, setClientName] = useState("");

  // lista de clientes do usuário
  const [clientes, setClientes] = useState<Cliente[]>([]);

  // exige login
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoadingUser(false);
      if (!u) {
        router.replace("/auth/login");
        return;
      }
    });
    return () => unsub();
  }, [router]);

  // carrega orçamento
  useEffect(() => {
    if (!user || !id) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const ref = doc(db, "quotes", id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setError("Orçamento não encontrado.");
          return;
        }
        const data = snap.data() as any;

        // segurança básica no cliente
        if (data.uid && data.uid !== user.uid) {
          setError("Você não tem acesso a este orçamento.");
          return;
        }

        setTitle(data.title ?? "");
        setStatus((data.status as Quote["status"]) ?? "draft");
        setClientId(data.clientId ?? "");
        setClientName(data.clientName ?? "");
      } catch (e: any) {
        setError(e?.message ?? "Erro ao carregar orçamento.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, id]);

  // carrega clientes do usuário (para o select)
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "clients"),
      where("uid", "==", user.uid),
      orderBy("name", "asc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name ?? "(sem nome)" }));
        setClientes(rows);
      },
      (err) => {
        console.error(err);
      }
    );
    return () => unsub();
  }, [user]);

  // nome do cliente selecionado (para gravar como denormalização)
  const selectedClientName = useMemo(() => {
    if (!clientId) return "";
    return clientes.find((c) => c.id === clientId)?.name ?? "";
  }, [clientId, clientes]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;

    startSaving(async () => {
      try {
        await updateDoc(doc(db, "quotes", id), {
          title: title.trim() || "Novo orçamento",
          status: status || "draft",
          clientId: clientId || null,
          clientName: clientId ? selectedClientName : "", // denormaliza para facilitar listagens
          updatedAt: serverTimestamp(),
        });
        router.push("/orcamentos");
        router.refresh();
      } catch (e: any) {
        setError(e?.message ?? "Falha ao salvar.");
      }
    });
  }

  if (loadingUser) return <main className="p-6">Carregando…</main>;
  if (!user) return null;

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto p-6">Carregando orçamento…</main>
    );
  }

  if (error) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => router.push("/orcamentos")}
          className="mt-4 rounded-lg border px-4 py-2"
        >
          Voltar para a lista
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Editar Orçamento</h1>

      <form onSubmit={onSave} className="space-y-5 max-w-3xl">
        <div>
          <label className="block text-sm mb-1">Título</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 bg-transparent"
            placeholder="Título do orçamento"
          />
        </div>

        {/* Seleção de cliente */}
        <div>
          <label className="block text-sm mb-1">Cliente</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 bg-transparent"
          >
            <option value="">— Nenhum cliente —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {clientId ? (
            <p className="text-xs text-gray-500 mt-1">
              Selecionado: {selectedClientName}
            </p>
          ) : null}
        </div>

        {/* Status simples */}
        <div>
          <label className="block text-sm mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Quote["status"])}
            className="w-full rounded-lg border px-3 py-2 bg-transparent"
          >
            <option value="draft">Rascunho</option>
            <option value="open">Aberto</option>
            <option value="em_andamento">Em andamento</option>
            <option value="entregue">Entregue</option>
          </select>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium px-5 py-2.5 disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/orcamentos")}
            className="rounded-lg border px-5 py-2.5"
          >
            Cancelar
          </button>
        </div>
      </form>
    </main>
  );
}