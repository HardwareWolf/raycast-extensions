import { describe, expect, it } from "vitest";
import { GlobalCommandSearcher } from "./global-search";
import {
  CURRENT_DATASET_SCHEMA_VERSION,
  Dataset,
  ReferenceIndexItem,
  ReferenceSectionRecord,
  ReferenceSnippetRecord,
} from "../types";

const reference: ReferenceIndexItem = {
  id: "git",
  title: "Git",
  category: "Programming",
  tags: ["vcs"],
  summary: "Git commands",
  topSnippet: "git restore --staged package.json",
  headings: ["Commands"],
  sectionCount: 1,
  snippetCount: 1,
  path: "git.md",
  link: "https://example.com/git.md",
};

const section: ReferenceSectionRecord = {
  id: "git#section-1",
  referenceId: "git",
  title: "Commands",
  level: 2,
  parents: [],
  markdown: "## Commands\n\n```bash\ngit restore --staged package.json\n```",
  plainText: "Commands git restore --staged package.json",
  snippet: "git restore --staged package.json",
};

const snippet: ReferenceSnippetRecord = {
  id: "git#snippet-1",
  referenceId: "git",
  sectionId: "git#section-1",
  source: "code-fence",
  language: "bash",
  code: "git restore --staged package.json",
  plainCode: "git restore --staged package.json",
  preview: "git restore --staged package.json",
};

const dataset: Dataset = {
  meta: {
    schemaVersion: CURRENT_DATASET_SCHEMA_VERSION,
    source: "Fechin/reference",
    generatedAt: new Date().toISOString(),
    total: 1,
    sectionsTotal: 1,
    snippetsTotal: 1,
  },
  index: [reference],
  content: { git: section.markdown },
  sections: [section],
  snippets: [snippet],
};

describe("global-search", () => {
  it("ranks exact snippet matches ahead of broader matches", () => {
    const searcher = new GlobalCommandSearcher(dataset);
    const results = searcher.search("git restore --staged");

    expect(results[0]?.kind).toBe("snippet");
    expect(results[0]?.snippet?.plainCode).toContain("git restore --staged");
  });
});
