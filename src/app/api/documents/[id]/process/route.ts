import { NextResponse } from "next/server";

import { UploadError, processDocument } from "@/server/documents";

export const runtime = "nodejs";

// pdf.js is not fast on a large report; the default 15s would cut it off.
export const maxDuration = 60;

/**
 * POST /api/documents/:id/process
 *
 * Downloads the stored PDF, extracts its text and parses it as a PERSONAL
 * COMPETENCES ANALYSIS report, then returns the result.
 *
 * Nothing is persisted except the document's `processing_status`: this endpoint
 * exists to prove the Storage → text → parser path works. Creating profiles and
 * writing capabilities/attitudes comes later.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/documents/[id]/process">) {
  const { id } = await ctx.params;

  try {
    const result = await processDocument(id);

    console.log(
      `[process] ${result.fileName}: ${result.totalPages} page(s), ` +
        `${result.characters} chars, name=${result.report.full_name ?? "?"}, ` +
        `warnings=${result.report.warnings.length}`,
    );

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    if (cause instanceof UploadError) {
      return NextResponse.json({ error: cause.message }, { status: cause.status });
    }
    console.error("process failed", cause);
    return NextResponse.json({ error: "No se pudo procesar el documento." }, { status: 500 });
  }
}
