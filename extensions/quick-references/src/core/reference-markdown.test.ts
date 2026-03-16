import { describe, expect, it } from "vitest";
import {
  extractReferenceSections,
  extractReferenceSnippets,
  processReferenceMarkdown,
} from "./reference-markdown";

const mixedMarkdown = `
## Getting Started {.cols-2}

### Commands

\`\`\`shell script
$ git restore --staged package.json
\`\`\`

| Example | Description |
| --- | --- |
| \`docker ps -a\` | List all containers |

- \`npm run build\`
`;

const shortcutMarkdown = `
## Keyboard Shortcuts

### View images {.row-span-2}

| Shortcut             | Action                      |
| -------------------- | --------------------------- |
| \`Ctrl\` \`Tab\`         | Cycle through open documents |
| \`Ctrl\` \`Shift\` \`W\` | Close current document       |
| \`\\\`                | Toggle layer mask            |

{.shortcuts}
`;

describe("reference-markdown", () => {
  it("renders shortcut tables into readable bullet lists", () => {
    const processed = processReferenceMarkdown(shortcutMarkdown);

    expect(processed).toContain("- `Ctrl` `Tab`: Cycle through open documents");
    expect(processed).not.toContain("```text");
    expect(processed).not.toContain("{.shortcuts}");
  });

  it("extracts commands from code fences, lists, and tables", () => {
    const sourceMarkdown = processReferenceMarkdown(mixedMarkdown, {
      tableMode: "preserve",
    });
    const sections = extractReferenceSections({
      referenceId: "git",
      markdown: sourceMarkdown,
    });
    const snippets = extractReferenceSnippets({
      referenceId: "git",
      sections,
      sourceMarkdown,
    });

    expect(sections.map((section) => section.title)).toEqual(["Commands"]);
    expect(
      snippets.some((snippet) =>
        snippet.plainCode.includes("git restore --staged"),
      ),
    ).toBe(true);
    expect(
      snippets.some((snippet) => snippet.plainCode.includes("docker ps -a")),
    ).toBe(true);
    expect(
      snippets.some((snippet) => snippet.plainCode.includes("npm run build")),
    ).toBe(true);
  });

  it("extracts individual shortcut rows without classifying them as shell", () => {
    const sourceMarkdown = processReferenceMarkdown(shortcutMarkdown, {
      tableMode: "preserve",
    });
    const sections = extractReferenceSections({
      referenceId: "photoshop",
      markdown: sourceMarkdown,
    });
    const snippets = extractReferenceSnippets({
      referenceId: "photoshop",
      sections,
      sourceMarkdown,
    });

    expect(sections[0]?.snippet).toContain(
      "Ctrl Tab: Cycle through open documents",
    );
    expect(snippets).toHaveLength(3);
    expect(snippets[0]?.plainCode).toBe("Ctrl Tab");
    expect(snippets[0]?.description).toBe("Cycle through open documents");
    expect(snippets[0]?.preview).toContain("Ctrl Tab");
    expect(snippets[0]?.language).toBeUndefined();
    expect(snippets[1]?.plainCode).toBe("Ctrl Shift W");
    expect(snippets[2]?.plainCode).toBe("\\");
  });
});
