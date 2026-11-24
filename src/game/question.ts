import type { PublicQuestion, ShownQuestion } from "../../shared/types";

/** The question node with its options merged in (empty until they are readable). */
export function shownQuestion(
  q: PublicQuestion | null | undefined,
  options: string[] | undefined,
): ShownQuestion | null | undefined {
  if (!q) return q;
  return { ...q, options: options ?? [] };
}
