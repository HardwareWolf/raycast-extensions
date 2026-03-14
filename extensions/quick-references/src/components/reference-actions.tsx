import { Action, ActionPanel, Icon } from "@raycast/api";
import { ReferenceIndexItem } from "../types";

interface OpenActionItem {
  title: string;
  target: React.ReactElement;
  onOpen?: () => void;
  icon?: Icon;
}

interface CopyActionItem {
  title: string;
  content: string;
  icon?: Icon;
}

interface ReferenceActionPanelProps {
  entry: ReferenceIndexItem;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onUpdate?: () => void;
  openActions?: OpenActionItem[];
  copyActions?: CopyActionItem[];
  extraActions?: React.ReactNode;
}

export function ReferenceActionPanel({
  entry,
  isFavorite,
  onToggleFavorite,
  onUpdate,
  openActions,
  copyActions,
  extraActions,
}: ReferenceActionPanelProps) {
  return (
    <ActionPanel>
      {openActions?.map((openAction) => (
        <Action.Push
          key={openAction.title}
          title={openAction.title}
          icon={openAction.icon ?? Icon.Sidebar}
          target={openAction.target}
          onPush={openAction.onOpen}
        />
      ))}
      {copyActions?.map((copyAction) => (
        <Action.CopyToClipboard
          key={copyAction.title}
          title={copyAction.title}
          content={copyAction.content}
          icon={copyAction.icon ?? Icon.CopyClipboard}
        />
      ))}
      {entry.topSnippet && (
        <Action.CopyToClipboard
          title="Copy Top Snippet"
          content={entry.topSnippet}
          icon={Icon.Clipboard}
        />
      )}
      {extraActions}
      <Action.CopyToClipboard title="Copy Title" content={entry.title} />
      <Action.CopyToClipboard title="Copy Link" content={entry.link} />
      <Action.OpenInBrowser url={entry.link} />
      <Action
        title={isFavorite ? "Remove Favorite" : "Add Favorite"}
        icon={isFavorite ? Icon.StarDisabled : Icon.Star}
        shortcut={{ modifiers: ["cmd"], key: "f" }}
        onAction={onToggleFavorite}
      />
      {onUpdate && (
        <Action
          title="Update References"
          icon={Icon.ArrowClockwise}
          shortcut={{ modifiers: ["cmd", "shift"], key: "u" }}
          onAction={onUpdate}
        />
      )}
    </ActionPanel>
  );
}
