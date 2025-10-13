// src/hooks/useCategories.ts
"use client";

import { useEffect, useMemo, useState } from "react";

export type Category = {
  id: string;        // = code
  code: string;
  name: string;
  synonyms?: string[];
  active?: boolean;
  counter?: number;
};

export function useCategories(opts?: { includeInactive?: boolean }) {
  const [data, setData] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const qs = useMemo(() => {
    const q = new URLSearchParams();
    if (opts?.includeInactive) q.set("include_inactive", "1");
    return q.toString() ? `?${q.toString()}` : "";
  }, [opts?.includeInactive]);

  async function refetch() {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/categories/list${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      const items = Array.isArray(json.items) ? json.items : [];
      setData(items as Category[]);
    } catch (e: any) {
      setErro(e?.message ?? "Falha ao carregar categorias");
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refetch(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [qs]);

  return { categories: data, loading, erro, refetch };
}