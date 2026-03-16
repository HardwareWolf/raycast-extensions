import { describe, expect, it } from "vitest";
import {
  getSnippetCopyContent,
  isShellSnippet,
  stripShellPrompts,
} from "./copy";
import { ReferenceSnippetRecord } from "../types";

const shellSnippet: ReferenceSnippetRecord = {
  id: "git#snippet-1",
  referenceId: "git",
  sectionId: "git#section-1",
  source: "code-fence",
  language: "bash",
  code: "$ git status\n$ git add .",
  plainCode: "git status\ngit add .",
  preview: "git status",
};

describe("copy", () => {
  it("detects shell snippets", () => {
    expect(isShellSnippet(shellSnippet.language, shellSnippet.code)).toBe(true);
  });

  it("strips shell prompts safely", () => {
    expect(stripShellPrompts(shellSnippet.code)).toBe("git status\ngit add .");
  });

  it("returns copy content based on the requested mode", () => {
    expect(getSnippetCopyContent(shellSnippet, "strip-prompts")).toBe(
      "git status\ngit add .",
    );
    expect(getSnippetCopyContent(shellSnippet, "preserve")).toBe(
      "$ git status\n$ git add .",
    );
  });
});
