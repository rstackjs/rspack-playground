export function normalizePath(value: string | undefined) {
  return (value || "")
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/^\/+/, "")
    .trim();
}
