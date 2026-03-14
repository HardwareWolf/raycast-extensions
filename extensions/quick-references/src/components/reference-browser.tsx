import { Action, Color, Icon, List } from "@raycast/api";
import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import {
  CommandCopyMode,
  buildSnippetMarkdown,
  getSnippetCopyContent,
  isShellSnippet,
} from "../core/copy";
import { getExtensionPreferences } from "../core/preferences";
import { normalizeSearchQuery } from "../core/query";
import { processReferenceMarkdown } from "../core/reference-markdown";
import {
  ReferenceIndexItem,
  ReferenceSectionRecord,
  ReferenceSnippetRecord,
} from "../types";
import { ReferenceActionPanel } from "./reference-actions";
import { ReferenceDetail } from "./reference-detail";

interface ReferenceBrowserProps {
  entry: ReferenceIndexItem;
  markdown: string;
  sections: ReferenceSectionRecord[];
  snippets: ReferenceSnippetRecord[];
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onUpdate?: () => void;
}

export function ReferenceBrowser({
  entry,
  markdown,
  sections,
  snippets,
  isFavorite,
  onToggleFavorite,
  onUpdate,
}: ReferenceBrowserProps) {
  const [query, setQuery] = useState("");
  const { defaultCopyMode } = getExtensionPreferences();

  const processedMarkdown = useMemo(
    () => processReferenceMarkdown(markdown),
    [markdown],
  );

  const sectionById = useMemo(
    () => new Map(sections.map((section) => [section.id, section])),
    [sections],
  );
  const sectionSnippetsById = useMemo(() => {
    const next = new Map<string, ReferenceSnippetRecord[]>();
    for (const snippet of snippets) {
      if (!snippet.sectionId) {
        continue;
      }

      const bucket = next.get(snippet.sectionId) ?? [];
      bucket.push(snippet);
      next.set(snippet.sectionId, bucket);
    }
    return next;
  }, [snippets]);

  const normalizedQuery = normalizeSearchQuery(query);

  const sectionSearcher = useMemo(
    () =>
      new Fuse(sections, {
        keys: [
          { name: "title", weight: 0.45 },
          { name: "parents", weight: 0.2 },
          { name: "snippet", weight: 0.15 },
          { name: "plainText", weight: 0.2 },
        ],
        threshold: 0.35,
        includeScore: true,
        ignoreLocation: true,
      }),
    [sections],
  );

  const snippetSearcher = useMemo(
    () =>
      new Fuse(
        snippets.map((snippet) => {
          const parentSection = snippet.sectionId
            ? sectionById.get(snippet.sectionId)
            : undefined;

          return {
            snippet,
            plainCode: snippet.plainCode,
            description: snippet.description,
            preview: snippet.preview,
            sectionTitle: parentSection?.title ?? "",
            parents: parentSection?.parents ?? [],
          };
        }),
        {
          keys: [
            { name: "plainCode", weight: 0.45 },
            { name: "description", weight: 0.2 },
            { name: "preview", weight: 0.15 },
            { name: "sectionTitle", weight: 0.15 },
            { name: "parents", weight: 0.05 },
          ],
          threshold: 0.35,
          includeScore: true,
          ignoreLocation: true,
        },
      ),
    [sectionById, snippets],
  );

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) {
      return sections;
    }

    return sectionSearcher.search(normalizedQuery).map((match) => match.item);
  }, [normalizedQuery, sectionSearcher, sections]);

  const filteredSnippets = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return snippetSearcher
      .search(normalizedQuery)
      .map((match) => match.item.snippet);
  }, [normalizedQuery, snippetSearcher]);

  const fullReferenceTarget = (
    <ReferenceDetail
      entry={entry}
      markdown={processedMarkdown}
      sectionCount={sections.length}
      snippetCount={snippets.length}
      isFavorite={isFavorite}
      onToggleFavorite={onToggleFavorite}
      onUpdate={onUpdate}
    />
  );

  return (
    <List
      navigationTitle={entry.title}
      isShowingDetail
      searchBarPlaceholder={`Search inside ${entry.title}`}
      searchText={query}
      onSearchTextChange={setQuery}
      throttle
      enableFiltering={false}
    >
      {!normalizedQuery && (
        <List.Item
          id="full-reference"
          icon={Icon.Document}
          title="Full Reference"
          subtitle={buildFullReferenceSubtitle(
            sections.length,
            snippets.length,
          )}
          detail={
            <List.Item.Detail
              markdown={processedMarkdown}
              metadata={buildFullMetadata(
                entry,
                sections.length,
                snippets.length,
              )}
            />
          }
          actions={
            <ReferenceActionPanel
              entry={entry}
              isFavorite={isFavorite}
              onToggleFavorite={onToggleFavorite}
              onUpdate={onUpdate}
              openActions={[
                {
                  title: "Open Full Reference",
                  target: fullReferenceTarget,
                  icon: Icon.Sidebar,
                },
              ]}
              copyActions={[
                {
                  title: "Copy Reference Content",
                  content: processedMarkdown,
                },
              ]}
            />
          }
        />
      )}

      {normalizedQuery && filteredSnippets.length > 0 && (
        <List.Section
          title="Matching Commands"
          subtitle={`${filteredSnippets.length}`}
        >
          {filteredSnippets.map((snippet) => {
            const parentSection = snippet.sectionId
              ? sectionById.get(snippet.sectionId)
              : undefined;

            return (
              <List.Item
                key={snippet.id}
                icon={Icon.Terminal}
                title={snippet.preview}
                subtitle={parentSection?.title ?? entry.title}
                accessories={buildSnippetAccessories(snippet)}
                detail={
                  <List.Item.Detail
                    markdown={buildSnippetDetailMarkdown(
                      snippet,
                      parentSection,
                    )}
                    metadata={buildSnippetMetadata(
                      entry,
                      snippet,
                      parentSection,
                    )}
                  />
                }
                actions={
                  <ReferenceActionPanel
                    entry={entry}
                    isFavorite={isFavorite}
                    onToggleFavorite={onToggleFavorite}
                    onUpdate={onUpdate}
                    openActions={[
                      {
                        title: "Open Full Reference",
                        target: fullReferenceTarget,
                        icon: Icon.Sidebar,
                      },
                    ]}
                    copyActions={[
                      {
                        title: "Copy Command",
                        content: getSnippetCopyContent(
                          snippet,
                          defaultCopyMode,
                        ),
                      },
                      ...(parentSection
                        ? [
                            {
                              title: "Copy Section Content",
                              content: parentSection.markdown,
                            },
                          ]
                        : []),
                    ]}
                    extraActions={
                      <SnippetCopyAlternates
                        snippet={snippet}
                        defaultCopyMode={defaultCopyMode}
                      />
                    }
                  />
                }
              />
            );
          })}
        </List.Section>
      )}

      {filteredSections.length > 0 && (
        <List.Section
          title={normalizedQuery ? "Matching Sections" : "Sections"}
          subtitle={`${filteredSections.length}`}
        >
          {filteredSections.map((section) => {
            const sectionSnippets = sectionSnippetsById.get(section.id) ?? [];
            const primarySnippet = sectionSnippets[0];

            return (
              <List.Item
                key={section.id}
                icon={Icon.BulletPoints}
                title={section.title}
                subtitle={section.snippet}
                accessories={buildSectionAccessories(
                  section,
                  entry.category,
                  sectionSnippets.length,
                )}
                detail={
                  <List.Item.Detail
                    markdown={section.markdown}
                    metadata={buildSectionMetadata(
                      entry,
                      section,
                      sectionSnippets.length,
                    )}
                  />
                }
                actions={
                  <ReferenceActionPanel
                    entry={entry}
                    isFavorite={isFavorite}
                    onToggleFavorite={onToggleFavorite}
                    onUpdate={onUpdate}
                    openActions={[
                      {
                        title: "Open Full Reference",
                        target: fullReferenceTarget,
                        icon: Icon.Sidebar,
                      },
                    ]}
                    copyActions={[
                      ...(primarySnippet
                        ? [
                            {
                              title: "Copy First Command",
                              content: getSnippetCopyContent(
                                primarySnippet,
                                defaultCopyMode,
                              ),
                            },
                          ]
                        : []),
                      {
                        title: "Copy Section Content",
                        content: section.markdown,
                      },
                    ]}
                    extraActions={
                      primarySnippet ? (
                        <SnippetCopyAlternates
                          snippet={primarySnippet}
                          defaultCopyMode={defaultCopyMode}
                          copyTitle="Copy First Command Without Prompt"
                          preserveTitle="Copy First Command With Prompt"
                        />
                      ) : undefined
                    }
                  />
                }
              />
            );
          })}
        </List.Section>
      )}

      {normalizedQuery &&
        filteredSnippets.length === 0 &&
        filteredSections.length === 0 && (
          <List.EmptyView
            icon={Icon.MagnifyingGlass}
            title="No matches inside this reference"
            description="Try a command, flag, heading, or keyword"
          />
        )}
    </List>
  );
}

function SnippetCopyAlternates({
  snippet,
  defaultCopyMode,
  copyTitle = "Copy Command Without Prompt",
  preserveTitle = "Copy Command With Prompt",
}: {
  snippet: ReferenceSnippetRecord;
  defaultCopyMode: CommandCopyMode;
  copyTitle?: string;
  preserveTitle?: string;
}) {
  if (!isShellSnippet(snippet.language, snippet.code)) {
    return null;
  }

  return defaultCopyMode === "strip-prompts" ? (
    <Action.CopyToClipboard
      title={preserveTitle}
      content={snippet.code.trim()}
    />
  ) : (
    <Action.CopyToClipboard
      title={copyTitle}
      content={getSnippetCopyContent(snippet, "strip-prompts")}
    />
  );
}

function buildFullReferenceSubtitle(
  sectionCount: number,
  snippetCount: number,
): string {
  return `${sectionCount} sections • ${snippetCount} commands`;
}

function buildSectionAccessories(
  section: ReferenceSectionRecord,
  referenceCategory: string,
  snippetCount: number,
): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [];
  const lastParent = section.parents[section.parents.length - 1];

  if (lastParent && lastParent !== referenceCategory) {
    accessories.push({
      tag: {
        value: lastParent,
        color: Color.SecondaryText,
      },
    });
  }

  if (snippetCount > 0) {
    accessories.push({
      tag: {
        value: `${snippetCount} cmd`,
        color: Color.Green,
      },
    });
  }

  return accessories;
}

function buildSnippetAccessories(
  snippet: ReferenceSnippetRecord,
): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [];

  if (snippet.language && snippet.language !== "text") {
    accessories.push({
      tag: {
        value: snippet.language,
        color: Color.Blue,
      },
    });
  }

  return accessories;
}

function buildFullMetadata(
  entry: ReferenceIndexItem,
  sectionCount: number,
  snippetCount: number,
) {
  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Category" text={entry.category} />
      <List.Item.Detail.Metadata.Label
        title="Sections"
        text={String(sectionCount)}
      />
      <List.Item.Detail.Metadata.Label
        title="Commands"
        text={String(snippetCount)}
      />
      <List.Item.Detail.Metadata.TagList title="Tags">
        {entry.tags.map((tag) => (
          <List.Item.Detail.Metadata.TagList.Item key={tag} text={tag} />
        ))}
      </List.Item.Detail.Metadata.TagList>
      <List.Item.Detail.Metadata.Link
        title="GitHub"
        text="Open file"
        target={entry.link}
      />
    </List.Item.Detail.Metadata>
  );
}

function buildSectionMetadata(
  entry: ReferenceIndexItem,
  section: ReferenceSectionRecord,
  snippetCount: number,
) {
  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Reference" text={entry.title} />
      <List.Item.Detail.Metadata.Label title="Category" text={entry.category} />
      <List.Item.Detail.Metadata.Label
        title="Commands"
        text={String(snippetCount)}
      />
      <List.Item.Detail.Metadata.Label
        title="Path"
        text={
          section.parents.length > 0
            ? `${section.parents.join(" / ")} / ${section.title}`
            : section.title
        }
      />
      <List.Item.Detail.Metadata.Link
        title="GitHub"
        text="Open file"
        target={entry.link}
      />
    </List.Item.Detail.Metadata>
  );
}

function buildSnippetMetadata(
  entry: ReferenceIndexItem,
  snippet: ReferenceSnippetRecord,
  section?: ReferenceSectionRecord,
) {
  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Reference" text={entry.title} />
      <List.Item.Detail.Metadata.Label title="Category" text={entry.category} />
      {section && (
        <List.Item.Detail.Metadata.Label
          title="Section"
          text={
            section.parents.length > 0
              ? `${section.parents.join(" / ")} / ${section.title}`
              : section.title
          }
        />
      )}
      {snippet.language && snippet.language !== "text" && (
        <List.Item.Detail.Metadata.Label
          title="Language"
          text={snippet.language}
        />
      )}
      {snippet.description && (
        <List.Item.Detail.Metadata.Label
          title="Description"
          text={snippet.description}
        />
      )}
      <List.Item.Detail.Metadata.Link
        title="GitHub"
        text="Open file"
        target={entry.link}
      />
    </List.Item.Detail.Metadata>
  );
}

function buildSnippetDetailMarkdown(
  snippet: ReferenceSnippetRecord,
  section?: ReferenceSectionRecord,
): string {
  const breadcrumb =
    section && section.parents.length > 0
      ? `_${section.parents.join(" / ")}_\n\n`
      : "";
  const heading = section ? `# ${section.title}\n\n` : "";
  return `${heading}${breadcrumb}${buildSnippetMarkdown(snippet)}`.trim();
}
