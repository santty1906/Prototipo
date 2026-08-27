"use client";

import { useEffect, useRef, useState } from "react";

/**
 * AI talent consultant, as a slide-over panel.
 *
 * Deliberately a drawer rather than a page: the profile stays on screen behind
 * it, so the reader can check a score against an answer without navigating away.
 *
 * History is in-memory for the session only — nothing is persisted, and closing
 * the drawer keeps the thread until the page is left.
 */

type ChatMessage = { role: "user" | "assistant"; content: string };

const SUGGESTED_QUESTIONS = [
  "¿Cuáles son sus principales fortalezas?",
  "¿Cómo trabaja bajo presión?",
  "¿Cómo debería liderarlo un supervisor?",
  "¿Qué tipo de ambiente laboral favorece su desempeño?",
  "¿Cuáles podrían ser sus áreas de desarrollo?",
  "¿Cómo podría comportarse trabajando en equipo?",
  "Resume este perfil para Recursos Humanos.",
  "¿Qué diferencias hay entre su adaptación laboral y su conducta bajo presión?",
];

const MAX_MESSAGE_CHARS = 2000;

export function AiConsultant({
  profileId,
  profileName,
  discSummary,
}: {
  profileId: string;
  profileName: string;
  discSummary: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  // Escape closes the drawer, as with any modal surface.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    setInput("");
    // Snapshot the history *before* adding this turn — the server expects the
    // prior conversation plus the new message as separate fields.
    const history = messages.slice(-20);
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/consult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, message: trimmed, history }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo procesar la consulta.");

      setMessages((current) => [...current, { role: "assistant", content: body.answer }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo procesar la consulta.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
      >
        🤖 Consultor de Talento AI
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Consultor de Talento AI"
            className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <h2 className="font-semibold">🤖 Consultor de Talento AI</h2>
                <p className="truncate text-sm text-slate-600">{profileName}</p>
                {discSummary ? (
                  <p className="mt-0.5 text-xs text-slate-500">Perfil DISC: {discSummary}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </header>

            <div ref={threadRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {messages.length === 0 && !isLoading ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    Preguntas sobre este perfil, basadas en su informe de competencias.
                  </p>
                  <div className="space-y-1.5">
                    {SUGGESTED_QUESTIONS.map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => ask(question)}
                        className="block w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:border-slate-400 hover:bg-slate-50"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((message, index) => (
                <div
                  key={index}
                  className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                      message.role === "user"
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-900"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}

              {isLoading ? (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500">
                    Analizando el perfil…
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              ) : null}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                ask(input);
              }}
              className="border-t border-slate-200 px-5 py-4"
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      ask(input);
                    }
                  }}
                  rows={2}
                  maxLength={MAX_MESSAGE_CHARS}
                  placeholder="Escriba su consulta…"
                  disabled={isLoading}
                  className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-50"
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Las respuestas se basan en el informe del candidato. Verifique la información
                antes de tomar decisiones.
              </p>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
