// src/app/api/seller-products/upsert/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "no-store" } as const;

function toNumberSafe(v: unknown, def = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

function cleanStringList(list: unknown, limit = 12): string[] {
  const arr = Array.isArray(list) ? list : [];
  const out = Array.from(
    new Set(
      arr
        .map((x) => String(x || "").trim())
        .filter((s) => s.length > 0)
    )
  );
  return out.slice(0, limit);
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json().catch(() => ({}));

    const sellerId = String(data?.sellerId ?? "").trim();
    let sku = String(data?.sku ?? "").trim().toUpperCase();

    if (!sellerId || !sku) {
      return NextResponse.json(
        { error: "Campos obrigatórios: sellerId e sku" },
        { status: 400, headers: noStore }
      );
    }

    // impede espaços no SKU
    sku = sku.replace(/\s+/g, "");

    const id = `${sellerId}_${sku}`;
    const ref = adminDb.collection("seller_products").doc(id);
    const snap = await ref.get();

    // normalizações numéricas
    const priceRaw = toNumberSafe(data?.price, 0);
    const stockRaw = toNumberSafe(data?.stock, 0);
    const price = Math.max(0, Number(priceRaw.toFixed(2)));
    const stock = Math.max(0, Math.floor(stockRaw));

    // imagens por URL
    const imageUrls = cleanStringList(data?.imageUrls) ?? cleanStringList(data?.images);

    // NOVO: caminhos no Storage (para possíveis deleções futuras)
    const imageStoragePathsIncoming = cleanStringList(data?.imageStoragePaths, 20);

    // categoria
    const categoryCode =
      typeof data?.categoryCode === "string"
        ? data.categoryCode.trim().toUpperCase() || null
        : null;

    const base: Record<string, any> = {
      sellerId,
      sku,
      price,
      stock,
      active: data?.active !== false,
      imageUrls,
      categoryCode,
      updatedAt: new Date(),
    };

    // Política: NÃO sobrescrever quando não vier nada.
    // Se quiser permitir limpar enviando [], troque pela linha comentada abaixo.
    if (Array.isArray(data?.imageStoragePaths) && imageStoragePathsIncoming.length > 0) {
      base.imageStoragePaths = imageStoragePathsIncoming;
    }
    // Alternativa (permite limpar enviando []):
    // if (Object.prototype.hasOwnProperty.call(data, "imageStoragePaths")) {
    //   base.imageStoragePaths = imageStoragePathsIncoming; // pode ser []
    // }

    if (snap.exists) {
      // Atualização
      if (typeof data?.name === "string") {
        const nm = data.name.trim();
        if (nm) base.name = nm;
      }

      await ref.set(base, { merge: true });

      return NextResponse.json(
        { ok: true, id, mode: "updated" },
        { status: 200, headers: noStore }
      );
    } else {
      // Criação exige name
      const name = String(data?.name ?? "").trim();
      if (!name) {
        return NextResponse.json(
          { error: "Campo obrigatório 'name' ao criar produto." },
          { status: 400, headers: noStore }
        );
      }

      await ref.set(
        {
          ...base,
          name,
          createdAt: new Date(),
        },
        { merge: true }
      );

      return NextResponse.json(
        { ok: true, id, mode: "created" },
        { status: 201, headers: noStore }
      );
    }
  } catch (err: any) {
    console.error("[POST /seller-products/upsert]", err);
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...noStore,
    },
  });
}