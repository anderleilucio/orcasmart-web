// src/app/api/products/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Helpers
function csvEscape(v: string): string {
  // Sempre entre aspas e duplica aspas internas
  return `"${(v ?? "").replace(/"/g, '""')}"`;
}
function toStr(v: unknown): string {
  if (v == null) return "";
  return String(v);
}
function toPreco(v: unknown): string {
  const n = Number(v ?? 0);
  // Export com ponto decimal (compatível com import)
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}
function toInt(v: unknown): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)).toString() : "0";
}
function toBool(v: unknown): string {
  return v === false ? "false" : "true";
}

async function getUid(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("NO_TOKEN");
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
}

// GET /api/products/export
export async function GET(req: NextRequest) {
  try {
    const uid = await getUid(req);

    // Paginação manual para exportar "todos" (em lotes), ordenado por createdAt desc quando possível
    const PAGE = 500;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    const all: any[] = [];

    // Tenta com orderBy(createdAt). Se não der (sem índice / campo ausente), cai para sem ordenação.
    let useFallback = false;
    for (;;) {
      let q = adminDb
        .collection("products")
        .where("ownerId", "==", uid)
        .orderBy("createdAt", "desc")
        .limit(PAGE);

      try {
        if (lastDoc) q = q.startAfter(lastDoc);
        const snap = await q.get();
        if (snap.empty) break;
        all.push(...snap.docs);
        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.size < PAGE) break; // acabou
      } catch {
        useFallback = true;
        break;
      }
    }

    if (useFallback) {
      lastDoc = null;
      for (;;) {
        let q = adminDb
          .collection("products")
          .where("ownerId", "==", uid)
          .limit(PAGE);
        if (lastDoc) q = q.startAfter(lastDoc);
        const snap = await q.get();
        if (snap.empty) break;
        all.push(...snap.docs);
        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.size < PAGE) break;
      }
    }

    // Monta CSV com cabeçalho compatível com o import
    const header = "sku,nome,preco,estoque,ativo,unidade,imagens";
    const lines = [header];

    for (const d of all) {
      const data = d.data() as any;
      const sku = csvEscape(toStr(data.sku));
      const nome = csvEscape(toStr(data.name));
      const preco = csvEscape(toPreco(data.price));
      const estoque = csvEscape(toInt(data.stock));
      const ativo = csvEscape(toBool(data.active));
      const unidade = csvEscape(toStr(data.unit || "un"));

      // imagens: prioriza array `images`; senão usa `image`
      let imagensVal = "";
      if (Array.isArray(data.images) && data.images.length) {
        // Caso haja múltiplas, junte com ';' (import já entende)
        imagensVal = data.images.map((u: any) => toStr(u).trim()).filter(Boolean).join(";");
      } else if (data.image) {
        imagensVal = toStr(data.image).trim();
      }
      const imagens = csvEscape(imagensVal);

      lines.push([sku, nome, preco, estoque, ativo, unidade, imagens].join(","));
    }

    const csv = "\uFEFF" + lines.join("\n"); // BOM p/ Excel
    const res = new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="produtos-export.csv"`,
        "Cache-Control": "no-store",
      },
    });
    return res;
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") {
      return new NextResponse(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("[products EXPORT] erro:", e);
    return new NextResponse(JSON.stringify({ error: e?.message ?? "Erro interno" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}