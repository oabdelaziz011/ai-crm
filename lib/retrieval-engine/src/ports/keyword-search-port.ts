export type KeywordSearchHit = {
  chunkId: string;
  documentId: string;
  sourceId: string;
  documentTitle: string;
  sectionTitle: string;
  content: string;
  score: number;
  pageNumber: number | null;
  rank: number;
};

export type KeywordSearchInput = {
  companyId: string;
  query: string;
  limit?: number;
  sourceIds?: string[];
  documentIds?: string[];
};

export type KeywordSearchPort = {
  search(input: KeywordSearchInput): Promise<KeywordSearchHit[]>;
};

export class NoopKeywordSearchPort implements KeywordSearchPort {
  async search(): Promise<KeywordSearchHit[]> {
    return [];
  }
}
