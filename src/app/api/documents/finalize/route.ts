import { NextResponse } from "next/server";
import { z } from "zod";

import { UploadError, finalizeUpload } from "@/server/documents";

export const runtime = "nodejs";

const schema = z.object({
  documentId: z.string().uuid(),
  success: z.boolean(),
  errorMessage: z.string().max(500).optional(),
});

/**
 * POST /api/documents/finalize
 *
 * The browser reports one file's outcome: the row moves to PENDING (stored,
 * awaiting processing) or FAILED with the reason recorded.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  try {
    const document = await finalizeUpload(parsed.data);
    return NextResponse.json(document);
  } catch (cause) {
    if (cause instanceof UploadError) {
      return NextResponse.json({ error: cause.message }, { status: cause.status });
    }
    console.error("finalize failed", cause);
    return NextResponse.json({ error: "Could not finish the upload." }, { status: 500 });
  }
}
