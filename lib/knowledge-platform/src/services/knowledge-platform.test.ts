import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ParagraphChunkingStrategy } from "../ingestion/chunking-strategy.js";
import { PassthroughDocumentImporter } from "../ingestion/ingestion-contracts.js";
import { ParserRegistry } from "../ingestion/parser-registry.js";
import {
  DocumentLockedError,
  DuplicateKnowledgeSourceError,
  PermissionDeniedError,
} from "../errors.js";
import type {
  KnowledgeChunkRepository,
  KnowledgeDocumentRepository,
  KnowledgeSectionRepository,
  KnowledgeSourceRepository,
  KnowledgeTagRepository,
  KnowledgeVersionRepository,
} from "../repositories/knowledge-repositories.js";
import { KnowledgeChunkService } from "./knowledge-chunk-service.js";
import { KnowledgeDocumentService } from "./knowledge-document-service.js";
import { KnowledgeImportService, KnowledgeParserService } from "./knowledge-import-service.js";
import { KnowledgePublishingService } from "./knowledge-publishing-service.js";
import { KnowledgeSectionService } from "./knowledge-section-service.js";
import { KnowledgeSourceService } from "./knowledge-source-service.js";
import { KnowledgeVersionService } from "./knowledge-version-service.js";
import type {
  KnowledgeChunkRecord,
  KnowledgeDocumentRecord,
  KnowledgeDocumentVersionRecord,
  KnowledgeSectionRecord,
  KnowledgeSourceRecord,
  ServiceContext,
} from "../types.js";
import { computeChecksum } from "../utils/knowledge-utils.js";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      ["knowledge.view", "knowledge.manage", "knowledge.publish", "knowledge.import"].includes(code),
    ...overrides,
  };
}

function createEnvironment() {
  const sources: KnowledgeSourceRecord[] = [];
  const documents: KnowledgeDocumentRecord[] = [];
  const versions: KnowledgeDocumentVersionRecord[] = [];
  const sections: KnowledgeSectionRecord[] = [];
  const chunks: KnowledgeChunkRecord[] = [];

  const sourceRepository: KnowledgeSourceRepository = {
    create: async (input) => {
      const record: KnowledgeSourceRecord = {
        id: `source-${sources.length + 1}`,
        company_id: input.companyId,
        key: input.key,
        display_name: input.displayName,
        description: input.description ?? "",
        source_type: input.sourceType,
        configuration: input.configuration ?? {},
        metadata: input.metadata ?? {},
        is_enabled: input.isEnabled ?? true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
        created_by: input.createdBy ?? null,
      };
      sources.push(record);
      return record;
    },
    update: async (input) => {
      const record = sources.find((item) => item.id === input.sourceId && !item.deleted_at)!;
      Object.assign(record, {
        display_name: input.displayName ?? record.display_name,
        description: input.description ?? record.description,
      });
      return record;
    },
    softDelete: async (input) => {
      const record = sources.find((item) => item.id === input.id)!;
      record.deleted_at = new Date().toISOString();
      return record;
    },
    findById: async (id) => sources.find((item) => item.id === id && !item.deleted_at) ?? null,
    findByKey: async (companyId, key) =>
      sources.find((item) => item.company_id === companyId && item.key === key && !item.deleted_at) ?? null,
    list: async (filter) => sources.filter((item) => item.company_id === filter.companyId && !item.deleted_at),
  };

  const documentRepository: KnowledgeDocumentRepository = {
    create: async (input) => {
      const record: KnowledgeDocumentRecord = {
        id: `doc-${documents.length + 1}`,
        company_id: input.companyId,
        source_id: input.sourceId,
        title: input.title,
        description: input.description ?? "",
        language: input.language ?? "en",
        version: 1,
        current_version_number: 1,
        published_version_id: null,
        status: input.status ?? "draft",
        checksum: input.checksum,
        mime_type: input.mimeType ?? "text/plain",
        metadata: input.metadata ?? {},
        effective_date: input.effectiveDate ?? null,
        expiration_date: input.expirationDate ?? null,
        author: input.author ?? null,
        classification: input.classification ?? "internal",
        visibility: input.visibility ?? "company",
        retention_policy: input.retentionPolicy ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
        created_by: input.createdBy ?? null,
      };
      documents.push(record);
      return record;
    },
    update: async (input) => {
      const record = documents.find((item) => item.id === input.documentId && !item.deleted_at)!;
      Object.assign(record, {
        title: input.title ?? record.title,
        status: input.status ?? record.status,
        checksum: input.checksum ?? record.checksum,
        published_version_id: input.publishedVersionId ?? record.published_version_id,
        current_version_number: input.currentVersionNumber ?? record.current_version_number,
        metadata: input.metadata ?? record.metadata,
        version: input.currentVersionNumber ?? record.version,
      });
      return record;
    },
    softDelete: async (input) => {
      const record = documents.find((item) => item.id === input.id)!;
      record.deleted_at = new Date().toISOString();
      record.status = "archived";
      return record;
    },
    findById: async (id) => documents.find((item) => item.id === id && !item.deleted_at) ?? null,
    list: async (filter) => documents.filter((item) => item.company_id === filter.companyId && !item.deleted_at),
  };

  const versionRepository: KnowledgeVersionRepository = {
    create: async (input) => {
      const record: KnowledgeDocumentVersionRecord = {
        id: `version-${versions.length + 1}`,
        company_id: input.companyId,
        document_id: input.documentId,
        version_number: input.versionNumber,
        status: "draft",
        checksum: input.checksum,
        mime_type: input.mimeType ?? "text/plain",
        metadata: input.metadata ?? {},
        is_immutable: false,
        published_at: null,
        published_by: null,
        created_at: new Date().toISOString(),
        created_by: input.createdBy ?? null,
      };
      versions.push(record);
      return record;
    },
    publish: async (versionId, publishedBy) => {
      const record = versions.find((item) => item.id === versionId)!;
      record.status = "published";
      record.is_immutable = true;
      record.published_at = new Date().toISOString();
      record.published_by = publishedBy ?? null;
      return record;
    },
    archive: async (versionId) => {
      const record = versions.find((item) => item.id === versionId)!;
      record.status = "archived";
      return record;
    },
    findById: async (id) => versions.find((item) => item.id === id) ?? null,
    findByDocumentAndNumber: async (documentId, versionNumber) =>
      versions.find((item) => item.document_id === documentId && item.version_number === versionNumber) ?? null,
    list: async (filter) => versions.filter((item) => item.document_id === filter.documentId),
  };

  const sectionRepository: KnowledgeSectionRepository = {
    create: async (input) => {
      const record: KnowledgeSectionRecord = {
        id: `section-${sections.length + 1}`,
        company_id: input.companyId,
        document_id: input.documentId,
        version_id: input.versionId,
        parent_section_id: input.parentSectionId ?? null,
        title: input.title,
        content: input.content ?? "",
        section_order: input.sectionOrder,
        metadata: input.metadata ?? {},
        created_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
      };
      sections.push(record);
      return record;
    },
    update: async (input) => {
      const record = sections.find((item) => item.id === input.sectionId)!;
      Object.assign(record, {
        title: input.title ?? record.title,
        content: input.content ?? record.content,
        section_order: input.sectionOrder ?? record.section_order,
        parent_section_id: input.parentSectionId ?? record.parent_section_id,
      });
      return record;
    },
    reorder: async (input) => {
      const record = sections.find((item) => item.id === input.sectionId)!;
      record.section_order = input.sectionOrder;
      return record;
    },
    softDelete: async (input) => {
      const record = sections.find((item) => item.id === input.id)!;
      record.deleted_at = new Date().toISOString();
      return record;
    },
    findById: async (id) => sections.find((item) => item.id === id && !item.deleted_at) ?? null,
    list: async (filter) =>
      sections.filter(
        (item) =>
          item.company_id === filter.companyId &&
          item.document_id === filter.documentId &&
          item.version_id === filter.versionId &&
          !item.deleted_at,
      ),
  };

  const tagRepository: KnowledgeTagRepository = {
    setTags: async (companyId, documentId, tags) =>
      tags.map((tag, index) => ({
        id: `tag-${index}`,
        company_id: companyId,
        document_id: documentId,
        tag,
        created_at: new Date().toISOString(),
      })),
    listByDocument: async () => [],
  };

  const chunkRepository: KnowledgeChunkRepository = {
    createMany: async (inputs) =>
      inputs.map((input, index) => {
        const record: KnowledgeChunkRecord = {
          id: `chunk-${chunks.length + index + 1}`,
          company_id: input.companyId,
          document_id: input.documentId,
          version_id: input.versionId,
          section_id: input.sectionId ?? null,
          chunk_index: input.chunkOrder,
          chunk_order: input.chunkOrder,
          content: input.content,
          token_count: input.tokenCount,
          metadata: input.metadata ?? {},
          checksum: input.checksum,
          created_at: new Date().toISOString(),
          deleted_at: null,
          deleted_by: null,
        };
        chunks.push(record);
        return record;
      }),
    softDeleteByVersion: async (versionId) => {
      let count = 0;
      for (const chunk of chunks) {
        if (chunk.version_id === versionId && !chunk.deleted_at) {
          chunk.deleted_at = new Date().toISOString();
          count += 1;
        }
      }
      return count;
    },
    list: async (filter) =>
      chunks.filter(
        (item) =>
          item.company_id === filter.companyId &&
          item.document_id === filter.documentId &&
          (!filter.versionId || item.version_id === filter.versionId) &&
          !item.deleted_at,
      ),
  };

  const chunkingStrategy = new ParagraphChunkingStrategy();
  const sourceService = new KnowledgeSourceService(sourceRepository);
  const documentService = new KnowledgeDocumentService(documentRepository, sourceRepository, versionRepository);
  const versionService = new KnowledgeVersionService(versionRepository, documentRepository);
  const publishingService = new KnowledgePublishingService(
    documentRepository,
    versionRepository,
    chunkRepository,
    versionService,
  );
  const sectionService = new KnowledgeSectionService(sectionRepository, versionRepository);
  const chunksService = new KnowledgeChunkService(
    chunkRepository,
    documentRepository,
    versionRepository,
    sectionRepository,
    chunkingStrategy,
  );
  const importService = new KnowledgeImportService(
    sourceRepository,
    documentRepository,
    versionRepository,
    tagRepository,
    documentService,
    sectionService,
    chunksService,
    new KnowledgeParserService(new ParserRegistry()),
    new PassthroughDocumentImporter(),
  );

  return {
    sources: sourceService,
    documents: documentService,
    versionService,
    publishingService,
    sectionService,
    chunksService,
    importService,
    chunks,
    versionRepository,
    sectionRepository,
  };
}

describe("KnowledgeSourceService", () => {
  it("creates sources and enforces company isolation", async () => {
    const env = createEnvironment();
    const source = await env.sources.createSource(createContext(), {
      companyId: "company-1",
      key: "policy-manual",
      displayName: "Policy Manual",
      sourceType: "policy",
    });
    assert.equal(source.source_type, "policy");
    await assert.rejects(
      () => env.sources.listSources(createContext({ companyId: "company-2" }), { companyId: "company-1" }),
      PermissionDeniedError,
    );
  });

  it("rejects duplicate keys", async () => {
    const env = createEnvironment();
    await env.sources.createSource(createContext(), {
      companyId: "company-1",
      key: "faq",
      displayName: "FAQ",
      sourceType: "faq",
    });
    await assert.rejects(
      () =>
        env.sources.createSource(createContext(), {
          companyId: "company-1",
          key: "faq",
          displayName: "Duplicate",
          sourceType: "faq",
        }),
      DuplicateKnowledgeSourceError,
    );
  });
});

describe("KnowledgeVersionService", () => {
  it("publishes immutable versions and supports rollback", async () => {
    const env = createEnvironment();
    const source = await env.sources.createSource(createContext(), {
      companyId: "company-1",
      key: "manual",
      displayName: "Manual",
      sourceType: "manual",
    });
    const document = await env.documents.createDocument(createContext(), {
      companyId: "company-1",
      sourceId: source.id,
      title: "Handbook",
      checksum: computeChecksum("v1"),
    });
    const version = await env.versionRepository.findByDocumentAndNumber(document.id, 1);
    assert.ok(version);

    const published = await env.versionService.publishVersion(createContext(), version!.id);
    assert.equal(published.status, "published");
    assert.equal(published.is_immutable, true);

    const republished = await env.versionService.publishVersion(createContext(), published.id);
    assert.equal(republished.id, published.id);

    const rolledBack = await env.versionService.rollbackToVersion(createContext(), document.id, 1);
    assert.equal(rolledBack.version_number, 2);
    assert.equal(rolledBack.status, "draft");
  });
});

describe("KnowledgeSectionService", () => {
  it("builds ordered hierarchical sections", async () => {
    const env = createEnvironment();
    const source = await env.sources.createSource(createContext(), {
      companyId: "company-1",
      key: "manual",
      displayName: "Manual",
      sourceType: "manual",
    });
    const document = await env.documents.createDocument(createContext(), {
      companyId: "company-1",
      sourceId: source.id,
      title: "Guide",
      checksum: computeChecksum("guide"),
    });
    const version = (await env.versionRepository.findByDocumentAndNumber(document.id, 1))!;

    const intro = await env.sectionService.createSection(createContext(), {
      companyId: "company-1",
      documentId: document.id,
      versionId: version.id,
      title: "Introduction",
      content: "Welcome",
      sectionOrder: 0,
    });
    await env.sectionService.createSection(createContext(), {
      companyId: "company-1",
      documentId: document.id,
      versionId: version.id,
      parentSectionId: intro.id,
      title: "Scope",
      content: "Scope details",
      sectionOrder: 1,
    });

    const tree = await env.sectionService.listSectionHierarchy(createContext(), {
      companyId: "company-1",
      documentId: document.id,
      versionId: version.id,
    });

    assert.equal(tree.length, 1);
    assert.equal(tree[0].children.length, 1);
    assert.equal(tree[0].children[0].title, "Scope");
  });
});

describe("KnowledgeChunkService", () => {
  it("generates ordered chunks for a version", async () => {
    const env = createEnvironment();
    const source = await env.sources.createSource(createContext(), {
      companyId: "company-1",
      key: "manual",
      displayName: "Manual",
      sourceType: "manual",
    });
    const document = await env.documents.createDocument(createContext(), {
      companyId: "company-1",
      sourceId: source.id,
      title: "Hours",
      checksum: computeChecksum("hours"),
    });
    const version = (await env.versionRepository.findByDocumentAndNumber(document.id, 1))!;
    await env.sectionService.createSection(createContext(), {
      companyId: "company-1",
      documentId: document.id,
      versionId: version.id,
      title: "Hours",
      content: "Open 9-5 Monday through Friday.",
      sectionOrder: 0,
    });

    const generated = await env.chunksService.generateChunksForVersion(createContext(), document.id, version.id);
    assert.ok(generated.length >= 1);
    assert.equal(generated[0].chunk_order, 0);
  });
});

describe("KnowledgeImportService", () => {
  it("imports documents through the domain pipeline", async () => {
    const env = createEnvironment();
    const source = await env.sources.createSource(createContext(), {
      companyId: "company-1",
      key: "manual",
      displayName: "Manual",
      sourceType: "manual",
    });

    const result = await env.importService.importDocument(createContext(), {
      companyId: "company-1",
      sourceId: source.id,
      title: "Returns",
      rawContent: "Returns accepted within 30 days.",
      tags: ["policy", "returns"],
    });

    assert.equal(result.document.status, "draft");
    assert.ok(result.version);
    assert.ok(result.chunks.length >= 1);
    assert.equal((result.document.metadata.import as { status: string }).status, "completed");
  });

  it("imports PDF documents with page sections and import metadata", async () => {
    const env = createEnvironment();
    const { readFileSync } = await import("node:fs");
    const { resolve, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const samplePdfBase64 = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../test-fixtures/sample.pdf"),
      "base64",
    );

    const source = await env.sources.createSource(createContext(), {
      companyId: "company-1",
      key: "policies",
      displayName: "Policies",
      sourceType: "pdf",
    });

    const result = await env.importService.importDocument(createContext(), {
      companyId: "company-1",
      sourceId: source.id,
      title: "Employee Handbook",
      rawContent: samplePdfBase64,
      mimeType: "application/pdf",
      contentEncoding: "base64",
      fileName: "handbook.pdf",
    });

    assert.equal(result.document.mime_type, "application/pdf");
    assert.ok(result.sections.length >= 1);
    assert.equal((result.document.metadata.import as { status: string }).status, "completed");
    assert.ok(result.chunks.length >= 1);
  });

  it("requires import permission", async () => {
    const env = createEnvironment();
    const source = await env.sources.createSource(createContext(), {
      companyId: "company-1",
      key: "manual",
      displayName: "Manual",
      sourceType: "manual",
    });
    await assert.rejects(
      () =>
        env.importService.importDocument(createContext({ hasPermission: () => false }), {
          companyId: "company-1",
          sourceId: source.id,
          title: "Denied",
          rawContent: "nope",
        }),
      PermissionDeniedError,
    );
  });
});

describe("KnowledgePublishingService", () => {
  async function createDraftWithChunks(env: ReturnType<typeof createEnvironment>) {
    const source = await env.sources.createSource(createContext(), {
      companyId: "company-1",
      key: "manual",
      displayName: "Manual",
      sourceType: "manual",
    });
    const document = await env.documents.createDocument(createContext(), {
      companyId: "company-1",
      sourceId: source.id,
      title: "Policy Handbook",
      checksum: computeChecksum("policy-content"),
    });
    const version = (await env.versionRepository.findByDocumentAndNumber(document.id, 1))!;
    await env.sectionService.createSection(createContext(), {
      companyId: "company-1",
      documentId: document.id,
      versionId: version.id,
      title: "Policy",
      content: "Employees must use MFA for sensitive systems.",
      sectionOrder: 0,
    });
    await env.chunksService.generateChunksForVersion(createContext(), document.id, version.id);
    return { document, version };
  }

  it("publishes draft documents and prepares embedding pipeline metadata", async () => {
    const env = createEnvironment();
    const { document } = await createDraftWithChunks(env);

    const result = await env.publishingService.publishDocument(createContext(), document.id);
    assert.equal(result.idempotent, false);
    assert.equal(result.document.status, "published");
    assert.equal(result.version.status, "published");
    assert.equal((result.document.metadata.publishing as { embedding_status?: string }).embedding_status, "pending");
  });

  it("is idempotent when publishing an already published document", async () => {
    const env = createEnvironment();
    const { document } = await createDraftWithChunks(env);

    await env.publishingService.publishDocument(createContext(), document.id);
    const second = await env.publishingService.publishDocument(createContext(), document.id);
    assert.equal(second.idempotent, true);
    const versions = await env.versionRepository.list({ companyId: "company-1", documentId: document.id });
    assert.equal(versions.filter((item) => item.status === "published").length, 1);
  });

  it("archives published documents and excludes them from retrieval", async () => {
    const env = createEnvironment();
    const { document } = await createDraftWithChunks(env);
    const published = await env.publishingService.publishDocument(createContext(), document.id);

    const archived = await env.publishingService.archiveDocument(createContext(), document.id);
    assert.equal(archived.document.status, "archived");
    assert.equal(archived.previousStatus, "published");
    assert.equal(env.publishingService.isDocumentRetrievalAvailable(archived.document), false);
    assert.equal(
      (archived.document.metadata.lifecycle as { archived_from_status?: string }).archived_from_status,
      "published",
    );
  });

  it("restores archived documents to their previous publish state", async () => {
    const env = createEnvironment();
    const { document } = await createDraftWithChunks(env);
    await env.publishingService.publishDocument(createContext(), document.id);
    await env.publishingService.archiveDocument(createContext(), document.id);

    const restored = await env.publishingService.restoreDocument(createContext(), document.id);
    assert.equal(restored.restoredStatus, "published");
    assert.equal(restored.document.status, "published");
    assert.equal(env.publishingService.isDocumentRetrievalAvailable(restored.document), true);
  });

  it("blocks editing published documents", async () => {
    const env = createEnvironment();
    const { document } = await createDraftWithChunks(env);
    await env.publishingService.publishDocument(createContext(), document.id);

    await assert.rejects(
      () =>
        env.documents.updateDocument(createContext(), {
          documentId: document.id,
          title: "Changed title",
        }),
      DocumentLockedError,
    );
  });

  it("enforces RBAC on publish operations", async () => {
    const env = createEnvironment();
    const { document } = await createDraftWithChunks(env);

    await assert.rejects(
      () =>
        env.publishingService.publishDocument(createContext({ hasPermission: (code) => code === "knowledge.view" }), document.id),
      PermissionDeniedError,
    );
  });
});
