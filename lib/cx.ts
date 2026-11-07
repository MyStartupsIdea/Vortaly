/** Tiny class-name joiner — avoids pulling in clsx for one function. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
