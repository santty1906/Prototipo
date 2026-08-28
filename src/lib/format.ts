/** Turns "Design Systems" into "design-systems" — the value filters match on. */
export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents so "Sofía" and "Sofia" agree
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Splits a comma-separated input into unique { code, label } pairs. */
export function parseTraitList(input: string) {
  const seen = new Set<string>();
  const traits: { code: string; label: string }[] = [];

  for (const raw of input.split(",")) {
    const label = raw.trim();
    const code = slugify(label);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    traits.push({ code, label });
  }

  return traits;
}

export function formatBytes(bytes: number | null) {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
