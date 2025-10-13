// src/app/api/auth/register/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "no-store" } as const;

/* ==================== Helpers ==================== */

const UFS = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]);

const digits = (s: string) => (s || "").replace(/\D+/g, "");

// Validação básica de CNPJ (módulo 11)
function isValidCNPJ(v: string): boolean {
  const c = digits(v);
  if (c.length !== 14) return false;
  if (/^(\d)\1+$/.test(c)) return false;

  let s = 0, p = 5;
  for (let i = 0; i < 12; i++) {
    s += parseInt(c[i]) * p;
    p = p === 2 ? 9 : p - 1;
  }
  let r = s % 11;
  const d1 = r < 2 ? 0 : 11 - r;

  s = 0; p = 6;
  for (let i = 0; i < 13; i++) {
    s += parseInt(c[i]) * p;
    p = p === 2 ? 9 : p - 1;
  }
  r = s % 11;
  const d2 = r < 2 ? 0 : 11 - r;

  return d1 === parseInt(c[12]) && d2 === parseInt(c[13]);
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status, headers: noStore });
}

/* ==================== POST /api/auth/register ==================== */
/**
 * Espera Authorization: Bearer <ID_TOKEN>
 * Body JSON:
 * {
 *   companyName: string,
 *   cnpj: string (apenas números ou formatado),
 *   whatsapp?: string,
 *   address?: string,
 *   city: string,
 *   uf: "SP" | ...,
 *   geo?: { lat: number, lng: number } | null,
 *   role?: "seller" (ignorado se vier diferente)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return bad("Token ausente. Faça login novamente.", 401);
    }

    const idToken = authHeader.slice("Bearer ".length).trim();
    const adminAuth = getAuth();
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch {
      return bad("Token inválido ou expirado.", 401);
    }

    const uid = decoded.uid;
    if (!uid) return bad("UID inválido no token.", 401);

    const body = await req.json().catch(() => ({}));

    const companyName = String(body?.companyName || "").trim();
    const cnpjRaw = String(body?.cnpj || "");
    const cnpj = digits(cnpjRaw);

    const whatsapp = String(body?.whatsapp || "").trim();
    const address = String(body?.address || "").trim();
    const city = String(body?.city || "").trim();
    const uf = String(body?.uf || "").trim().toUpperCase();
    const geo = body?.geo && typeof body.geo === "object" ? body.geo : null;

    if (!companyName) return bad("Campo 'companyName' é obrigatório.");
    if (!cnpj) return bad("Campo 'cnpj' é obrigatório.");
    if (!isValidCNPJ(cnpj)) return bad("CNPJ inválido.");

    if (!city) return bad("Campo 'city' é obrigatório.");
    if (!UFS.has(uf)) return bad("UF inválida.");

    // Verifica unicidade de CNPJ para outro vendedor
    const dupQ = await adminDb
      .collection("sellers")
      .where("cnpj", "==", cnpj)
      .limit(1)
      .get();

    if (!dupQ.empty) {
      const doc = dupQ.docs[0];
      if (doc.id !== uid) {
        return bad("Este CNPJ já está cadastrado em outra conta.", 409);
      }
    }

    // Monta payload para Firestore
    const now = new Date();
    const sellerRef = adminDb.collection("sellers").doc(uid);

    const data: any = {
      companyName,
      cnpj,
      whatsapp,
      address,
      city,
      uf,
      geo: geo && typeof geo.lat === "number" && typeof geo.lng === "number"
        ? { lat: geo.lat, lng: geo.lng }
        : null,
      role: "seller",
      updatedAt: now,
    };

    // Cria ou atualiza (merge)
    await sellerRef.set(
      {
        ...data,
        createdAt: now, // será ignorado se já existir (merge não sobrescreve necessariamente, mas vale manter)
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, uid }, { status: 200, headers: noStore });
  } catch (err: any) {
    console.error("[POST /api/auth/register]", err);
    return NextResponse.json(
      { error: err?.message ?? "Erro interno" },
      { status: 500, headers: noStore }
    );
  }
}

/* ==================== OPTIONS (CORS) ==================== */
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