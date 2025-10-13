// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { adminAuth } from "@/lib/firebaseAdmin";
import { getStorage } from "firebase-admin/storage";

// ——— utils ———
function redact(tok?: string | null) {
  if (!tok) return "NONE";
  return tok.slice(0, 10) + "...";
}

async function getCallerUid(req: NextRequest): Promise<string> {
  const raw = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!raw) {
    throw new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401 });
  }
  if (!raw.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Malformed Authorization header" }), { status: 401 });
  }
  const token = raw.slice("Bearer ".length).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch (err) {
    console.error("[/api/upload] verifyIdToken FAIL tok=", redact(token), err);
    throw new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }
}

// POST /api/upload
// body: { filename: string, contentType: string, productId?: string }
export async function POST(req: NextRequest) {
  try {
    const uid = await getCallerUid(req);
    const body = await req.json().catch(() => ({}));

    const filename = (body?.filename ?? "").toString().trim();
    const contentType = (body?.contentType ?? "").toString().trim();
    const productId = (body?.productId ?? "").toString().trim();

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: "filename e contentType são obrigatórios" },
        { status: 400 }
      );
    }

    // Caminho no bucket por usuário (e opcionalmente por produto)
    const now = Date.now();
    const base = productId ? `users/${uid}/products/${productId}` : `users/${uid}/uploads`;
    const objectPath = `${base}/${now}-${filename}`;

    const storage = getStorage();
    const bucket = storage.bucket(); // bucket padrão do seu projeto
    const file = bucket.file(objectPath);

    // Para URLs públicas em Firebase Storage, usamos o token em metadata.
    // Quando fazer o PUT, o cliente DEVE enviar os mesmos headers assinados abaixo.
    const downloadToken =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${now}-${Math.random().toString(36).slice(2)}`;

    // Assina uma URL v4 para upload (PUT) exigindo estes headers
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutos
    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires,
      contentType, // o caller deve enviar exatamente este Content-Type no PUT
      extensionHeaders: {
        "x-goog-meta-firebaseStorageDownloadTokens": downloadToken,
      },
    });

    // URL de download permanente (usa o token acima)
    const encodedPath = encodeURIComponent(objectPath);
    const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    return NextResponse.json({
      ok: true,
      objectPath,
      uploadUrl,
      // estes headers DEVEM ser enviados pelo cliente no fetch PUT para o upload funcionar
      requiredHeaders: {
        "Content-Type": contentType,
        "x-goog-meta-firebaseStorageDownloadTokens": downloadToken,
      },
      // após o upload concluir com sucesso, esta URL servirá a imagem
      downloadURL,
      expiresAt: expires,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error("POST /api/upload error:", e);
    return NextResponse.json({ error: e?.message ?? "Erro" }, { status: 500 });
  }
}