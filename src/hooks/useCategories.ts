// src/hooks/useCategories.ts
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

export type Category = {
  id: string;        // geralmente = code
  code: string;
  name: string;
  synonyms?: string[];
  active?: boolean;
  counter?: number;
};

export function useCategories(opts?: { includeInactive?: boolean }) {
  const [data, setData] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  // monta query string de forma estável
  const qs = useMemo(() => {
    const q = new URLSearchParams();
    if (opts?.includeInactive) q.set("include_inactive", "1");
    return q.toString() ? `?${q.toString()}` : "";
  }, [opts?.includeInactive]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/categories/list${qs}`, { cache: "no-store" });
      const json: unknown = await res.json();

      if (!res.ok) {
        const errMsg =
          typeof json === "object" &&
          json !== null &&
          "error" in (json as Record<string, unknown>)
            ? String((json as Record<string, unknown>).error)
            : `HTTP ${res.status}`;
        throw new Error(errMsg);
      }

      const items = Array.isArray((json as Record<string, unknown>)?.items)
        ? ((json as Record<string, unknown>).items as Category[])
        : [];

      setData(items);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao carregar categorias";
      setErro(msg);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { categories: data, loading, erro, refetch };
}

export default useCategories;