import { NextResponse, after } from "next/server";
import { z } from "zod";

import { UploadError, finalizeUpload, processDocument } from "@/server/documents";

export const runtime = "nodejs";

// Processing runs after the response via after(), but still inside this
// invocation, so the function must be allowed to live long enough to finish it.
export const maxDuration = 60;

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
    return NextResponse.json({ error: "El cuerpo de la petición no es JSON válido." }, { status: 400 });
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

    // Only a stored file is worth processing; a failed upload has no bytes.
    if (parsed.data.success) {
      // after() runs once the response has been sent, so the browser is not held
      // open for the length of a PDF parse, while Vercel still keeps the
      // function alive until the work finishes. processDocument records its own
      // failure on the document row, so a rejection here is already persisted —
      // logging is all that is left to do.
      after(async () => {
        try {
          const result = await processDocument(parsed.data.documentId);
          console.log(
            `[process] ${result.fileName}: profile=${result.profileId} ` +
              `(${result.profileCreated ? "created" : "matched"}), ` +
              `${result.capabilities.length} capabilities, ` +
              `${result.attitudes.length} attitudes, ` +
              `${result.report.warnings.length} warnings`,
          );
        } catch (processError) {
          console.error(`[process] ${parsed.data.documentId} failed`, processError);
        }
      });
    }

    return NextResponse.json(document);
  } catch (cause) {
    if (cause instanceof UploadError) {
      return NextResponse.json({ error: cause.message }, { status: cause.status });
    }
    console.error("finalize failed", cause);
    return NextResponse.json({ error: "No se pudo finalizar la carga." }, { status: 500 });
  }
}
