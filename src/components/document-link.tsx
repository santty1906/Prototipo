"use client";

import { useState } from "react";

/**
 * Opens a document from the private bucket.
 *
 * The tab is opened synchronously on click and only then pointed at the signed
 * URL — popup blockers reject a `window.open` that happens after an `await`.
 */
export function DocumentLink({ documentId }: { documentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function open() {
    setError(null);
    setIsLoading(true);
    const tab = window.open("", "_blank");

    try {
      const response = await fetch(`/api/documents/${documentId}/url`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo abrir el documento.");
      if (tab) tab.location.href = body.url;
      else window.location.href = body.url;
    } catch (cause) {
      tab?.close();
      setError(cause instanceof Error ? cause.message : "No se pudo abrir el documento.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={open}
        disabled={isLoading}
        className="text-sm font-medium text-slate-900 underline hover:text-slate-600 disabled:opacity-50"
      >
        {isLoading ? "Abriendo…" : "Abrir PDF"}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
