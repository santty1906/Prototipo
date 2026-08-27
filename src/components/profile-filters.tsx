"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import type { TraitOption } from "@/server/profiles";

type Selected = { q: string; capabilities: string[]; attitudes: string[] };

/**
 * Search + filter controls.
 *
 * All state lives in the URL, so the list is rendered on the server, the back
 * button works, and a filtered view can be shared as a link. This component
 * only translates clicks into query strings.
 */
export function ProfileFilters({
  capabilityOptions,
  attitudeOptions,
  selected,
}: {
  capabilityOptions: TraitOption[];
  attitudeOptions: TraitOption[];
  selected: Selected;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(selected.q);

  /**
   * The pending debounce timer.
   *
   * It has to be cancellable from outside the effect: a checkbox click must kill
   * an in-flight keystroke timer. Without that, the timer fires afterwards with
   * the `selected` it captured *before* the click and silently drops the newly
   * chosen capability from the URL.
   */
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDebounce = useCallback(() => {
    if (debounce.current) {
      clearTimeout(debounce.current);
      debounce.current = null;
    }
  }, []);

  const push = useCallback(
    (next: Selected) => {
      cancelDebounce();
      const params = new URLSearchParams();
      if (next.q.trim()) params.set("q", next.q.trim());
      for (const code of next.capabilities) params.append("capability", code);
      for (const code of next.attitudes) params.append("attitude", code);
      const search = params.toString();
      startTransition(() => router.push(search ? `/profiles?${search}` : "/profiles"));
    },
    [cancelDebounce, router],
  );

  // Debounce typing so every keystroke does not hit the database. `query` is the
  // live input value and always wins over `selected.q`, which lags by one
  // navigation — so a toggle mid-typing keeps the text instead of reverting it.
  useEffect(() => {
    if (query === selected.q) return;
    debounce.current = setTimeout(() => {
      debounce.current = null;
      push({ q: query, capabilities: selected.capabilities, attitudes: selected.attitudes });
    }, 250);
    return cancelDebounce;
  }, [query, selected.q, selected.capabilities, selected.attitudes, push, cancelDebounce]);

  function toggle(kind: "capabilities" | "attitudes", code: string) {
    const current = selected[kind];
    const next = current.includes(code)
      ? current.filter((value) => value !== code)
      : [...current, code];
    // Send the live `query`, not `selected.q`: text typed in the last 250 ms has
    // not reached the URL yet and would otherwise be lost.
    push({ ...selected, q: query, [kind]: next });
  }

  const hasFilters =
    selected.q !== "" || selected.capabilities.length > 0 || selected.attitudes.length > 0;

  return (
    <aside
      className={`space-y-6 rounded-lg border border-slate-200 bg-white p-5 ${
        isPending ? "opacity-60" : ""
      }`}
    >
      <div>
        <label htmlFor="profile-search" className="mb-1.5 block text-sm font-medium">
          Search by name
        </label>
        <input
          id="profile-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. Ana"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
      </div>

      <TraitGroup
        title="Capabilities"
        options={capabilityOptions}
        selected={selected.capabilities}
        onToggle={(code) => toggle("capabilities", code)}
      />

      <TraitGroup
        title="Attitudes"
        options={attitudeOptions}
        selected={selected.attitudes}
        onToggle={(code) => toggle("attitudes", code)}
      />

      {hasFilters ? (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            push({ q: "", capabilities: [], attitudes: [] });
          }}
          className="text-sm text-slate-600 underline hover:text-slate-900"
        >
          Clear all filters
        </button>
      ) : null}
    </aside>
  );
}

function TraitGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: TraitOption[];
  selected: string[];
  onToggle: (code: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{title}</legend>
      {options.length === 0 ? (
        <p className="text-sm text-slate-500">None recorded yet.</p>
      ) : (
        <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {options.map((option) => (
            <label key={option.code} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(option.code)}
                onChange={() => onToggle(option.code)}
                className="size-4 rounded border-slate-300"
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
