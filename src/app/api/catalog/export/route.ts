import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Erro desconhecido";
}

function asRecord(u: unknown): Record<string, unknown> {
  return u && typeof u === "object" ? (u as Record<string, unknown>) : {};
}

function toCategory(id: string, raw: Record<string, unknown>) {
  return {
    code: String(raw.code ?? id),
    name: String(raw.name ?? ""),
    slug: typeof raw.slug === "string" ? raw.slug : undefined,
    parentCode: (raw.parentCode as string | null) ?? null,
    position: typeof raw.position === "number" ? raw.position : undefined,
    active: typeof raw.active === "boolean" ? raw.active : true,
  };
}

function toRule(id: string, raw: Record<string, unknown>) {
  return {
    id,
    pattern: String(raw.pattern ?? ""),
    action: String(raw.action ?? ""),
    enabled: Boolean(raw.enabled ?? true),
    priority: typeof raw.priority === "number" ? raw.priority : undefined,
    ownerId: (raw.ownerId as string | null) ?? null,
  };
}

/** GET /api/catalog/export?format=json|csv&section=all|categories|rules */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const queryFormat = (url.searchParams.get("format") || "").toLowerCase();
    const acceptHeader = req.headers.get("accept") || "";
    const format =
      queryFormat || acceptHeader.includes("text/csv") ? "csv" : "json";

    const section = (url.searchParams.get("section") || "all").toLowerCase();
    const wantCats = section === "all" || section === "categories";
    const wantRules = section === "all" || section === "rules";

    let categories: any[] = [];
    let rules: any[] = [];

    if (wantCats) {
      const cs = await adminDb.collection("catalog_categories").get();
      categories = cs.docs.map((d) => toCategory(d.id, asRecord(d.data())));
    }
    if (wantRules) {
      const rs = await adminDb.collection("catalog_rules").get();
      rules = rs.docs.map((d) => toRule(d.id, asRecord(d.data())));
    }

    if (format === "csv") {
      const parts: string[] = [];
      if (wantCats) {
        parts.push("# catalog_categories");
        parts.push("code,name,slug,parentCode,position,active");
        for (const c of categories) {
          const line = [
            JSON.stringify(c.code ?? ""),
            JSON.stringify(c.name ?? ""),
            JSON.stringify(c.slug ?? ""),
            JSON.stringify(c.parentCode ?? ""),
            JSON.stringify(
              typeof c.position === "number" ? String(c.position) : ""
            ),
            JSON.stringify(String(c.active ?? true)),
          ].join(",");
          parts.push(line);
        }
        parts.push("");
      }
      if (wantRules) {
        parts.push("# catalog_rules");
        parts.push("id,pattern,action,enabled,priority,ownerId");
        for (const r of rules) {
          const line = [
            JSON.stringify(r.id ?? ""),
            JSON.stringify(r.pattern ?? ""),
            JSON.stringify(r.action ?? ""),
            JSON.stringify(String(r.enabled ?? true)),
            JSON.stringify(
              typeof r.priority === "number" ? String(r.priority) : ""
            ),
            JSON.stringify(r.ownerId ?? ""),
          ].join(",");
          parts.push(line);
        }
      }
      const csv = parts.join("\n");
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="catalog_export.csv"',
          "Cache-Control": "no-store",
        },
      });
    }

    // default JSON
    const payload: Record<string, unknown> = {};
    if (wantCats) payload.categories = categories;
    if (wantRules) payload.rules = rules;

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: errMsg(e) },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
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