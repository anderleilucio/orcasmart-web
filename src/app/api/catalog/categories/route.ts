// src/app/api/catalog/categories/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import * as admin from "firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function getUid(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("NO_TOKEN");
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
}

function slugifyLabel(label: string) {
  return (label || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ✅ corrigida: agora não corta errado e valida depois
function normalizePrefix(prefix?: string, fallback?: string) {
  const p = (prefix || fallback || "")
    .toString()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 5); // até 5 letras
  return p; // validação de tamanho feita depois
}

/**
 * GET /api/catalog/categories
 */
export async function GET(req: NextRequest) {
  try {
    const uid = await getUid(req);
    const snap = await adminDb
      .collection("catalog_categories")
      .where("ownerId", "==", uid)
      .orderBy("label", "asc")
      .get();

    const items = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        label: data.label ?? "",
        slug: data.slug ?? "",
        prefix: data.prefix ?? "",
        createdAt: data.createdAt?.toMillis?.() ?? null,
      };
    });
    return json({ items });
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") return json({ error: "Usuário não autenticado" }, 401);
    console.error("[categories GET] erro:", e);
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
}

/**
 * POST /api/catalog/categories
 * Body: { label: string, slug?: string, prefix?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const uid = await getUid(req);
    const body = (await req.json().catch(() => ({}))) as {
      label?: string;
      slug?: string;
      prefix?: string;
    };

    const label = (body.label || "").toString().trim();
    if (!label) return json({ error: "Label é obrigatório" }, 400);

    const slug = (body.slug && body.slug.trim()) || slugifyLabel(label);
    const prefix = normalizePrefix(body.prefix, slug.slice(0, 3));

    if (!prefix || prefix.length < 2)
      return json({ error: "Prefixo inválido (mínimo 2 letras)" }, 400);

    // verifica duplicidades
    const dupSlug = await adminDb
      .collection("catalog_categories")
      .where("ownerId", "==", uid)
      .where("slug", "==", slug)
      .limit(1)
      .get();

    if (!dupSlug.empty) {
      const d = dupSlug.docs[0];
      const data = d.data() as any;

      const samePrefix = await adminDb
        .collection("catalog_categories")
        .where("ownerId", "==", uid)
        .where("prefix", "==", prefix)
        .get();

      if (!samePrefix.empty) {
        const clash = samePrefix.docs.find((doc) => doc.id !== d.id);
        if (clash) return json({ error: "Prefixo já existe em outra categoria." }, 409);
      }

      await adminDb.collection("catalog_categories").doc(d.id).set(
        {
          label,
          prefix,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(
        {
          id: d.id,
          label,
          slug: data.slug,
          prefix,
          createdAt: data.createdAt?.toMillis?.() ?? null,
          reused: true,
        },
        200
      );
    }

    // prefixo duplicado
    const dupPrefix = await adminDb
      .collection("catalog_categories")
      .where("ownerId", "==", uid)
      .where("prefix", "==", prefix)
      .limit(1)
      .get();

    if (!dupPrefix.empty)
      return json({ error: "Prefixo já existe em outra categoria." }, 409);

    // cria
    const ref = await adminDb.collection("catalog_categories").add({
      ownerId: uid,
      label,
      slug,
      prefix,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const data = (await ref.get()).data() as any;
    return json(
      {
        id: ref.id,
        label: data.label,
        slug: data.slug,
        prefix: data.prefix,
        createdAt: data.createdAt?.toMillis?.() ?? null,
      },
      201
    );
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") return json({ error: "Usuário não autenticado" }, 401);
    console.error("[categories POST] erro:", e);
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
}

/**
 * PUT /api/catalog/categories?id=<id>
 * Body: { label?: string, prefix?: string }
 */
export async function PUT(req: NextRequest) {
  try {
    const uid = await getUid(req);
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") || "").trim();
    if (!id) return json({ error: "ID é obrigatório" }, 400);

    const body = (await req.json().catch(() => ({}))) as {
      label?: string;
      prefix?: string;
    };

    const ref = adminDb.collection("catalog_categories").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return json({ error: "Categoria não encontrada" }, 404);
    if ((snap.data() as any)?.ownerId !== uid) return json({ error: "Proibido" }, 403);

    const updates: any = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (body.label !== undefined) {
      const label = String(body.label || "").trim();
      if (!label) return json({ error: "Label inválido" }, 400);
      updates.label = label;
    }

    if (body.prefix !== undefined) {
      const prefix = normalizePrefix(body.prefix);
      if (!prefix || prefix.length < 2)
        return json({ error: "Prefixo inválido (mínimo 2 letras)" }, 400);

      const clash = await adminDb
        .collection("catalog_categories")
        .where("ownerId", "==", uid)
        .where("prefix", "==", prefix)
        .get();

      if (!clash.empty) {
        const other = clash.docs.find((d) => d.id !== id);
        if (other) return json({ error: "Prefixo já existe em outra categoria." }, 409);
      }
      updates.prefix = prefix;
    }

    await ref.set(updates, { merge: true });

    const data = (await ref.get()).data() as any;
    return json({
      id,
      label: data.label,
      slug: data.slug,
      prefix: data.prefix,
      createdAt: data.createdAt?.toMillis?.() ?? null,
    });
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") return json({ error: "Usuário não autenticado" }, 401);
    console.error("[categories PUT] erro:", e);
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
}

/**
 * DELETE /api/catalog/categories?id=<docId>
 */
export async function DELETE(req: NextRequest) {
  try {
    const uid = await getUid(req);
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") || "").trim();
    if (!id) return json({ error: "ID é obrigatório" }, 400);

    const ref = adminDb.collection("catalog_categories").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return json({ error: "Categoria não encontrada" }, 404);
    if ((snap.data() as any)?.ownerId !== uid) return json({ error: "Proibido" }, 403);

    await ref.delete();
    return json({ ok: true });
  } catch (e: any) {
    if (e?.message === "NO_TOKEN") return json({ error: "Usuário não autenticado" }, 401);
    console.error("[categories DELETE] erro:", e);
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
}