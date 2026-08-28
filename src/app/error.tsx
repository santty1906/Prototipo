"use client";

/**
 * Route-level error boundary.
 *
 * Almost every failure here at MVP stage is the same one — Supabase is not
 * configured yet — so the message says so rather than showing a blank screen.
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-red-200 bg-white p-8">
      <h1 className="text-xl font-semibold">Se produjo un error</h1>
      <p className="mt-2 text-sm text-slate-600">
        Normalmente esto significa que la conexión con Supabase aún no está configurada.
        Compruebe que{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.env.local</code> contiene una
        URL de proyecto y unas claves reales, y que se han aplicado las migraciones de{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">supabase/migrations</code>.
      </p>
      {error.message ? (
        <pre className="mt-4 overflow-x-auto rounded bg-slate-50 p-3 text-xs text-slate-700">
          {error.message}
        </pre>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Reintentar
      </button>
    </div>
  );
}
