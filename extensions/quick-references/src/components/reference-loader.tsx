import { Action, ActionPanel, Detail, Icon } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { DatasetRepository } from "../core/dataset-repository";
import { ReferenceDetailRecord, ReferenceIndexItem } from "../types";
import { ReferenceBrowser } from "./reference-browser";
import { ReferenceDetail } from "./reference-detail";

const datasetRepository = new DatasetRepository();

interface ReferenceLoaderProps {
  entry: ReferenceIndexItem;
  mode: "browser" | "detail";
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onUpdate?: () => void;
}

export function ReferenceLoader({
  entry,
  mode,
  isFavorite,
  onToggleFavorite,
  onUpdate,
}: ReferenceLoaderProps) {
  const [detail, setDetail] = useState<ReferenceDetailRecord | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      const nextDetail = await datasetRepository.loadReferenceDetail(entry.id);
      if (!nextDetail) {
        setError("Reference data is not available yet.");
        return;
      }

      setDetail(nextDetail);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unknown error",
      );
    } finally {
      setIsLoading(false);
    }
  }, [entry.id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  if (error && !detail) {
    return (
      <Detail
        navigationTitle={entry.title}
        markdown={`# Failed to Load Reference\n\n${error}`}
        actions={
          <ActionPanel>
            <Action
              title="Retry"
              icon={Icon.ArrowClockwise}
              onAction={loadDetail}
            />
          </ActionPanel>
        }
      />
    );
  }

  if (isLoading || !detail) {
    return (
      <Detail
        isLoading={isLoading}
        navigationTitle={entry.title}
        markdown={`# ${entry.title}\n\nLoading reference data...`}
        actions={
          <ActionPanel>
            <Action
              title="Retry"
              icon={Icon.ArrowClockwise}
              onAction={loadDetail}
            />
          </ActionPanel>
        }
      />
    );
  }

  if (mode === "detail") {
    return (
      <ReferenceDetail
        entry={entry}
        markdown={detail.content}
        sectionCount={detail.sections.length}
        snippetCount={detail.snippets.length}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        onUpdate={onUpdate}
      />
    );
  }

  return (
    <ReferenceBrowser
      entry={entry}
      markdown={detail.content}
      sections={detail.sections}
      snippets={detail.snippets}
      isFavorite={isFavorite}
      onToggleFavorite={onToggleFavorite}
      onUpdate={onUpdate}
    />
  );
}
