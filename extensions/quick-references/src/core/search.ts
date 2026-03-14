import Fuse from "fuse.js";
import { ReferenceIndexItem } from "../types";
import {
  applyScoreAdjustments,
  getExactMatchPenalty,
  normalizeSearchQuery,
} from "./query";

export interface SearchResult {
  item: ReferenceIndexItem;
  score?: number;
}

export class ReferenceSearcher {
  private readonly fuse: Fuse<ReferenceIndexItem>;
  private readonly source: ReferenceIndexItem[];

  constructor(entries: ReferenceIndexItem[]) {
    this.source = [...entries];
    this.fuse = new Fuse(entries, {
      keys: [
        { name: "title", weight: 0.35 },
        { name: "tags", weight: 0.2 },
        { name: "category", weight: 0.1 },
        { name: "headings", weight: 0.2 },
        { name: "summary", weight: 0.15 },
        { name: "topSnippet", weight: 0.05 },
        { name: "path", weight: 0.05 },
      ],
      threshold: 0.35,
      includeScore: true,
      ignoreLocation: true,
    });
  }

  search(query: string): SearchResult[] {
    const normalizedQuery = normalizeSearchQuery(query);

    if (!normalizedQuery) {
      return this.source
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((item) => ({ item }));
    }

    return this.fuse
      .search(normalizedQuery)
      .map((match) => {
        const item = match.item;
        const score = applyScoreAdjustments(match.score ?? 0.5, [
          getExactMatchPenalty(normalizedQuery, item.title),
          getExactMatchPenalty(normalizedQuery, item.category),
          getExactMatchPenalty(normalizedQuery, item.path),
          ...item.tags.map((tag) => getExactMatchPenalty(normalizedQuery, tag)),
          ...item.headings.map((heading) =>
            getExactMatchPenalty(normalizedQuery, heading),
          ),
          getExactMatchPenalty(normalizedQuery, item.summary),
          getExactMatchPenalty(normalizedQuery, item.topSnippet ?? ""),
        ]);

        return {
          item,
          score,
        };
      })
      .sort((left, right) => (left.score ?? 1) - (right.score ?? 1));
  }
}
