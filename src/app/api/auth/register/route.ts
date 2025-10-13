// src/app/api/auth/register/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ========================= Types & Utils ========================= */

type RegisterBody = {
  email?: string;
  password?: string;
  displayName?: string;
  phoneNumber?: string;
  // opcional: criar como admin
  makeAdmin?: boolean;
};

type PublicUser = {
  uid: string;
  email?: string;
  displayName?: string;
  phoneNumber?: string;
  photoURL?: string;
  isAdmin?: boolean;
  createdAt: string;
  updatedAt: string;
};

function getErrMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "Erro desconhecido";
  }
}

function sanitizeEmail(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function sanitizeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function validateBody(raw: unknown): Required<Pick<RegisterBody, "email" | "password">> & Omit<RegisterBody, "email" | "password"> {
  if (!raw || typeof raw !== "object") throw new Error("Body inválido.");
  const obj = raw as Record<string, unknown>;

  const email = sanitizeEmail(obj.email);
  const password = sanitizeString(obj.password);
  const displayName = sanitizeString(obj.displayName) || undefined;
  const phoneNumber = sanitizeString(obj.phoneNumber) || undefined;
  const makeAdmin =
    typeof obj.makeAdmin === "boolean"
      ? obj.makeAdmin
      : String(obj.makeAdmin ?? "false").toLowerCase() === "true";

  if (!email) throw new Error('Campo "email" é obrigatório.');
  if (!password || password.length < 6) throw new Error('Campo "password" é obrigatório (mínimo 6 caracteres).');

  return { email, password, displayName, phoneNumber, makeAdmin };
}

/* ========================= Handlers ========================= */

export async function POST(req: NextRequest) {
  try {
    const raw = (await req.json().catch(() => ({}))) as unknown;
    const body = validateBody(raw);

    // Cria usuário no Firebase Auth (Admin)
    const userRecord = await adminAuth.createUser({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      phoneNumber: body.phoneNumber,
      emailVerified: false,
      disabled: false,
    });

    // Define custom claims se solicitado
    if (body.makeAdmin) {
      await adminAuth.setCustomUserClaims(userRecord.uid, { admin: true, role: "admin" });
    }

    // Persiste no Firestore (coleção users)
    const now = new Date().toISOString();
    const doc: PublicUser = {
      uid: userRecord.uid,
      email: userRecord.email ?? undefined,
      displayName: userRecord.displayName ?? undefined,
      phoneNumber: userRecord.phoneNumber ?? undefined,
      photoURL: userRecord.photoURL ?? undefined,
      isAdmin: body.makeAdmin || false,
      createdAt: now,
      updatedAt: now,
    };

    await adminDb.collection("users").doc(userRecord.uid).set(doc, { merge: true });

    return NextResponse.json(
      { ok: true, user: doc },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrMsg(err) },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store",
    },
  });
}