import { environment } from "@raycast/api";
import path from "node:path";
import {
  readDatasetFromDirectory,
  readDatasetSearchDataFromDirectory,
  readDatasetSummaryFromDirectory,
  readReferenceDetailFromDirectory,
  writeDatasetToDirectory,
} from "./dataset-files";
import {
  CURRENT_DATASET_SCHEMA_VERSION,
  Dataset,
  ReferenceDetailRecord,
  ReferenceIndexItem,
} from "../types";
import {
  extractReferenceSections,
  extractReferenceSnippets,
} from "./reference-markdown";

export class DatasetRepository {
  private readonly supportDir = path.join(environment.supportPath, "data");

  async load(): Promise<Dataset | undefined> {
    const dataset = await readDatasetFromDirectory(this.supportDir);
    if (!dataset) {
      return undefined;
    }

    if (
      dataset.meta.schemaVersion === CURRENT_DATASET_SCHEMA_VERSION &&
      Array.isArray(dataset.sections) &&
      Array.isArray(dataset.snippets)
    ) {
      return dataset as Dataset;
    }

    const upgraded = this.upgradeDataset(dataset);
    await this.save(upgraded);
    return upgraded;
  }

  async loadReferenceIndex(): Promise<
    | {
        meta: Dataset["meta"];
        index: ReferenceIndexItem[];
      }
    | undefined
  > {
    const summary = await readDatasetSummaryFromDirectory(this.supportDir);
    if (!summary) {
      return undefined;
    }

    if (summary.meta.schemaVersion !== CURRENT_DATASET_SCHEMA_VERSION) {
      return undefined;
    }

    return summary;
  }

  async loadCommandSearchData(): Promise<
    | {
        meta: Dataset["meta"];
        index: ReferenceIndexItem[];
        sections: Dataset["sections"];
        snippets: Dataset["snippets"];
      }
    | undefined
  > {
    const searchData = await readDatasetSearchDataFromDirectory(
      this.supportDir,
    );
    if (!searchData) {
      return undefined;
    }

    if (searchData.meta.schemaVersion !== CURRENT_DATASET_SCHEMA_VERSION) {
      return undefined;
    }

    return searchData;
  }

  async loadReferenceDetail(
    referenceId: string,
  ): Promise<ReferenceDetailRecord | undefined> {
    const summary = await readDatasetSummaryFromDirectory(this.supportDir);
    if (!summary) {
      return undefined;
    }

    if (summary.meta.schemaVersion !== CURRENT_DATASET_SCHEMA_VERSION) {
      return undefined;
    }

    return readReferenceDetailFromDirectory(this.supportDir, referenceId);
  }

  async hasData(): Promise<boolean> {
    return (await this.loadReferenceIndex()) !== undefined;
  }

  async save(dataset: Dataset): Promise<void> {
    await writeDatasetToDirectory(this.supportDir, dataset);
  }

  getSupportDir(): string {
    return this.supportDir;
  }

  private upgradeDataset(raw: {
    meta: {
      source: string;
      generatedAt: string;
      total: number;
      version?: string;
    };
    index: ReferenceIndexItem[];
    content: Record<string, string>;
  }): Dataset {
    const nextIndex = raw.index.map((reference) => ({ ...reference }));
    const sections = nextIndex.flatMap((reference) =>
      extractReferenceSections({
        referenceId: reference.id,
        markdown: raw.content[reference.id] ?? "",
      }),
    );
    const snippets = nextIndex.flatMap((reference) =>
      extractReferenceSnippets({
        referenceId: reference.id,
        sections: sections.filter(
          (section) => section.referenceId === reference.id,
        ),
      }),
    );

    const snippetPreviewByReference = new Map<string, string>();
    const sectionCountByReference = new Map<string, number>();
    const snippetCountByReference = new Map<string, number>();

    for (const section of sections) {
      sectionCountByReference.set(
        section.referenceId,
        (sectionCountByReference.get(section.referenceId) ?? 0) + 1,
      );
    }

    for (const snippet of snippets) {
      if (!snippetPreviewByReference.has(snippet.referenceId)) {
        snippetPreviewByReference.set(snippet.referenceId, snippet.preview);
      }

      snippetCountByReference.set(
        snippet.referenceId,
        (snippetCountByReference.get(snippet.referenceId) ?? 0) + 1,
      );
    }

    for (const reference of nextIndex) {
      reference.topSnippet =
        reference.topSnippet ?? snippetPreviewByReference.get(reference.id);
      reference.sectionCount =
        reference.sectionCount ??
        sectionCountByReference.get(reference.id) ??
        0;
      reference.snippetCount =
        reference.snippetCount ??
        snippetCountByReference.get(reference.id) ??
        0;
    }

    return {
      meta: {
        schemaVersion: CURRENT_DATASET_SCHEMA_VERSION,
        source: raw.meta.source,
        generatedAt: raw.meta.generatedAt,
        total: nextIndex.length,
        sectionsTotal: sections.length,
        snippetsTotal: snippets.length,
        version: raw.meta.version,
      },
      index: nextIndex,
      content: raw.content,
      sections,
      snippets,
    };
  }
}
