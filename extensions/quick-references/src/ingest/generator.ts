import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";
import {
  extractReferenceSections,
  extractReferenceSnippets,
  processReferenceMarkdown,
} from "../core/reference-markdown";
import {
  CURRENT_DATASET_SCHEMA_VERSION,
  Dataset,
  Frontmatter,
  ReferenceIndexItem,
  ReferenceSectionRecord,
  ReferenceSnippetRecord,
} from "../types";

export interface BuildOptions {
  sourceLabel?: string;
  version?: string;
  limit?: number;
}

const GITHUB_BASE =
  "https://github.com/Fechin/reference/blob/main/source/_posts";

const MAX_HEADINGS = 20;
const MAX_SNIPPET_LINES = 12;

export async function buildDatasetFromDir(
  postsDir: string,
  options: BuildOptions = {},
): Promise<Dataset> {
  const files = (await fs.promises.readdir(postsDir))
    .filter((file) => file.endsWith(".md"))
    .sort();

  const limitedFiles =
    options.limit && options.limit > 0 ? files.slice(0, options.limit) : files;

  const entries = await Promise.all(
    limitedFiles.map(async (file) => {
      const filePath = path.join(postsDir, file);
      const raw = await fs.promises.readFile(filePath, "utf8");
      return parseMarkdownFile(file, raw);
    }),
  );

  const index: ReferenceIndexItem[] = entries.map((entry) => entry.index);
  const content = entries.reduce<Record<string, string>>((acc, entry) => {
    acc[entry.index.id] = entry.content;
    return acc;
  }, {});
  const sections = entries.flatMap((entry) => entry.sections);
  const snippets = entries.flatMap((entry) => entry.snippets);

  const dataset: Dataset = {
    meta: {
      schemaVersion: CURRENT_DATASET_SCHEMA_VERSION,
      source: options.sourceLabel ?? "Fechin/reference",
      generatedAt: new Date().toISOString(),
      total: index.length,
      sectionsTotal: sections.length,
      snippetsTotal: snippets.length,
      version: options.version,
    },
    index,
    content,
    sections,
    snippets,
  };

  return dataset;
}

function parseMarkdownFile(
  filename: string,
  raw: string,
): {
  index: ReferenceIndexItem;
  content: string;
  sections: ReferenceSectionRecord[];
  snippets: ReferenceSnippetRecord[];
} {
  const { data, content: rawContent } = matter(raw);
  const frontmatter = data as Frontmatter;
  const normalizedContent = rawContent.trim();
  const content = processReferenceMarkdown(normalizedContent);
  const sourceMarkdown = processReferenceMarkdown(normalizedContent, {
    tableMode: "preserve",
  });

  const id = slugFromFilename(filename);
  const title =
    typeof frontmatter.title === "string" && frontmatter.title.trim().length > 0
      ? frontmatter.title.trim()
      : id;
  const category = selectFirstString(frontmatter.categories) ?? "General";
  const tags = sanitizeStringArray(frontmatter.tags);
  const summary = deriveSummary(content, frontmatter.intro);
  const link = `${GITHUB_BASE}/${filename}`;
  const sections = extractReferenceSections({
    referenceId: id,
    markdown: sourceMarkdown,
  });
  const snippets = extractReferenceSnippets({
    referenceId: id,
    sections,
    sourceMarkdown,
  });
  const headings = extractHeadings(content);
  const topSnippet = snippets[0]?.preview ?? extractTopSnippet(content);

  const index: ReferenceIndexItem = {
    id,
    title,
    category,
    tags,
    summary,
    headings,
    topSnippet,
    sectionCount: sections.length,
    snippetCount: snippets.length,
    path: filename,
    link,
  };

  return { index, content, sections, snippets };
}

function slugFromFilename(filename: string): string {
  return filename.replace(/\.md$/, "");
}

function sanitizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : String(item ?? "")))
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }

  return [];
}

function selectFirstString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string");
    return typeof first === "string" ? first : undefined;
  }

  return typeof value === "string" ? value : undefined;
}

function deriveSummary(body: string, intro?: string): string {
  if (intro && intro.trim().length > 0) {
    return cleanWhitespace(intro);
  }

  const paragraphs = body.split(/\n{2,}/);
  const firstParagraph = paragraphs.find(
    (paragraph) =>
      paragraph.trim().length > 0 && !paragraph.trim().startsWith("#"),
  );

  if (firstParagraph) {
    return cleanWhitespace(firstParagraph);
  }

  const firstLine = body.split(/\r?\n/).find((line) => line.trim().length > 0);
  return firstLine ? cleanWhitespace(firstLine) : "";
}

function extractHeadings(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const headings: string[] = [];

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (match) {
      headings.push(cleanHeading(match[2]));
      if (headings.length >= MAX_HEADINGS) break;
    }
  }

  return headings;
}

function cleanHeading(heading: string): string {
  return cleanWhitespace(heading.replace(/\{.*\}/, ""));
}

function extractTopSnippet(markdown: string): string | undefined {
  const codeFenceMatch = markdown.match(/```[\s\S]*?```/);
  if (codeFenceMatch) {
    return trimSnippet(codeFenceMatch[0]);
  }

  const listMatch = markdown.match(/^-\s+.+$/m);
  if (listMatch) {
    return cleanWhitespace(listMatch[0]);
  }

  return undefined;
}

function trimSnippet(snippet: string): string {
  const lines = snippet.split(/\r?\n/);
  const innerLines = lines.slice(1, lines.length - 1); // drop fences
  const truncated = innerLines.slice(0, MAX_SNIPPET_LINES);
  return truncated.join("\n").trim();
}

function cleanWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
