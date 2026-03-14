export type ReferenceId = string;
export type ReferenceSectionId = string;
export type ReferenceSnippetId = string;

export const CURRENT_DATASET_SCHEMA_VERSION = 4;

export interface ReferenceIndexItem {
  id: ReferenceId;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  topSnippet?: string;
  headings: string[];
  sectionCount: number;
  snippetCount: number;
  path: string;
  link: string;
}

export interface ReferenceSectionRecord {
  id: ReferenceSectionId;
  referenceId: ReferenceId;
  title: string;
  level: number;
  parents: string[];
  markdown: string;
  plainText: string;
  snippet: string;
}

export type ReferenceSnippetSource =
  | "code-fence"
  | "table-inline"
  | "list-inline";

export interface ReferenceSnippetRecord {
  id: ReferenceSnippetId;
  referenceId: ReferenceId;
  sectionId?: ReferenceSectionId;
  source: ReferenceSnippetSource;
  language?: string;
  code: string;
  plainCode: string;
  description?: string;
  preview: string;
}

export interface ReferenceDetailRecord {
  content: string;
  sections: ReferenceSectionRecord[];
  snippets: ReferenceSnippetRecord[];
}

export interface DatasetMeta {
  schemaVersion: number;
  source: string;
  generatedAt: string;
  total: number;
  sectionsTotal: number;
  snippetsTotal: number;
  version?: string;
}

export interface Dataset {
  meta: DatasetMeta;
  index: ReferenceIndexItem[];
  content: Record<ReferenceId, string>;
  sections: ReferenceSectionRecord[];
  snippets: ReferenceSnippetRecord[];
}

export interface Frontmatter {
  title?: string;
  tags?: unknown;
  categories?: unknown;
  intro?: string;
  date?: string;
}
