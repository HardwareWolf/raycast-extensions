import { Detail } from "@raycast/api";
import { processReferenceMarkdown } from "../core/reference-markdown";
import { ReferenceIndexItem } from "../types";
import { ReferenceActionPanel } from "./reference-actions";

interface ReferenceDetailProps {
  entry: ReferenceIndexItem;
  markdown: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onUpdate?: () => void;
  sectionCount?: number;
  snippetCount?: number;
}

export function ReferenceDetail({
  entry,
  markdown,
  isFavorite,
  onToggleFavorite,
  onUpdate,
  sectionCount,
  snippetCount,
}: ReferenceDetailProps) {
  const processedMarkdown = processReferenceMarkdown(markdown);

  return (
    <Detail
      navigationTitle={entry.title}
      markdown={processedMarkdown}
      actions={
        <ReferenceActionPanel
          entry={entry}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
          onUpdate={onUpdate}
          copyActions={[
            {
              title: "Copy Reference Content",
              content: processedMarkdown,
            },
          ]}
        />
      }
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Category" text={entry.category} />
          {typeof sectionCount === "number" && (
            <Detail.Metadata.Label
              title="Sections"
              text={String(sectionCount)}
            />
          )}
          {typeof snippetCount === "number" && (
            <Detail.Metadata.Label
              title="Commands"
              text={String(snippetCount)}
            />
          )}
          <Detail.Metadata.TagList title="Tags">
            {entry.tags.map((tag) => (
              <Detail.Metadata.TagList.Item key={tag} text={tag} />
            ))}
          </Detail.Metadata.TagList>
          <Detail.Metadata.Label title="Source" text={entry.path} />
          <Detail.Metadata.Link
            title="GitHub"
            text="Open file"
            target={entry.link}
          />
        </Detail.Metadata>
      }
    />
  );
}
