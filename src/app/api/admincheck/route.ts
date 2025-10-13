// src/app/api/admincheck/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CheckResponse =
  | {
      ok: true;
      uid: string;
      email?: string;
      isAdmin: boolean;
      claims: Record<string, unknown>;
    }
  | { ok: false; error: string };

function getErrMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "Erro desconhecido";
  }
}

function extractBearer(req: NextRequest): string {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ")) throw new Error("Sem token Bearer.");
  const token = h.slice(7).trim();
  if (!token) throw new Error("Token vazio.");
  return token;
}

export async function GET(req: NextRequest) {
  try {
    const token = extractBearer(req);
    const decoded = await adminAuth.verifyIdToken(token);

    // Custom claims podem incluir `admin: true`, `role: "admin"`, etc.
    const claims: Record<string, unknown> = decoded as unknown as Record<string, unknown>;
    const isAdmin =
      claims.admin === true ||
      claims.role === "admin" ||
      claims.roles === "admin" ||
      (Array.isArray(claims.roles) && claims.roles.includes("admin"));

    const payload: CheckResponse = {
      ok: true,
      uid: decoded.uid,
      email: decoded.email ?? undefined,
      isAdmin,
      claims,
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const payload: CheckResponse = { ok: false, error: getErrMsg(err) };
    return NextResponse.json(payload, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store",
    },
  });
}