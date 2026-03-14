export function normalizeSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/`/g, "")
    .replace(/^\s*[$#>]\s*/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isCommandLikeQuery(query: string): boolean {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes(" ") ||
    normalized.includes("--") ||
    normalized.includes("/") ||
    normalized.includes(":") ||
    normalized.startsWith("-")
  );
}

export function getExactMatchPenalty(query: string, candidate: string): number {
  const normalizedQuery = normalizeSearchQuery(query);
  const normalizedCandidate = normalizeSearchQuery(candidate);

  if (!normalizedQuery || !normalizedCandidate) {
    return 0;
  }

  if (normalizedCandidate === normalizedQuery) {
    return -0.45;
  }

  if (normalizedCandidate.startsWith(normalizedQuery)) {
    return -0.25;
  }

  if (normalizedCandidate.includes(normalizedQuery)) {
    return -0.15;
  }

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (
    tokens.length > 1 &&
    tokens.every((token) => normalizedCandidate.includes(token))
  ) {
    return -0.08;
  }

  return 0;
}

export function applyScoreAdjustments(
  baseScore: number,
  adjustments: number[],
): number {
  return Math.max(0, baseScore + Math.min(0, ...adjustments, 0));
}
