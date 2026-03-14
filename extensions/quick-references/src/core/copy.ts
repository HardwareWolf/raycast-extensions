import { ReferenceSnippetRecord } from "../types";

export type CommandCopyMode = "strip-prompts" | "preserve";

const SHELL_LANGUAGES = new Set([
  "bash",
  "console",
  "shell",
  "sh",
  "terminal",
  "zsh",
]);

export function isShellSnippet(language?: string, code?: string): boolean {
  const normalizedLanguage = language?.trim().toLowerCase();
  if (normalizedLanguage && SHELL_LANGUAGES.has(normalizedLanguage)) {
    return true;
  }

  if (!code) {
    return false;
  }

  return /^\s*[$#>]\s+/.test(code) || /(?:^|\n)\s*[$#>]\s+/.test(code);
}

export function stripShellPrompts(code: string): string {
  return code
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[$#>]\s?/, ""))
    .join("\n")
    .trim();
}

export function getSnippetCopyContent(
  snippet: ReferenceSnippetRecord,
  mode: CommandCopyMode,
): string {
  if (
    mode === "strip-prompts" &&
    isShellSnippet(snippet.language, snippet.code)
  ) {
    return stripShellPrompts(snippet.code);
  }

  return snippet.code.trim();
}

export function buildSnippetMarkdown(
  snippet: Pick<ReferenceSnippetRecord, "language" | "code" | "description">,
): string {
  const fenceLanguage = snippet.language ? snippet.language : "text";
  const fencedCode = `\`\`\`${fenceLanguage}\n${snippet.code.trim()}\n\`\`\``;
  const description = snippet.description?.trim();

  if (!description) {
    return fencedCode;
  }

  return `${fencedCode}\n\n${description}`;
}
