import { NextResponse } from "next/server";
import { z } from "zod";

import { UPLOAD } from "@/lib/env";
import { UploadError, createUploadTicket } from "@/server/documents";

export const runtime = "nodejs";

const schema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(UPLOAD.maxBytes),
  mimeType: z.string().min(1),
  profileId: z.string().uuid().nullable().optional(),
});

/**
 * POST /api/documents/upload-url
 *
 * Reserves a `documents` row and returns a one-shot Storage upload token. The
 * browser then pushes the bytes straight to Storage and calls
 * `/api/documents/finalize` with the outcome.
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
    const ticket = await createUploadTicket({
      fileName: parsed.data.fileName,
      fileSize: parsed.data.fileSize,
      mimeType: parsed.data.mimeType,
      profileId: parsed.data.profileId ?? null,
    });
    return NextResponse.json({ ...ticket, bucket: UPLOAD.bucket });
  } catch (cause) {
    if (cause instanceof UploadError) {
      return NextResponse.json({ error: cause.message }, { status: cause.status });
    }
    console.error("upload-url failed", cause);
    return NextResponse.json({ error: "Could not start the upload." }, { status: 500 });
  }
}
