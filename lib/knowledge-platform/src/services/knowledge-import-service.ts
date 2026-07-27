import { PassthroughDocumentImporter, type DocumentImporter, type Parser } from "../ingestion/ingestion-contracts.js";
import { ParserRegistry } from "../ingestion/parser-registry.js";
import { KNOWLEDGE_PERMISSIONS } from "../constants.js";
import {
  KnowledgeSourceDisabledError,
  KnowledgeSourceNotFoundError,
  PermissionDeniedError,
} from "../errors.js";
import type {
  KnowledgeDocumentRepository,
  KnowledgeSectionRepository,
  KnowledgeSourceRepository,
  KnowledgeTagRepository,
  KnowledgeVersionRepository,
} from "../repositories/knowledge-repositories.js";
import type { ImportDocumentInput, KnowledgeSectionRecord, ServiceContext } from "../types.js";
import { buildImportMetadata, computeChecksum } from "../utils/knowledge-utils.js";
import { resolveChunkingConfig } from "../utils/chunking-config.js";
import type { KnowledgeChunkService } from "./knowledge-chunk-service.js";
import type { KnowledgeDocumentService } from "./knowledge-document-service.js";
import type { KnowledgeSectionService } from "./knowledge-section-service.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new PermissionDeniedError(permission);
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) throw new PermissionDeniedError(KNOWLEDGE_PERMISSIONS.import);
}

export class KnowledgeParserService {
  constructor(private readonly parser: Parser = new ParserRegistry()) {}

  parse(content: string, mimeType: string, title?: string, options?: Omit<ImportDocumentInput, "companyId" | "sourceId" | "title" | "rawContent">) {
    return this.parser.parse({
      content,
      mimeType,
      title,
      contentEncoding: options?.contentEncoding,
      fileName: options?.fileName,
    });
  }
}

export class KnowledgeImportService {
  constructor(
    private readonly sourceRepository: KnowledgeSourceRepository,
    private readonly documentRepository: KnowledgeDocumentRepository,
    private readonly versionRepository: KnowledgeVersionRepository,
    private readonly tagRepository: KnowledgeTagRepository,
    private readonly documentService: KnowledgeDocumentService,
    private readonly sectionService: KnowledgeSectionService,
    private readonly chunkService: KnowledgeChunkService,
    private readonly parserService: KnowledgeParserService,
    private readonly documentImporter: DocumentImporter,
  ) {}

  async importDocument(ctx: ServiceContext, input: ImportDocumentInput) {
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.import);
    assertCompanyAccess(ctx, input.companyId);

    const source = await this.sourceRepository.findById(input.sourceId);
    if (!source || source.company_id !== input.companyId) throw new KnowledgeSourceNotFoundError(input.sourceId);
    if (!source.is_enabled) throw new KnowledgeSourceDisabledError(source.id);

    const parsed = await this.parserService.parse(input.rawContent, input.mimeType ?? "text/plain", input.title, input);
    const imported = await this.documentImporter.importDocument({
      source,
      payload: {
        title: parsed.title || input.title,
        description: input.description,
        language: input.language,
        mimeType: input.mimeType ?? parsed.mimeType,
        text: parsed.text,
        metadata: buildImportMetadata(parsed.metadata, input.metadata, {
          userId: ctx.userId,
          fileName: input.fileName,
          mimeType: input.mimeType ?? parsed.mimeType,
          pageCount:
            parsed.pages?.length ??
            (typeof parsed.metadata?.page_count === "number" ? parsed.metadata.page_count : null),
          parser: typeof parsed.metadata?.parser === "string" ? parsed.metadata.parser : null,
        }),
      },
    });

    const checksum = computeChecksum(imported.text);
    const document = await this.documentService.createDocument(ctx, {
      companyId: input.companyId,
      sourceId: input.sourceId,
      title: imported.title,
      description: imported.description ?? "",
      language: imported.language ?? "en",
      status: "draft",
      checksum,
      mimeType: imported.mimeType ?? "text/plain",
      metadata: imported.metadata ?? {},
      author: typeof parsed.metadata?.pdf_author === "string" ? parsed.metadata.pdf_author : null,
    });

    const version = await this.versionRepository.findByDocumentAndNumber(document.id, 1);
    if (!version) throw new Error("Initial document version was not created.");

    const sections: KnowledgeSectionRecord[] = [];
    if (parsed.pages?.length) {
      for (const page of parsed.pages) {
        const section = await this.sectionService.createSection(ctx, {
          companyId: input.companyId,
          documentId: document.id,
          versionId: version.id,
          title: page.title ?? `Page ${page.pageNumber}`,
          content: page.text,
          sectionOrder: page.pageNumber - 1,
          metadata: { page_number: page.pageNumber },
        });
        sections.push(section);
      }
    } else {
      const section = await this.sectionService.createSection(ctx, {
        companyId: input.companyId,
        documentId: document.id,
        versionId: version.id,
        title: "Body",
        content: imported.text,
        sectionOrder: 0,
      });
      sections.push(section);
    }

    if (input.tags?.length) {
      await this.tagRepository.setTags(input.companyId, document.id, input.tags);
    }

    const chunking = resolveChunkingConfig(source.configuration);
    const chunks = await this.chunkService.generateChunksForVersion(
      ctx,
      document.id,
      version.id,
      imported.text,
      { strategyName: chunking.strategyName, chunkingOptions: chunking.options },
    );
    return { document, version, section: sections[0], sections, chunks };
  }
}
