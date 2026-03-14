import { getPreferenceValues } from "@raycast/api";
import { CommandCopyMode } from "./copy";

export type DefaultOpenMode = "section-browser" | "full-reference";

export interface ExtensionPreferences {
  defaultOpenMode: DefaultOpenMode;
  defaultCopyMode: CommandCopyMode;
  autoUpdateIntervalDays?: number;
}

export function getExtensionPreferences(): ExtensionPreferences {
  const preferences = getPreferenceValues<Preferences>();

  return {
    defaultOpenMode:
      preferences.defaultOpenMode === "full-reference"
        ? "full-reference"
        : "section-browser",
    defaultCopyMode:
      preferences.defaultCopyMode === "preserve" ? "preserve" : "strip-prompts",
    autoUpdateIntervalDays: parseAutoUpdateInterval(
      preferences.autoUpdateIntervalDays,
    ),
  };
}

function parseAutoUpdateInterval(value?: string): number | undefined {
  if (!value || value === "manual") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}
