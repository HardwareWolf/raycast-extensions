import {
  ReferenceIndexItem,
  ReferenceSectionRecord,
  ReferenceSnippetRecord,
} from "../types";
import { isCommandLikeQuery, normalizeSearchQuery } from "./query";
import { ReferenceSearcher } from "./search";

export type GlobalSearchResultKind = "snippet" | "section" | "reference";
export type GlobalSearchFilter = "all" | "snippets" | "sections" | "references";

export interface GlobalSearchResult {
  id: string;
  kind: GlobalSearchResultKind;
  score: number;
  reference: ReferenceIndexItem;
  section?: ReferenceSectionRecord;
  snippet?: ReferenceSnippetRecord;
}

export class GlobalCommandSearcher {
  private readonly referencesById: Map<string, ReferenceIndexItem>;
  private readonly sectionsById: Map<string, ReferenceSectionRecord>;
  private readonly referenceSearcher: ReferenceSearcher;

  constructor(
    private readonly dataset: {
      index: ReferenceIndexItem[];
      sections: ReferenceSectionRecord[];
      snippets: ReferenceSnippetRecord[];
    },
  ) {
    this.referencesById = new Map(
      dataset.index.map((reference) => [reference.id, reference]),
    );
    this.sectionsById = new Map(
      dataset.sections.map((section) => [section.id, section]),
    );
    this.referenceSearcher = new ReferenceSearcher(dataset.index);
  }

  search(
    query: string,
    filter: GlobalSearchFilter = "all",
  ): GlobalSearchResult[] {
    const normalizedQuery = normalizeSearchQuery(query);
    if (!normalizedQuery) {
      return [];
    }

    const queryTokens = normalizedQuery.split(" ").filter(Boolean);
    const commandLike = isCommandLikeQuery(normalizedQuery);
    const results: GlobalSearchResult[] = [];

    if (filter === "all" || filter === "snippets") {
      for (const snippet of this.dataset.snippets) {
        const reference = this.referencesById.get(snippet.referenceId);
        if (!reference) {
          continue;
        }

        const section = snippet.sectionId
          ? this.sectionsById.get(snippet.sectionId)
          : undefined;
        const fieldScore = getBestScore(
          [
            { value: snippet.plainCode, weight: 8 },
            { value: snippet.preview, weight: 5 },
            { value: snippet.description, weight: 4 },
            { value: section?.title, weight: 3 },
            { value: reference.title, weight: 2 },
            { value: reference.category, weight: 1 },
          ],
          normalizedQuery,
          queryTokens,
        );

        if (fieldScore <= 0) {
          continue;
        }

        const combinedScore = getTextScore(
          [
            snippet.plainCode,
            snippet.description,
            snippet.preview,
            section?.title,
            reference.title,
            reference.category,
          ]
            .filter(Boolean)
            .join(" "),
          normalizedQuery,
          queryTokens,
          2,
        );

        const matchScore =
          fieldScore +
          combinedScore +
          (commandLike
            ? getTextScore(snippet.plainCode, normalizedQuery, queryTokens, 3)
            : 0);

        results.push({
          id: snippet.id,
          kind: "snippet",
          reference,
          snippet,
          score: invertScore(matchScore),
        });
      }
    }

    if (filter === "all" || filter === "sections") {
      for (const section of this.dataset.sections) {
        const reference = this.referencesById.get(section.referenceId);
        if (!reference) {
          continue;
        }

        const fieldScore = getBestScore(
          [
            { value: section.title, weight: 7 },
            { value: section.snippet, weight: 5 },
            { value: section.plainText, weight: 4 },
            { value: reference.title, weight: 2 },
            { value: reference.category, weight: 1 },
          ],
          normalizedQuery,
          queryTokens,
        );

        if (fieldScore <= 0) {
          continue;
        }

        const combinedScore = getTextScore(
          [
            section.title,
            section.parents.join(" "),
            section.snippet,
            section.plainText,
            reference.title,
            reference.category,
          ].join(" "),
          normalizedQuery,
          queryTokens,
          2,
        );

        results.push({
          id: section.id,
          kind: "section",
          reference,
          section,
          score: invertScore(
            fieldScore + combinedScore + (commandLike ? 4 : 0),
          ),
        });
      }
    }

    if (filter === "all" || filter === "references") {
      results.push(
        ...this.referenceSearcher.search(normalizedQuery).map((match) => ({
          id: match.item.id,
          kind: "reference" as const,
          reference: match.item,
          score: (match.score ?? 0.5) + (commandLike ? 0.08 : 0.02),
        })),
      );
    }

    return results
      .sort((left, right) => left.score - right.score)
      .slice(0, 200);
  }
}

function getBestScore(
  fields: Array<{ value?: string; weight: number }>,
  normalizedQuery: string,
  queryTokens: string[],
): number {
  let bestScore = 0;

  for (const field of fields) {
    const score = getTextScore(
      field.value,
      normalizedQuery,
      queryTokens,
      field.weight,
    );
    if (score > bestScore) {
      bestScore = score;
    }
  }

  return bestScore;
}

function getTextScore(
  value: string | undefined,
  normalizedQuery: string,
  queryTokens: string[],
  weight: number,
): number {
  if (!value) {
    return 0;
  }

  const normalizedValue = normalizeSearchQuery(value);
  if (!normalizedValue) {
    return 0;
  }

  if (normalizedValue === normalizedQuery) {
    return 120 * weight;
  }

  if (normalizedValue.startsWith(normalizedQuery)) {
    return 90 * weight;
  }

  if (normalizedValue.includes(normalizedQuery)) {
    return 70 * weight;
  }

  if (
    queryTokens.length > 1 &&
    queryTokens.every((token) => normalizedValue.includes(token))
  ) {
    return 45 * weight;
  }

  if (matchesSubsequence(normalizedValue, normalizedQuery)) {
    return 20 * weight;
  }

  return 0;
}

function matchesSubsequence(value: string, query: string): boolean {
  if (!query) {
    return false;
  }

  let queryIndex = 0;
  for (const character of value) {
    if (character === query[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === query.length) {
        return true;
      }
    }
  }

  return false;
}

function invertScore(matchScore: number): number {
  return Math.max(0, 1000 - matchScore);
}
