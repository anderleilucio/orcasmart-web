// src/app/api/catalog/export/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "no-store" } as const;

type Row = {
  id: string;
  sellerId: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
  active: boolean;
  imageUrls: string[];
  categoryCode: string | null;
  updatedAt: Date | null;
};

function csvEscape(v: unknown): string {
  // transforma undefined/null em vazio
  let s =
    v == null
      ? ""
      : Array.isArray(v)
      ? v.join(" ")
      : v instanceof Date
      ? v.toISOString()
      : String(v);

  // normaliza quebras de linha
  s = s.replace(/\r?\n/g, " ").trim();

  // se tiver separador/aspas/quebra, envolve em aspas e escapa aspas
  if (/[",;\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildCsv(rows: Row[]): string {
  const header = [
    "id",
    "sellerId",
    "sku",
    "name",
    "price",
    "stock",
    "active",
    "imageUrls",
    "categoryCode",
    "updatedAt",
  ].join(",");

  const lines = rows.map((r) =>
    [
      csvEscape(r.id),
      csvEscape(r.sellerId),
      csvEscape(r.sku),
      csvEscape(r.name),
      csvEscape(r.price.toFixed(2)),
      csvEscape(r.stock),
      csvEscape(r.active ? "true" : "false"),
      csvEscape(r.imageUrls.join(" ")),
      csvEscape(r.categoryCode ?? ""),
      csvEscape(r.updatedAt ? r.updatedAt.toISOString() : ""),
    ].join(",")
  );

  return [header, ...lines].join("\n");
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sellerId = searchParams.get("sellerId")?.trim();
    const activeParam = searchParams.get("active"); // "true" | "false" | "all" | null
    const download = searchParams.get("download") === "1";

    if (!sellerId) {
      return NextResponse.json(
        { error: "Parâmetro 'sellerId' é obrigatório." },
        { status: 400, headers: noStore }
      );
    }

    // monta query
    let q = adminDb.collection("seller_products").where("sellerId", "==", sellerId);

    if (activeParam === "true") {
      q = q.where("active", "==", true);
    } else if (activeParam === "false") {
      q = q.where("active", "==", false);
    }
    // activeParam "all" (ou ausente) -> não filtra

    const snap = await q.get();

    const rows: Row[] = snap.docs.map((doc) => {
      const d = doc.data() as any;
      // Firestore Timestamp -> Date
      const updated =
        d?.updatedAt?.toDate?.() ??
        (d?.updatedAt?._seconds ? new Date(d.updatedAt._seconds * 1000) : null);

      return {
        id: doc.id,
        sellerId: d?.sellerId ?? "",
        sku: d?.sku ?? "",
        name: d?.name ?? "",
        price: typeof d?.price === "number" ? d.price : Number(d?.price ?? 0),
        stock: typeof d?.stock === "number" ? d.stock : Number(d?.stock ?? 0),
        active: d?.active !== false,
        imageUrls: Array.isArray(d?.imageUrls) ? d.imageUrls : [],
        categoryCode: typeof d?.categoryCode === "string" ? d.categoryCode : null,
        updatedAt: updated,
      };
    });

    const csv = buildCsv(rows);

    // Se ?download=1, retorna o arquivo diretamente (Content-Disposition)
    if (download) {
      return new NextResponse(csv, {
        status: 200,
        headers: {
          ...noStore,
          "Content-Type": "text/csv; charset=utf-8",
          // BOM opcional? Aqui fica sem; se quiser Excel-friendly, prefixar "\uFEFF" no csv.
          "Content-Disposition": `attachment; filename="catalog_${sellerId}.csv"`,
        },
      });
    }

    // Padrão da sua UI: retornar { url } e abrir em nova aba
    // Usamos data URL base64 (não precisa Storage)
    const base64 = Buffer.from(csv, "utf8").toString("base64");
    const url = `data:text/csv;base64,${base64}`;

    return NextResponse.json({ url }, { status: 200, headers: noStore });
  } catch (err: any) {
    console.error("[GET /api/catalog/export]", err);
    return NextResponse.json(
      { error: err?.message ?? "Erro interno" },
      { status: 500, headers: noStore }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...noStore,
    },
  });
}