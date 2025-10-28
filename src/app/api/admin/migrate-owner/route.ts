import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const secret = searchParams.get("secret");

  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!from || !to) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  const snap = await adminDb.collection("products").where("ownerId", "==", from).get();
  const batch = adminDb.batch();

  snap.docs.forEach((doc) => {
    batch.update(doc.ref, { ownerId: to });
  });

  if (snap.size > 0) {
    await batch.commit();
  }

  return NextResponse.json({
    ok: true,
    migrated: snap.size,
    from,
    to,
  });
}