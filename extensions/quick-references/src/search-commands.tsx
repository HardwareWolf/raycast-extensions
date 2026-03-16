import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  Toast,
  showToast,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CommandCopyMode,
  getSnippetCopyContent,
  isShellSnippet,
} from "./core/copy";
import {
  GlobalCommandSearcher,
  GlobalSearchFilter,
  GlobalSearchResult,
} from "./core/global-search";
import { getExtensionPreferences } from "./core/preferences";
import { DatasetRepository } from "./core/dataset-repository";
import { PreferenceStore } from "./core/store";
import { ReferenceUpdater } from "./services/updater";
import {
  Dataset,
  ReferenceIndexItem,
  ReferenceSectionRecord,
  ReferenceSnippetRecord,
} from "./types";
import { ReferenceActionPanel } from "./components/reference-actions";
import { ReferenceLoader } from "./components/reference-loader";
import { buildSnippetMarkdown } from "./core/copy";

const datasetRepository = new DatasetRepository();
const preferenceStore = new PreferenceStore();
const updater = new ReferenceUpdater(datasetRepository);

function isDatasetStale(
  generatedAt: string,
  autoUpdateIntervalDays?: number,
): boolean {
  if (!autoUpdateIntervalDays) {
    return false;
  }

  const generated = new Date(generatedAt).getTime();
  if (isNaN(generated)) {
    return false;
  }

  return Date.now() - generated > autoUpdateIntervalDays * 24 * 60 * 60 * 1000;
}

export default function Command() {
  const { autoUpdateIntervalDays, defaultCopyMode } = getExtensionPreferences();
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<GlobalSearchFilter>("all");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recents, setRecents] = useState<string[]>([]);
  const [data, setData] = useState<
    | {
        meta: Dataset["meta"];
        index: ReferenceIndexItem[];
        sections: ReferenceSectionRecord[];
        snippets: ReferenceSnippetRecord[];
      }
    | undefined
  >(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const autoUpdateTriggered = useRef(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      let dataset = await datasetRepository.loadCommandSearchData();

      if (!dataset) {
        const toast = await showToast({
          style: Toast.Style.Animated,
          title: "Downloading references...",
          message: "No local dataset was found",
        });

        try {
          const updated = await updater.update();
          dataset = {
            meta: updated.meta,
            index: updated.index,
            sections: updated.sections,
            snippets: updated.snippets,
          };
          toast.style = Toast.Style.Success;
          toast.title = "References downloaded";
          toast.message = `${updated.meta.total} references ready`;
        } catch (downloadError) {
          toast.style = Toast.Style.Failure;
          toast.title = "Download failed";
          toast.message =
            downloadError instanceof Error
              ? downloadError.message
              : "Unknown error";
          return;
        }
      }

      const [savedFavorites, savedRecents] = await Promise.all([
        preferenceStore.getFavorites(),
        preferenceStore.getRecents(),
      ]);
      setFavorites(savedFavorites);
      setRecents(savedRecents);
      setData(dataset);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to load command index",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!data || autoUpdateTriggered.current) {
      return;
    }

    if (!isDatasetStale(data.meta.generatedAt, autoUpdateIntervalDays)) {
      return;
    }

    autoUpdateTriggered.current = true;
    updater
      .update()
      .then((updated) => {
        showToast({
          style: Toast.Style.Success,
          title: "References auto-updated",
          message: `${updated.meta.snippetsTotal} indexed commands`,
        });
        setData(updated);
      })
      .catch(() => {
        // Cached data remains usable if background update fails.
      });
  }, [data, autoUpdateIntervalDays]);

  const handleToggleFavorite = async (id: string) => {
    const isNowFavorite = await preferenceStore.toggleFavorite(id);
    setFavorites((current) => {
      const next = new Set(current);
      if (isNowFavorite) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
    await showToast({
      style: Toast.Style.Success,
      title: isNowFavorite ? "Added to favorites" : "Removed from favorites",
    });
  };

  const handleOpenReference = async (id: string) => {
    await preferenceStore.addRecent(id);
    setRecents(await preferenceStore.getRecents());
  };

  const handleUpdate = async () => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Updating references...",
    });

    try {
      const updated = await updater.update();
      toast.style = Toast.Style.Success;
      toast.title = "References updated";
      toast.message = `${updated.meta.snippetsTotal} indexed commands`;
      setData({
        meta: updated.meta,
        index: updated.index,
        sections: updated.sections,
        snippets: updated.snippets,
      });
    } catch (updateError) {
      toast.style = Toast.Style.Failure;
      toast.title = "Update failed";
      toast.message =
        updateError instanceof Error ? updateError.message : "Unknown error";
    }
  };

  const index = data?.index ?? [];
  const sectionById = useMemo(
    () =>
      new Map((data?.sections ?? []).map((section) => [section.id, section])),
    [data?.sections],
  );
  const snippetsBySectionId = useMemo(() => {
    const next = new Map<string, ReferenceSnippetRecord[]>();
    for (const snippet of data?.snippets ?? []) {
      if (!snippet.sectionId) {
        continue;
      }

      const bucket = next.get(snippet.sectionId) ?? [];
      bucket.push(snippet);
      next.set(snippet.sectionId, bucket);
    }
    return next;
  }, [data?.snippets]);

  const searcher = useMemo(
    () => (data ? new GlobalCommandSearcher(data) : undefined),
    [data],
  );
  const results = useMemo(
    () =>
      searcher && query.trim() ? searcher.search(query, resultFilter) : [],
    [query, resultFilter, searcher],
  );

  const favoriteItems = useMemo(
    () => index.filter((item) => favorites.has(item.id)).slice(0, 5),
    [favorites, index],
  );
  const recentItems = useMemo(
    () =>
      recents
        .filter((id) => !favorites.has(id))
        .map((id) => index.find((item) => item.id === id))
        .filter((item): item is ReferenceIndexItem => item !== undefined)
        .slice(0, 5),
    [favorites, index, recents],
  );

  const snippetResults = useMemo(
    () => results.filter((result) => result.kind === "snippet"),
    [results],
  );
  const sectionResults = useMemo(
    () => results.filter((result) => result.kind === "section"),
    [results],
  );
  const referenceResults = useMemo(
    () => results.filter((result) => result.kind === "reference"),
    [results],
  );

  const buildReferenceTargets = (
    reference: ReferenceIndexItem,
    isFavorite: boolean,
  ) => {
    const browserTarget = (
      <ReferenceLoader
        entry={reference}
        mode="browser"
        isFavorite={isFavorite}
        onToggleFavorite={() => handleToggleFavorite(reference.id)}
        onUpdate={handleUpdate}
      />
    );
    const fullReferenceTarget = (
      <ReferenceLoader
        entry={reference}
        mode="detail"
        isFavorite={isFavorite}
        onToggleFavorite={() => handleToggleFavorite(reference.id)}
        onUpdate={handleUpdate}
      />
    );

    return {
      browserTarget,
      fullReferenceTarget,
    };
  };

  const renderReferenceItem = (
    reference: ReferenceIndexItem,
    isFavorite: boolean,
    subtitle?: string,
  ) => {
    const { browserTarget, fullReferenceTarget } = buildReferenceTargets(
      reference,
      isFavorite,
    );

    return (
      <List.Item
        key={reference.id}
        icon={
          isFavorite
            ? { source: Icon.Star, tintColor: Color.Yellow }
            : Icon.Document
        }
        title={reference.title}
        subtitle={subtitle ?? reference.summary}
        accessories={buildReferenceAccessories(
          reference,
          reference.snippetCount,
        )}
        detail={
          <List.Item.Detail
            markdown={`# ${reference.title}\n\n${reference.summary}`}
            metadata={
              <List.Item.Detail.Metadata>
                <List.Item.Detail.Metadata.Label
                  title="Category"
                  text={reference.category}
                />
                <List.Item.Detail.Metadata.Label
                  title="Sections"
                  text={String(reference.sectionCount)}
                />
                <List.Item.Detail.Metadata.Label
                  title="Commands"
                  text={String(reference.snippetCount)}
                />
                <List.Item.Detail.Metadata.Link
                  title="GitHub"
                  text="Open file"
                  target={reference.link}
                />
              </List.Item.Detail.Metadata>
            }
          />
        }
        actions={
          <ReferenceActionPanel
            entry={reference}
            isFavorite={isFavorite}
            onToggleFavorite={() => handleToggleFavorite(reference.id)}
            onUpdate={handleUpdate}
            openActions={[
              {
                title: "Open Parent Reference",
                target: browserTarget,
                onOpen: () => handleOpenReference(reference.id),
                icon: Icon.List,
              },
              {
                title: "Open Full Reference",
                target: fullReferenceTarget,
                onOpen: () => handleOpenReference(reference.id),
                icon: Icon.Sidebar,
              },
            ]}
          />
        }
      />
    );
  };

  const renderResultItem = (result: GlobalSearchResult) => {
    const reference = result.reference;
    const isFavorite = favorites.has(reference.id);
    const { browserTarget, fullReferenceTarget } = buildReferenceTargets(
      reference,
      isFavorite,
    );

    if (result.kind === "reference") {
      return renderReferenceItem(reference, isFavorite, reference.summary);
    }

    if (result.kind === "section" && result.section) {
      const section = result.section;
      const sectionSnippets = snippetsBySectionId.get(section.id) ?? [];
      const primarySnippet = sectionSnippets[0];

      return (
        <List.Item
          key={section.id}
          icon={Icon.BulletPoints}
          title={section.title}
          subtitle={reference.title}
          accessories={buildSectionAccessories(
            section,
            reference.category,
            sectionSnippets.length,
          )}
          detail={
            <List.Item.Detail
              markdown={section.markdown}
              metadata={
                <List.Item.Detail.Metadata>
                  <List.Item.Detail.Metadata.Label
                    title="Reference"
                    text={reference.title}
                  />
                  <List.Item.Detail.Metadata.Label
                    title="Category"
                    text={reference.category}
                  />
                  <List.Item.Detail.Metadata.Label
                    title="Commands"
                    text={String(sectionSnippets.length)}
                  />
                  <List.Item.Detail.Metadata.Link
                    title="GitHub"
                    text="Open file"
                    target={reference.link}
                  />
                </List.Item.Detail.Metadata>
              }
            />
          }
          actions={
            <ReferenceActionPanel
              entry={reference}
              isFavorite={isFavorite}
              onToggleFavorite={() => handleToggleFavorite(reference.id)}
              onUpdate={handleUpdate}
              openActions={[
                {
                  title: "Open Parent Reference",
                  target: browserTarget,
                  onOpen: () => handleOpenReference(reference.id),
                  icon: Icon.List,
                },
                {
                  title: "Open Full Reference",
                  target: fullReferenceTarget,
                  onOpen: () => handleOpenReference(reference.id),
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
    }

    if (result.kind === "snippet" && result.snippet) {
      const snippet = result.snippet;
      const parentSection = snippet.sectionId
        ? sectionById.get(snippet.sectionId)
        : undefined;

      return (
        <List.Item
          key={snippet.id}
          icon={Icon.Terminal}
          title={snippet.preview}
          subtitle={reference.title}
          accessories={buildSnippetAccessories(snippet)}
          detail={
            <List.Item.Detail
              markdown={buildSnippetDetailMarkdown(snippet, parentSection)}
              metadata={
                <List.Item.Detail.Metadata>
                  <List.Item.Detail.Metadata.Label
                    title="Reference"
                    text={reference.title}
                  />
                  {parentSection && (
                    <List.Item.Detail.Metadata.Label
                      title="Section"
                      text={
                        parentSection.parents.length > 0
                          ? `${parentSection.parents.join(" / ")} / ${parentSection.title}`
                          : parentSection.title
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
                    target={reference.link}
                  />
                </List.Item.Detail.Metadata>
              }
            />
          }
          actions={
            <ReferenceActionPanel
              entry={reference}
              isFavorite={isFavorite}
              onToggleFavorite={() => handleToggleFavorite(reference.id)}
              onUpdate={handleUpdate}
              openActions={[
                {
                  title: "Open Parent Reference",
                  target: browserTarget,
                  onOpen: () => handleOpenReference(reference.id),
                  icon: Icon.List,
                },
                {
                  title: "Open Full Reference",
                  target: fullReferenceTarget,
                  onOpen: () => handleOpenReference(reference.id),
                  icon: Icon.Sidebar,
                },
              ]}
              copyActions={[
                {
                  title: "Copy Command",
                  content: getSnippetCopyContent(snippet, defaultCopyMode),
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
    }

    return null;
  };

  if (!isLoading && !data) {
    return (
      <List>
        <List.EmptyView
          title="Failed to load command index"
          description="Try reloading or update the references manually"
          actions={
            <ActionPanel>
              <Action
                title="Retry"
                icon={Icon.ArrowClockwise}
                onAction={loadData}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Search commands, flags, or keywords"
      searchText={query}
      onSearchTextChange={setQuery}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter Result Type"
          value={resultFilter}
          onChange={(value) => setResultFilter(value as GlobalSearchFilter)}
        >
          <List.Dropdown.Item title="All Results" value="all" />
          <List.Dropdown.Item title="Commands" value="snippets" />
          <List.Dropdown.Item title="Sections" value="sections" />
          <List.Dropdown.Item title="References" value="references" />
        </List.Dropdown>
      }
      throttle
      enableFiltering={false}
    >
      {!query.trim() && favoriteItems.length > 0 && (
        <List.Section title="Favorite References">
          {favoriteItems.map((item) => renderReferenceItem(item, true))}
        </List.Section>
      )}

      {!query.trim() && recentItems.length > 0 && (
        <List.Section title="Recent References">
          {recentItems.map((item) =>
            renderReferenceItem(item, favorites.has(item.id)),
          )}
        </List.Section>
      )}

      {!query.trim() &&
        favoriteItems.length === 0 &&
        recentItems.length === 0 &&
        !isLoading && (
          <List.EmptyView
            icon={Icon.Terminal}
            title="Search commands across all references"
            description="Try a command like `git restore --staged` or `docker ps -a`"
          />
        )}

      {query.trim() && snippetResults.length > 0 && (
        <List.Section title="Commands" subtitle={`${snippetResults.length}`}>
          {snippetResults.map((result) => renderResultItem(result))}
        </List.Section>
      )}

      {query.trim() && sectionResults.length > 0 && (
        <List.Section title="Sections" subtitle={`${sectionResults.length}`}>
          {sectionResults.map((result) => renderResultItem(result))}
        </List.Section>
      )}

      {query.trim() && referenceResults.length > 0 && (
        <List.Section
          title="References"
          subtitle={`${referenceResults.length}`}
        >
          {referenceResults.map((result) => renderResultItem(result))}
        </List.Section>
      )}

      {query.trim() &&
        snippetResults.length === 0 &&
        sectionResults.length === 0 &&
        referenceResults.length === 0 &&
        !isLoading && (
          <List.EmptyView
            icon={Icon.MagnifyingGlass}
            title="No matches"
            description="Try a different command, heading, or keyword"
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

function buildReferenceAccessories(
  reference: ReferenceIndexItem,
  snippetCount: number,
): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [
    {
      tag: {
        value: reference.category,
        color: Color.SecondaryText,
      },
    },
  ];

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
