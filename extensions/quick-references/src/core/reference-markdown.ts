import {
  ReferenceSectionRecord,
  ReferenceSnippetRecord,
  ReferenceSnippetSource,
} from "../types";
import { stripShellPrompts } from "./copy";

interface ProcessReferenceMarkdownOptions {
  tableMode?: "render" | "preserve";
}

interface SectionExtractionInput {
  referenceId: string;
  markdown: string;
}

interface SnippetExtractionInput {
  referenceId: string;
  sections: ReferenceSectionRecord[];
  sourceMarkdown?: string;
}

interface ParsedTableBlock {
  headers: string[];
  rows: string[][];
}

const STANDALONE_ANNOTATION_RE = /^\s*\{[.#][a-zA-Z][-a-zA-Z0-9 .#]*\}\s*$/;
const INLINE_ANNOTATION_RE = /\s*\{[.#][a-zA-Z][-a-zA-Z0-9 .#]*\}/g;
const CUSTOM_TAG_RE = /<\/?(yel|pur|shell|motion|operator)>/gi;
const DETAILS_BLOCK_RE =
  /<details>\s*<summary[^>]*>(.*?)<\/summary>\s*([\s\S]*?)<\/details>/gi;
const HTML_TAG_RE = /<[^>]+>/g;
const CODE_FENCE_RE = /^(\s*```)\s*([^`]*)$/;
const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const INLINE_CODE_RE = /`([^`\n]+)`/g;

const CODE_FENCE_LANGUAGE_ALIASES: Record<string, string> = {
  sh: "bash",
  shell: "bash",
  "shell script": "bash",
  "shell-script": "bash",
  console: "bash",
  terminal: "bash",
  zsh: "bash",
  yml: "yaml",
  js: "javascript",
  ts: "typescript",
  md: "markdown",
  plaintext: "text",
  text: "text",
};

export function processReferenceMarkdown(
  markdown: string,
  options: ProcessReferenceMarkdownOptions = {},
): string {
  const sanitized = markdown
    .trim()
    .split("\n")
    .map((inputLine) => sanitizeLine(inputLine))
    .join("\n");

  const htmlConverted = convertHtmlBlocks(sanitized);
  const nextMarkdown =
    options.tableMode === "preserve"
      ? htmlConverted
      : renderTableBlocks(htmlConverted);

  return nextMarkdown.replace(/\n{3,}/g, "\n\n").trim();
}

export function extractReferenceSections({
  referenceId,
  markdown,
}: SectionExtractionInput): ReferenceSectionRecord[] {
  const lines = markdown.split(/\r?\n/);
  const sections: ReferenceSectionRecord[] = [];
  const intro: string[] = [];
  const headingStack: Array<{ level: number; title: string }> = [];

  let current:
    | {
        title: string;
        level: number;
        parents: string[];
        lines: string[];
      }
    | undefined;
  let isInsideCodeFence = false;
  let sectionIndex = 0;

  const flushCurrent = () => {
    if (!current) {
      return;
    }

    const body = current.lines.join("\n").trim();
    if (!body) {
      current = undefined;
      return;
    }

    const rawSectionMarkdown = `${"#".repeat(current.level)} ${current.title}\n\n${body}`;
    const renderedMarkdown = processReferenceMarkdown(rawSectionMarkdown);
    const plainText = markdownToPlainText(renderedMarkdown);

    sections.push({
      id: `${referenceId}#section-${sectionIndex++}`,
      referenceId,
      title: current.title,
      level: current.level,
      parents: current.parents,
      markdown: renderedMarkdown,
      plainText,
      snippet: buildSectionSnippet(renderedMarkdown, plainText),
    });

    current = undefined;
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      isInsideCodeFence = !isInsideCodeFence;
    }

    if (!isInsideCodeFence) {
      const headingMatch = HEADING_RE.exec(line.trim());
      if (headingMatch) {
        flushCurrent();

        const level = headingMatch[1].length;
        const title = cleanHeading(headingMatch[2]);

        while (
          headingStack.length > 0 &&
          headingStack[headingStack.length - 1].level >= level
        ) {
          headingStack.pop();
        }

        const parents = headingStack.map((heading) => heading.title);
        headingStack.push({ level, title });
        current = { title, level, parents, lines: [] };
        continue;
      }
    }

    if (current) {
      current.lines.push(line);
    } else {
      intro.push(line);
    }
  }

  flushCurrent();

  const introMarkdown = intro.join("\n").trim();
  if (!introMarkdown) {
    return sections;
  }

  const renderedIntro = processReferenceMarkdown(introMarkdown);
  const plainText = markdownToPlainText(renderedIntro);
  return [
    {
      id: `${referenceId}#section-overview`,
      referenceId,
      title: "Overview",
      level: 1,
      parents: [],
      markdown: renderedIntro,
      plainText,
      snippet: buildSectionSnippet(renderedIntro, plainText),
    },
    ...sections,
  ];
}

export function extractReferenceSnippets({
  referenceId,
  sections,
  sourceMarkdown,
}: SnippetExtractionInput): ReferenceSnippetRecord[] {
  const snippets: ReferenceSnippetRecord[] = [];
  const seen = new Set<string>();
  const sectionIdByKey = new Map(
    sections.map((section) => [
      getSectionKey(section.title, section.parents),
      section.id,
    ]),
  );

  let snippetIndex = 0;

  const pushSnippet = (
    snippet: Omit<ReferenceSnippetRecord, "id">,
    dedupeSuffix = "",
  ) => {
    const dedupeKey = `${buildSnippetDedupeKey(snippet)}:${dedupeSuffix}`;
    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    snippets.push({
      id: `${referenceId}#snippet-${snippetIndex++}`,
      ...snippet,
    });
  };

  const sectionKeysWithTables = new Set<string>();

  if (sourceMarkdown) {
    const tableSnippets = extractTableSnippets({
      referenceId,
      markdown: sourceMarkdown,
      sectionIdByKey,
    });

    for (const sectionKey of tableSnippets.sectionKeysWithTables) {
      sectionKeysWithTables.add(sectionKey);
    }

    for (const snippet of tableSnippets.snippets) {
      pushSnippet(snippet, "table");
    }
  }

  for (const section of sections) {
    const sectionKey = getSectionKey(section.title, section.parents);
    const markdown = section.markdown;

    for (const match of markdown.matchAll(/```([^\n`]*)\n([\s\S]*?)```/g)) {
      const language = normalizeCodeFenceLanguage((match[1] ?? "").trim());
      const code = (match[2] ?? "").trim();

      if (!code) {
        continue;
      }

      pushSnippet(
        buildSnippetRecord({
          referenceId,
          sectionId: section.id,
          source: "code-fence",
          language,
          code,
        }),
        "code-fence",
      );
    }

    const lines = markdown.split(/\r?\n/);
    let isInsideCodeFence = false;

    for (const line of lines) {
      if (line.trim().startsWith("```")) {
        isInsideCodeFence = !isInsideCodeFence;
        continue;
      }

      if (isInsideCodeFence) {
        continue;
      }

      const source = getInlineSnippetSource(line);
      if (!source) {
        continue;
      }

      if (
        source === "list-inline" &&
        sectionKeysWithTables.has(sectionKey) &&
        looksLikeRenderedTableRow(line)
      ) {
        continue;
      }

      for (const inlineMatch of line.matchAll(INLINE_CODE_RE)) {
        const code = inlineMatch[1]?.trim();
        if (!code) {
          continue;
        }

        pushSnippet(
          buildSnippetRecord({
            referenceId,
            sectionId: section.id,
            source,
            language: inferInlineSnippetLanguage(code),
            code,
          }),
          `${source}:${normalizeSnippetKey(code)}`,
        );
      }
    }
  }

  return snippets;
}

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, (match) =>
      match.replace(/```[^\n]*\n?/g, "").replace(/```/g, ""),
    )
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCodeFenceLanguage(language: string): string {
  if (!language) {
    return "";
  }

  const normalized = language.toLowerCase().replace(/\s+/g, " ").trim();
  const directMatch = CODE_FENCE_LANGUAGE_ALIASES[normalized];
  if (directMatch) {
    return directMatch;
  }

  const firstToken = normalized.split(" ")[0];
  return CODE_FENCE_LANGUAGE_ALIASES[firstToken] ?? firstToken;
}

function buildSnippetRecord(input: {
  referenceId: string;
  sectionId?: string;
  source: ReferenceSnippetSource;
  language?: string;
  code: string;
  description?: string;
  preview?: string;
}): Omit<ReferenceSnippetRecord, "id"> {
  const language = input.language || undefined;
  const plainCode =
    language === "bash" ? stripShellPrompts(input.code) : input.code.trim();
  const description = input.description?.trim();

  return {
    referenceId: input.referenceId,
    sectionId: input.sectionId,
    source: input.source,
    language,
    code: input.code.trim(),
    plainCode: plainCode.trim(),
    description,
    preview:
      input.preview?.trim() ||
      summarizeSnippetPreview(input.code, description, language),
  };
}

function sanitizeLine(line: string): string {
  if (STANDALONE_ANNOTATION_RE.test(line)) {
    return "";
  }

  let nextLine = line.replace(/^(```\S*)\s*\{[.#][^}]*\}/, "$1");
  nextLine = nextLine.replace(INLINE_ANNOTATION_RE, "");
  nextLine = nextLine.replace(CUSTOM_TAG_RE, "");

  const codeFenceMatch = CODE_FENCE_RE.exec(nextLine);
  if (codeFenceMatch) {
    const language = normalizeCodeFenceLanguage(codeFenceMatch[2].trim());
    return language ? `${codeFenceMatch[1]}${language}` : codeFenceMatch[1];
  }

  return nextLine;
}

function convertHtmlBlocks(markdown: string): string {
  let result = markdown.replace(
    DETAILS_BLOCK_RE,
    (_, summary: string, content: string) => {
      const cleanSummary = stripHtml(summary).trim();
      const cleanContent = stripHtml(content).trim();
      return `### ${cleanSummary}\n\n${cleanContent}`;
    },
  );

  result = result.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");
  result = result.replace(/<br\s*\/?>/gi, "\n");
  result = result.replace(HTML_TAG_RE, "");

  return result;
}

function stripHtml(value: string): string {
  return value.replace(HTML_TAG_RE, "");
}

function renderTableBlocks(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let isInsideCodeFence = false;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim().startsWith("```")) {
      isInsideCodeFence = !isInsideCodeFence;
      output.push(line);
      index += 1;
      continue;
    }

    if (!isInsideCodeFence) {
      const tableBlock = readMarkdownTableBlock(lines, index);
      if (tableBlock) {
        output.push(renderTableBlock(tableBlock.table));
        index = tableBlock.nextIndex;
        continue;
      }
    }

    output.push(line);
    index += 1;
  }

  return output.join("\n");
}

function readMarkdownTableBlock(
  lines: string[],
  startIndex: number,
): { table: ParsedTableBlock; nextIndex: number } | undefined {
  if (!isMarkdownTableLine(lines[startIndex])) {
    return undefined;
  }

  const delimiterLine = lines[startIndex + 1];
  if (!delimiterLine || !isMarkdownTableDelimiter(delimiterLine)) {
    return undefined;
  }

  const blockLines = [lines[startIndex], delimiterLine];
  let nextIndex = startIndex + 2;

  while (nextIndex < lines.length && isMarkdownTableLine(lines[nextIndex])) {
    blockLines.push(lines[nextIndex]);
    nextIndex += 1;
  }

  const table = parseMarkdownTableBlock(blockLines);
  if (!table || table.rows.length === 0) {
    return undefined;
  }

  return { table, nextIndex };
}

function parseMarkdownTableBlock(
  lines: string[],
): ParsedTableBlock | undefined {
  if (lines.length < 3) {
    return undefined;
  }

  const headers = splitMarkdownTableRow(lines[0]);
  if (headers.length === 0 || !isMarkdownTableDelimiter(lines[1])) {
    return undefined;
  }

  const rows = lines
    .slice(2)
    .map((line) => splitMarkdownTableRow(line))
    .filter((cells) => cells.length > 0);

  if (rows.length === 0) {
    return undefined;
  }

  return { headers, rows };
}

function splitMarkdownTableRow(line: string): string[] {
  let content = line.trim();
  if (!content) {
    return [];
  }

  if (content.startsWith("|")) {
    content = content.slice(1);
  }
  if (content.endsWith("|")) {
    content = content.slice(0, -1);
  }

  const cells: string[] = [];
  let current = "";
  let isEscaped = false;
  let isInsideCode = false;

  for (const character of content) {
    if (character === "\\" && !isEscaped && !isInsideCode) {
      isEscaped = true;
      current += character;
      continue;
    }

    if (character === "`" && !isEscaped) {
      isInsideCode = !isInsideCode;
      current += character;
      continue;
    }

    if (character === "|" && !isInsideCode && !isEscaped) {
      cells.push(cleanTableCell(current));
      current = "";
      continue;
    }

    current += character;
    isEscaped = false;
  }

  cells.push(cleanTableCell(current));
  return cells;
}

function cleanTableCell(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isMarkdownTableLine(line: string | undefined): boolean {
  const trimmed = line?.trim() ?? "";
  return trimmed.startsWith("|") && trimmed.endsWith("|");
}

function isMarkdownTableDelimiter(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")))
  );
}

function renderTableBlock(table: ParsedTableBlock): string {
  if (table.headers.length === 2) {
    return table.rows
      .map((row) => renderTwoColumnTableRow(row[0] ?? "", row[1] ?? ""))
      .join("\n");
  }

  return table.rows
    .map((row) => {
      const parts = row
        .map((cell, index) => {
          const header = table.headers[index] ?? `Column ${index + 1}`;
          const text = stripHtml(cell).trim();
          return text ? `**${header}:** ${text}` : undefined;
        })
        .filter((value): value is string => Boolean(value));

      return parts.length > 0 ? `- ${parts.join(" · ")}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function renderTwoColumnTableRow(left: string, right: string): string {
  const primary = left.trim();
  const secondary = right.trim();

  if (!primary && !secondary) {
    return "";
  }

  const formattedPrimary = /`[^`]+`/.test(primary)
    ? primary
    : primary
      ? `**${primary}**`
      : "";

  if (!secondary) {
    return `- ${formattedPrimary}`.trim();
  }

  if (!formattedPrimary) {
    return `- ${secondary}`;
  }

  return `- ${formattedPrimary}: ${secondary}`;
}

function buildSectionSnippet(markdown: string, plainText: string): string {
  const firstContentLine = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !line.startsWith("#"));

  if (firstContentLine) {
    const contentLine = firstContentLine.replace(/^[-*+]\s+/, "");
    const summary = markdownToPlainText(contentLine);
    if (summary) {
      return summarizeText(summary, 120);
    }
  }

  return summarizeText(plainText, 120);
}

function summarizeText(value: string, limit = 160): string {
  if (!value) {
    return "";
  }

  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 1).trimEnd()}…`;
}

function summarizeCode(value: string): string {
  const firstLine = value.split(/\r?\n/).find((line) => line.trim().length > 0);
  return firstLine ? summarizeText(firstLine.trim(), 100) : "";
}

function summarizeSnippetPreview(
  code: string,
  description?: string,
  language?: string,
): string {
  const base = language === "bash" ? stripShellPrompts(code) : code.trim();
  const previewBase = summarizeCode(base);

  if (!description) {
    return previewBase;
  }

  const summary = summarizeText(
    `${previewBase}: ${markdownToPlainText(description)}`,
    100,
  );
  return summary || previewBase;
}

function cleanHeading(heading: string): string {
  return heading.replace(INLINE_ANNOTATION_RE, "").replace(/\s+/g, " ").trim();
}

function getInlineSnippetSource(
  line: string,
): Exclude<ReferenceSnippetSource, "code-fence"> | undefined {
  const trimmed = line.trim();

  if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
    return "table-inline";
  }

  if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
    return "list-inline";
  }

  return undefined;
}

function inferInlineSnippetLanguage(
  code: string,
  description?: string,
): string | undefined {
  const normalizedCode = code.replace(/\s+/g, " ").trim();

  if (!normalizedCode || looksLikeKeyboardShortcut(normalizedCode)) {
    return undefined;
  }

  if (/^\s*[$#>]\s+/.test(normalizedCode)) {
    return "bash";
  }

  if (
    /[|&;<>(){}[\]]/.test(normalizedCode) ||
    normalizedCode.includes("--") ||
    normalizedCode.includes("/") ||
    normalizedCode.includes("=") ||
    /^[a-z0-9._-]+(?:\s+.+)?$/.test(normalizedCode)
  ) {
    return "bash";
  }

  if (
    description &&
    /\b(flag|option|command|install|run|build|deploy|copy|open)\b/i.test(
      description,
    )
  ) {
    return "bash";
  }

  return undefined;
}

function looksLikeKeyboardShortcut(code: string): boolean {
  const normalized = code.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  if (/^[A-Z]$/.test(normalized) || /^F\d{1,2}$/i.test(normalized)) {
    return true;
  }

  const tokens = normalized.split(/\s+/);
  const shortcutWords = new Set([
    "ctrl",
    "cmd",
    "alt",
    "opt",
    "shift",
    "fn",
    "tab",
    "enter",
    "return",
    "space",
    "esc",
    "escape",
    "home",
    "end",
    "pgup",
    "pgdn",
    "up/down",
    "arrows",
    "backspace",
    "del",
    "delete",
    "ins",
    "insert",
    "capslock",
    "arrow",
    "left",
    "right",
    "up",
    "down",
  ]);

  return (
    tokens.length > 0 &&
    tokens.every(
      (token) =>
        shortcutWords.has(token.toLowerCase()) ||
        /^[a-z]$/i.test(token) ||
        /^\d+$/.test(token) ||
        /^f\d{1,2}$/i.test(token) ||
        /^[^a-z0-9]+$/i.test(token) ||
        /^\(.*\)$/.test(token),
    )
  );
}

function normalizeSnippetKey(code: string): string {
  return code.replace(/\s+/g, " ").trim().toLowerCase();
}

function getSectionKey(title: string, parents: string[]): string {
  return `${parents.join(" / ")}::${title}`.toLowerCase();
}

function buildSnippetDedupeKey(
  snippet: Omit<ReferenceSnippetRecord, "id">,
): string {
  return [
    snippet.referenceId,
    snippet.sectionId ?? "",
    snippet.source,
    normalizeSnippetKey(snippet.plainCode),
    normalizeSnippetKey(snippet.description ?? ""),
  ].join("::");
}

function extractTableSnippets(input: {
  referenceId: string;
  markdown: string;
  sectionIdByKey: Map<string, string>;
}): {
  snippets: Array<Omit<ReferenceSnippetRecord, "id">>;
  sectionKeysWithTables: Set<string>;
} {
  const lines = input.markdown.split(/\r?\n/);
  const headingStack: Array<{ level: number; title: string }> = [];
  const snippets: Array<Omit<ReferenceSnippetRecord, "id">> = [];
  const sectionKeysWithTables = new Set<string>();

  let isInsideCodeFence = false;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim().startsWith("```")) {
      isInsideCodeFence = !isInsideCodeFence;
      index += 1;
      continue;
    }

    if (!isInsideCodeFence) {
      const headingMatch = HEADING_RE.exec(line.trim());
      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = cleanHeading(headingMatch[2]);

        while (
          headingStack.length > 0 &&
          headingStack[headingStack.length - 1].level >= level
        ) {
          headingStack.pop();
        }

        headingStack.push({ level, title });
        index += 1;
        continue;
      }

      const tableBlock = readMarkdownTableBlock(lines, index);
      if (tableBlock) {
        const currentHeading = headingStack[headingStack.length - 1];
        if (currentHeading) {
          const parents = headingStack
            .slice(0, -1)
            .map((heading) => heading.title);
          const sectionTitle = currentHeading.title;
          const sectionKey = getSectionKey(sectionTitle, parents);
          const sectionId = input.sectionIdByKey.get(sectionKey);

          sectionKeysWithTables.add(sectionKey);

          for (const row of tableBlock.table.rows) {
            const snippet = buildTableRowSnippet({
              referenceId: input.referenceId,
              sectionId,
              headers: tableBlock.table.headers,
              row,
            });

            if (snippet) {
              snippets.push(snippet);
            }
          }
        }

        index = tableBlock.nextIndex;
        continue;
      }
    }

    index += 1;
  }

  return { snippets, sectionKeysWithTables };
}

function buildTableRowSnippet(input: {
  referenceId: string;
  sectionId?: string;
  headers: string[];
  row: string[];
}): Omit<ReferenceSnippetRecord, "id"> | undefined {
  const [label = "", ...rest] = input.row;
  const code = stripMarkdownFormatting(label);

  if (!code) {
    return undefined;
  }

  const description =
    rest.length <= 1
      ? rest[0]?.trim()
      : rest
          .map((cell, index) => {
            const header = input.headers[index + 1] ?? `Column ${index + 2}`;
            const text = cell.trim();
            return text ? `${header}: ${text}` : undefined;
          })
          .filter((value): value is string => Boolean(value))
          .join(" · ");

  return buildSnippetRecord({
    referenceId: input.referenceId,
    sectionId: input.sectionId,
    source: "table-inline",
    language: inferInlineSnippetLanguage(code, description),
    code,
    description,
    preview: summarizeText(
      description ? `${code}: ${markdownToPlainText(description)}` : code,
      100,
    ),
  });
}

function stripMarkdownFormatting(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeRenderedTableRow(line: string): boolean {
  const trimmed = line.trim();
  return /^[-*+]\s+.+?:\s+.+$/.test(trimmed) && /`[^`]+`/.test(trimmed);
}
