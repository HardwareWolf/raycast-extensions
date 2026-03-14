import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  LaunchType,
  launchCommand,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { DatasetRepository } from "./core/dataset-repository";
import { ReferenceUpdater } from "./services/updater";
import { Dataset, ReferenceIndexItem } from "./types";

const datasetRepository = new DatasetRepository();
const updater = new ReferenceUpdater(datasetRepository);

interface UpdateState {
  isLoading: boolean;
  error?: string;
  dataset?: {
    meta: Dataset["meta"];
    index: ReferenceIndexItem[];
  };
  didUpdate: boolean;
}

export default function Command() {
  const [state, setState] = useState<UpdateState>({
    isLoading: true,
    didUpdate: false,
  });

  useEffect(() => {
    void runUpdate();
  }, []);

  async function runUpdate() {
    const existing = await datasetRepository.loadReferenceIndex();
    setState({
      isLoading: true,
      dataset: existing,
      didUpdate: false,
    });

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Updating references...",
    });

    try {
      const dataset = await updater.update();
      toast.style = Toast.Style.Success;
      toast.title = "References updated";
      toast.message = `${dataset.meta.total} references • ${dataset.meta.snippetsTotal} commands`;
      setState({
        isLoading: false,
        dataset: {
          meta: dataset.meta,
          index: dataset.index,
        },
        didUpdate: true,
      });
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Update failed";
      toast.message = error instanceof Error ? error.message : "Unknown error";
      setState({
        isLoading: false,
        dataset: existing,
        error: error instanceof Error ? error.message : "Unknown error",
        didUpdate: false,
      });
    }
  }

  const markdown = buildMarkdown(state);

  return (
    <Detail
      isLoading={state.isLoading}
      navigationTitle="Update References"
      markdown={markdown}
      metadata={
        state.dataset ? (
          <Detail.Metadata>
            <Detail.Metadata.Label
              title="Status"
              text={
                state.error ? "Failed" : state.didUpdate ? "Updated" : "Ready"
              }
              icon={state.error ? Icon.XMarkCircle : Icon.CheckCircle}
            />
            <Detail.Metadata.Label
              title="References"
              text={String(state.dataset.meta.total)}
            />
            <Detail.Metadata.Label
              title="Sections"
              text={String(state.dataset.meta.sectionsTotal)}
            />
            <Detail.Metadata.Label
              title="Commands"
              text={String(state.dataset.meta.snippetsTotal)}
            />
            <Detail.Metadata.Label
              title="Generated"
              text={new Date(state.dataset.meta.generatedAt).toLocaleString()}
            />
            <Detail.Metadata.Label
              title="Source"
              text={state.dataset.meta.source}
            />
            <Detail.Metadata.Label
              title="Support Path"
              text={datasetRepository.getSupportDir()}
            />
          </Detail.Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
          <Action
            title="Retry Update"
            icon={Icon.ArrowClockwise}
            onAction={runUpdate}
          />
          <Action
            title="Open Search References"
            icon={Icon.Document}
            onAction={() =>
              launchCommand({
                name: "search-references",
                type: LaunchType.UserInitiated,
              })
            }
          />
          <Action
            title="Open Search Commands"
            icon={Icon.Terminal}
            onAction={() =>
              launchCommand({
                name: "search-commands",
                type: LaunchType.UserInitiated,
              })
            }
          />
        </ActionPanel>
      }
    />
  );
}

function buildMarkdown(state: UpdateState): string {
  if (state.isLoading) {
    return "# Updating References\n\nDownloading the latest upstream content and rebuilding the local search indexes.";
  }

  if (state.error) {
    const fallbackNote = state.dataset
      ? "\n\nYour previously cached dataset is still available."
      : "";
    return `# Update Failed\n\n${state.error}${fallbackNote}`;
  }

  if (state.dataset) {
    return `# References Updated\n\nThe dataset was rebuilt successfully.\n\n- References: ${state.dataset.meta.total}\n- Sections: ${state.dataset.meta.sectionsTotal}\n- Commands: ${state.dataset.meta.snippetsTotal}`;
  }

  return "# Update References\n\nNo dataset is currently available.";
}
