// pages API (Next.js) — URL: /api/admin/migrate-owner
import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";

async function runMigrate(from: string, to: string) {
  // busca por todos os aliases (legado)
  const col = adminDb.collection("products");
  const [a, b, c] = await Promise.all([
    col.where("ownerId", "==", from).get(),
    col.where("sellerId", "==", from).get(),
    col.where("vendorUid", "==", from).get(),
  ]);

  const seen = new Set<string>();
  const docs = [...a.docs, ...b.docs, ...c.docs].filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  let migrated = 0;
  for (let i = 0; i < docs.length; i += 400) {
    const slice = docs.slice(i, i + 400);
    const batch = adminDb.batch();
    slice.forEach((d) =>
      batch.set(
        d.ref,
        { ownerId: to, sellerId: to, vendorUid: to },
        { merge: true }
      )
    );
    await batch.commit();
    migrated += slice.length;
  }
  return migrated;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Aceita GET e POST (evita 405)
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  // Pega params tanto de query (GET) quanto do body (POST)
  const q = req.method === "GET" ? req.query : (req.body || {});
  const from = String((q as any).from || "").trim();
  const to   = String((q as any).to   || "").trim();
  const secret = String((q as any).secret || "");

  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  if (!from || !to || from === to) {
    return res.status(400).json({ ok: false, error: "invalid params" });
  }

  try {
    const migrated = await runMigrate(from, to);
    return res.status(200).json({ ok: true, migrated, from, to });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "internal error" });
  }
}