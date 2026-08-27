import "server-only";

import { extractText } from "unpdf";

export type ExtractedPdfText = {
  totalPages: number;
  /** One entry per page, in document order. */
  pages: string[];
  /** All pages joined with a form feed, which the parser treats as a page break. */
  text: string;
};

/** Separates pages in `text`. Chosen because it cannot occur inside extracted prose. */
export const PAGE_BREAK = "\f";

/**
 * PDF bytes → plain text.
 *
 * Deliberately knows nothing about what the PDF contains — that is the parser's
 * job. Keeping the two apart means the parser can be tested against a string
 * fixture with no PDF, and the reader can be swapped without touching parsing.
 *
 * `unpdf` is used rather than `pdf-parse` because it ships a serverless build of
 * pdf.js with zero dependencies; `pdf-parse` pulls in `@napi-rs/canvas`, a
 * native binary that has no place in a Vercel function.
 *
 * Everything stays in memory: no temporary file is written, so this is safe on a
 * read-only serverless filesystem.
 */
export async function extractPdfText(bytes: Uint8Array | ArrayBuffer): Promise<ExtractedPdfText> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  if (data.byteLength === 0) {
    throw new Error("The PDF is empty (0 bytes).");
  }

  let result: { totalPages: number; text: string[] };
  try {
    result = await extractText(data, { mergePages: false });
  } catch (cause) {
    throw new Error(
      `Could not read the PDF: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const pages = result.text.map((page) => page ?? "");

  return {
    totalPages: result.totalPages,
    pages,
    text: pages.join(PAGE_BREAK),
  };
}
