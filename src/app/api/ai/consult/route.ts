import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";

import { CONSULTANT_SYSTEM_PROMPT, buildProfileContext } from "@/server/ai/consultant";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ai/consult
 *
 * The browser's only route to Claude. The API key lives in the server process
 * and is never sent to, or referenced by, client code:
 *
 *   Browser -> this route -> Anthropic -> this route -> Browser
 *
 * Profile content is loaded here from the database using the posted id. The
 * client cannot inject profile facts, only choose which profile to ask about.
 */

/** Claude Opus 5. Adaptive thinking is on by default on this model. */
const MODEL = "claude-opus-5";

/** Chat answers are short by design; this is a ceiling, not a target. */
const MAX_TOKENS = 4096;

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_TURNS = 20;

const schema = z.object({
  profileId: z.string().uuid("A valid profile id is required."),
  message: z
    .string()
    .trim()
    .min(1, "The message cannot be empty.")
    .max(MAX_MESSAGE_CHARS, `Messages are limited to ${MAX_MESSAGE_CHARS} characters.`),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS * 4),
      }),
    )
    .max(MAX_HISTORY_TURNS)
    .optional()
    .default([]),
});

export async function POST(request: Request) {
  // Cheap guard before parsing: refuse an oversized body outright.
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 100_000) {
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // A configuration problem, reported as one — not a crash, and with no hint
    // about the environment beyond the variable name the operator must set.
    return NextResponse.json(
      {
        error:
          "El consultor de IA no está configurado. Falta la variable de entorno ANTHROPIC_API_KEY.",
        code: "NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((issue) => issue.message).join(" ") },
      { status: 400 },
    );
  }

  const { profileId, message, history } = parsed.data;

  try {
    const context = await buildProfileContext(profileId);
    if (!context) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }

    const client = new Anthropic();

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: CONSULTANT_SYSTEM_PROMPT,
      // Answers are grounded in supplied context rather than open-ended
      // reasoning, so medium effort is the right cost/quality point here.
      output_config: { effort: "medium" },
      messages: [
        {
          role: "user",
          content: `Profile context for this conversation:\n\n${context.text}`,
        },
        {
          role: "assistant",
          content: "Entendido. Tengo el perfil disponible. ¿Qué desea consultar?",
        },
        ...history.map((entry) => ({ role: entry.role, content: entry.content })),
        { role: "user", content: message },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "El modelo no pudo responder a esta consulta. Intente reformularla." },
        { status: 422 },
      );
    }

    const answer = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!answer) {
      return NextResponse.json(
        { error: "El modelo no devolvió una respuesta. Intente de nuevo." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { answer, profileName: context.fullName },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    // Never forward the raw SDK error: its message and metadata can carry
    // request details. Log a category server-side, return a generic message.
    if (cause instanceof Anthropic.AuthenticationError) {
      console.error("[ai/consult] Anthropic rejected the credentials");
      return NextResponse.json(
        { error: "El consultor de IA no está configurado correctamente.", code: "NOT_CONFIGURED" },
        { status: 503 },
      );
    }
    if (cause instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Demasiadas consultas. Espere unos segundos e intente de nuevo." },
        { status: 429 },
      );
    }
    if (cause instanceof Anthropic.APIError) {
      console.error(`[ai/consult] Anthropic API error, status ${cause.status}`);
      return NextResponse.json(
        { error: "El consultor de IA no está disponible en este momento." },
        { status: 502 },
      );
    }

    console.error("[ai/consult] unexpected failure", cause instanceof Error ? cause.message : cause);
    return NextResponse.json({ error: "No se pudo procesar la consulta." }, { status: 500 });
  }
}
