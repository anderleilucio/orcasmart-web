// src/app/api/upload-url/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminStorage } from "@/lib/firebaseAdmin";

type Body = {
  filename: string;
  contentType: string;
};

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    const idToken = auth.slice("Bearer ".length).trim();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const body: Body = await req.json().catch(() => ({} as Body));
    const filename = (body.filename || "arquivo").replace(/[^\w.\-]+/g, "-");
    const contentType = body.contentType || "application/octet-stream";

    // Caminho no bucket: products/<uid>/<timestamp>-<filename>
    const path = `products/${uid}/${Date.now()}-${filename}`;

    // ⚙️ Usa o domínio .firebasestorage.app (compatível com o client)
    const bucketName =
      process.env.GCS_BUCKET || "orcasmart-57561.firebasestorage.app";
    const bucket = adminStorage.bucket(bucketName);
    const file = bucket.file(path);

    // Gera URL de upload (PUT) válida por 10 minutos
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 10 * 60 * 1000,
      contentType,
    });

    // URL pública de download
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
      path
    )}?alt=media`;

    return NextResponse.json({ url, path, publicUrl, contentType });
  } catch (e: any) {
    console.error("[upload-url] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Erro ao gerar URL" },
      { status: 500 }
    );
  }
}