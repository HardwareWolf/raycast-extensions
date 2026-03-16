import fs from "node:fs";
import path from "node:path";
import {
  Dataset,
  DatasetMeta,
  ReferenceDetailRecord,
  ReferenceIndexItem,
  ReferenceSectionRecord,
  ReferenceSnippetRecord,
} from "../types";

export const META_FILENAME = "meta.json";
export const INDEX_FILENAME = "index.json";
export const CONTENT_FILENAME = "content.json";
export const SECTIONS_FILENAME = "sections.json";
export const SNIPPETS_FILENAME = "snippets.json";
export const REFERENCE_DETAILS_DIRNAME = "references";

export interface DatasetLike {
  meta: DatasetMeta;
  index: ReferenceIndexItem[];
  content: Record<string, string>;
  sections?: ReferenceSectionRecord[];
  snippets?: ReferenceSnippetRecord[];
}

export interface DatasetSummary {
  meta: DatasetMeta;
  index: ReferenceIndexItem[];
}

export interface DatasetSearchData extends DatasetSummary {
  sections: ReferenceSectionRecord[];
  snippets: ReferenceSnippetRecord[];
}

export async function writeDatasetToDirectory(
  directory: string,
  dataset: Dataset,
  options: { pretty?: boolean } = {},
): Promise<void> {
  const spacing = options.pretty === false ? 0 : 2;
  const referenceDetailsDir = path.join(directory, REFERENCE_DETAILS_DIRNAME);
  const sectionsByReference = groupByReferenceId(dataset.sections);
  const snippetsByReference = groupByReferenceId(dataset.snippets);

  await fs.promises.mkdir(directory, { recursive: true });
  await fs.promises.rm(referenceDetailsDir, { recursive: true, force: true });
  await fs.promises.mkdir(referenceDetailsDir, { recursive: true });
  await deleteIfExists(path.join(directory, CONTENT_FILENAME));

  await Promise.all([
    writeJson(path.join(directory, META_FILENAME), dataset.meta, spacing),
    writeJson(path.join(directory, INDEX_FILENAME), dataset.index, spacing),
    writeJson(
      path.join(directory, SECTIONS_FILENAME),
      dataset.sections,
      spacing,
    ),
    writeJson(
      path.join(directory, SNIPPETS_FILENAME),
      dataset.snippets,
      spacing,
    ),
    ...dataset.index.map((reference) =>
      writeJson(
        path.join(referenceDetailsDir, `${reference.id}.json`),
        {
          content: dataset.content[reference.id] ?? "",
          sections: sectionsByReference.get(reference.id) ?? [],
          snippets: snippetsByReference.get(reference.id) ?? [],
        } satisfies ReferenceDetailRecord,
        spacing,
      ),
    ),
  ]);
}

export async function readDatasetSummaryFromDirectory(
  directory: string,
): Promise<DatasetSummary | undefined> {
  const metaPath = path.join(directory, META_FILENAME);
  const indexPath = path.join(directory, INDEX_FILENAME);

  if (!(await pathExists(metaPath)) || !(await pathExists(indexPath))) {
    return undefined;
  }

  try {
    const [metaRaw, indexRaw] = await Promise.all([
      fs.promises.readFile(metaPath, "utf8"),
      fs.promises.readFile(indexPath, "utf8"),
    ]);

    return {
      meta: JSON.parse(metaRaw) as DatasetMeta,
      index: JSON.parse(indexRaw) as ReferenceIndexItem[],
    };
  } catch (error) {
    console.error("[dataset] Failed to read dataset summary", directory, error);
    return undefined;
  }
}

export async function readDatasetSearchDataFromDirectory(
  directory: string,
): Promise<DatasetSearchData | undefined> {
  const summary = await readDatasetSummaryFromDirectory(directory);
  if (!summary) {
    return undefined;
  }

  const sectionsPath = path.join(directory, SECTIONS_FILENAME);
  const snippetsPath = path.join(directory, SNIPPETS_FILENAME);

  if (!(await pathExists(sectionsPath)) || !(await pathExists(snippetsPath))) {
    return undefined;
  }

  try {
    const [sectionsRaw, snippetsRaw] = await Promise.all([
      fs.promises.readFile(sectionsPath, "utf8"),
      fs.promises.readFile(snippetsPath, "utf8"),
    ]);

    return {
      ...summary,
      sections: JSON.parse(sectionsRaw) as ReferenceSectionRecord[],
      snippets: JSON.parse(snippetsRaw) as ReferenceSnippetRecord[],
    };
  } catch (error) {
    console.error(
      "[dataset] Failed to read dataset search data",
      directory,
      error,
    );
    return undefined;
  }
}

export async function readReferenceDetailFromDirectory(
  directory: string,
  referenceId: string,
): Promise<ReferenceDetailRecord | undefined> {
  const detailPath = path.join(
    directory,
    REFERENCE_DETAILS_DIRNAME,
    `${referenceId}.json`,
  );

  if (!(await pathExists(detailPath))) {
    return undefined;
  }

  try {
    const raw = await fs.promises.readFile(detailPath, "utf8");
    return JSON.parse(raw) as ReferenceDetailRecord;
  } catch (error) {
    console.error(
      "[dataset] Failed to read reference detail",
      referenceId,
      error,
    );
    return undefined;
  }
}

export async function readDatasetFromDirectory(
  directory: string,
): Promise<DatasetLike | undefined> {
  const summary = await readDatasetSummaryFromDirectory(directory);
  if (!summary) {
    return undefined;
  }

  const referenceDetailsDir = path.join(directory, REFERENCE_DETAILS_DIRNAME);
  if (await pathExists(referenceDetailsDir)) {
    const searchData = await readDatasetSearchDataFromDirectory(directory);
    if (!searchData) {
      return undefined;
    }

    const details = await Promise.all(
      summary.index.map((reference) =>
        readReferenceDetailFromDirectory(directory, reference.id),
      ),
    );

    return {
      meta: summary.meta,
      index: summary.index,
      content: Object.fromEntries(
        summary.index.map((reference, index) => [
          reference.id,
          details[index]?.content ?? "",
        ]),
      ),
      sections: searchData.sections,
      snippets: searchData.snippets,
    };
  }

  return readLegacyDatasetFromDirectory(directory, summary);
}

async function readLegacyDatasetFromDirectory(
  directory: string,
  summary: DatasetSummary,
): Promise<DatasetLike | undefined> {
  const contentPath = path.join(directory, CONTENT_FILENAME);
  const sectionsPath = path.join(directory, SECTIONS_FILENAME);
  const snippetsPath = path.join(directory, SNIPPETS_FILENAME);

  if (!(await pathExists(contentPath))) {
    return undefined;
  }

  try {
    const [contentRaw, sectionsRaw, snippetsRaw] = await Promise.all([
      fs.promises.readFile(contentPath, "utf8"),
      readOptionalJsonFile<ReferenceSectionRecord[]>(sectionsPath),
      readOptionalJsonFile<ReferenceSnippetRecord[]>(snippetsPath),
    ]);

    return {
      meta: summary.meta,
      index: summary.index,
      content: JSON.parse(contentRaw) as Record<string, string>,
      sections: sectionsRaw,
      snippets: snippetsRaw,
    };
  } catch (error) {
    console.error(
      "[dataset] Failed to read legacy dataset directory",
      directory,
      error,
    );
    return undefined;
  }
}

async function writeJson(
  targetPath: string,
  value: unknown,
  spacing: number,
): Promise<void> {
  await fs.promises.writeFile(
    targetPath,
    JSON.stringify(value, null, spacing),
    "utf8",
  );
}

async function readOptionalJsonFile<T>(
  targetPath: string,
): Promise<T | undefined> {
  if (!(await pathExists(targetPath))) {
    return undefined;
  }

  const raw = await fs.promises.readFile(targetPath, "utf8");
  return JSON.parse(raw) as T;
}

function groupByReferenceId<T extends { referenceId: string }>(
  records: T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const record of records) {
    const bucket = grouped.get(record.referenceId) ?? [];
    bucket.push(record);
    grouped.set(record.referenceId, bucket);
  }

  return grouped;
}

async function deleteIfExists(targetPath: string): Promise<void> {
  if (await pathExists(targetPath)) {
    await fs.promises.rm(targetPath, { force: true });
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
