import { NextResponse } from "next/server";

import { UploadError, createDocumentViewUrl } from "@/server/documents";

export const runtime = "nodejs";

/**
 * GET /api/documents/:id/url
 *
 * Mints a 60-second signed URL for the original PDF. The bucket is private, so
 * this route is the only way to see a document — which makes it the one place
 * to enforce access rules once auth exists.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[id]/url">) {
  const { id } = await ctx.params;

  try {
    const url = await createDocumentViewUrl(id);
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    if (cause instanceof UploadError) {
      return NextResponse.json({ error: cause.message }, { status: cause.status });
    }
    console.error("signed url failed", cause);
    return NextResponse.json({ error: "No se pudo generar el enlace." }, { status: 500 });
  }
}
