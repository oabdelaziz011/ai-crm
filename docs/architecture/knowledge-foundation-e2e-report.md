# Knowledge Foundation E2E Verification Report

**Generated:** 2026-07-29T18:21:34.592Z
**Target:** https://lfbtnskmvibikalsxwsm.supabase.co
**Company:** DEMO Beta (`d0000010-0001-4001-8001-000000000002`)

## Summary

- **Passed:** 9
- **Failed:** 1
- **Total:** 10

## Scenarios

### 1. Single-page PDF import

- **Result:** PASS
- **Detail:** doc=1384b389-f458-426d-824e-2bda8656ab3c, sections=1, chunks=1, db_sections=1
- **Evidence:**
```json
{
  "document": {
    "id": "1384b389-f458-426d-824e-2bda8656ab3c",
    "title": "E2E Single Page PDF",
    "status": "draft",
    "checksum": "6f9e95dec2bd932a51446c53e52cd485fe7dda70d4c91fbd68b0f6d5d62edbdc",
    "mime_type": "application/pdf",
    "metadata": {
      "import": {
        "parser": "pdf",
        "status": "completed",
        "file_name": "e2e-single.pdf",
        "mime_type": "application/pdf",
        "page_count": 1,
        "imported_at": "2026-07-29T18:21:21.598Z",
        "imported_by": "d0000001-0001-4001-8001-000000000001"
      },
      "parser": "pdf",
      "file_name": "e2e-single.pdf",
      "page_count": 1,
      "pdf_creator": "pdf-lib (https://github.com/Hopding/pdf-lib)",
      "pdf_producer": "pdf-lib (https://github.com/Hopding/pdf-lib)",
      "pdf_creation_date": "D:20260718033659Z",
      "pdf_modification_date": "D:20260718033659Z"
    }
  },
  "version": {
    "id": "d19654a3-5a82-4426-839b-778b2bbc5c21",
    "version_number": 1,
    "checksum": "6f9e95dec2bd932a51446c53e52cd485fe7dda70d4c91fbd68b0f6d5d62edbdc"
  },
  "sections": [
    {
      "id": "9d2142ff-b411-4f2d-b710-0434f916a73b",
      "title": "Page 1",
      "section_order": 0,
      "metadata": {
        "page_number": 1
      }
    }
  ],
  "chunks": [
    {
      "id": "37f56335-5fd4-4448-bcfd-92cdaf4674f9",
      "chunk_order": 0,
      "token_count": 15,
      "content_preview": "VaultOS Knowledge PDF Enterprise policy handbook excerpt."
    }
  ]
}
```

### 2. Multi-page PDF import

- **Result:** PASS
- **Detail:** sections=3, page_numbers=1,2,3, chunks=1
- **Evidence:**
```json
{
  "sections": [
    {
      "title": "Page 1",
      "section_order": 0,
      "page_number": 1,
      "content_preview": "Page One — Overview VaultOS multi-page verification. Section"
    },
    {
      "title": "Page 2",
      "section_order": 1,
      "page_number": 2,
      "content_preview": "Page Two — Policies Enterprise policy handbook excerpt for p"
    },
    {
      "title": "Page 3",
      "section_order": 2,
      "page_number": 3,
      "content_preview": "Page Three — Appendix Appendix material and closing notes fo"
    }
  ],
  "chunks": [
    {
      "chunk_order": 0,
      "preview": "Page One — Overview VaultOS multi-page verification. Section alpha content.\n\nPag"
    }
  ]
}
```

### 3. Plain text import (regression)

- **Result:** PASS
- **Detail:** sections=1, parser=plain_text
- **Evidence:**
```json
{
  "document": {
    "id": "c7663257-04d2-48b5-9ec7-f13161b1ed87",
    "mime_type": "text/plain",
    "metadata": {
      "import": {
        "parser": "plain_text",
        "status": "completed",
        "file_name": null,
        "mime_type": "text/plain",
        "page_count": null,
        "imported_at": "2026-07-29T18:21:27.564Z",
        "imported_by": "d0000001-0001-4001-8001-000000000001"
      },
      "parser": "plain_text",
      "file_name": null
    }
  },
  "section": {
    "title": "Body",
    "content": "Returns accepted within 30 days. Contact support for exceptions."
  },
  "chunks": 1
}
```

### 4. Invalid PDF error handling

- **Result:** PASS
- **Detail:** Invalid PDF structure.
- **Evidence:**
```json
{
  "documentsBefore": 25,
  "documentsAfter": 25,
  "errorType": "KnowledgeParseError"
}
```

### 5. Duplicate PDF upload behavior

- **Result:** PASS
- **Detail:** two documents created with identical checksum (6f9e95dec2bd…); no dedup enforced
- **Evidence:**
```json
{
  "behavior": "Each import creates a new draft document and v1 version. Checksum is stored for integrity tracking but not used for deduplication.",
  "futureRecommendation": "Increment 2+ may add optional dedup by (company_id, source_id, checksum) or explicit upsert semantics.",
  "firstDocumentId": "6805d22d-6ed0-4608-af43-c9815b1bd4ae",
  "secondDocumentId": "369d2c42-0f8e-4b1f-ae17-f6f5fcdca435",
  "sharedChecksum": "6f9e95dec2bd932a51446c53e52cd485fe7dda70d4c91fbd68b0f6d5d62edbdc"
}
```

### 6a. Knowledge UI route registry

- **Result:** FAIL
- **Detail:** sources@/dashboard/knowledge, documents@/dashboard/knowledge/documents, import@/dashboard/knowledge/import, retrieval@/dashboard/knowledge/retrieval
- **Evidence:**
```json
{
  "routes": [
    {
      "id": "sources",
      "path": "/dashboard/knowledge",
      "permission": "knowledge.view"
    },
    {
      "id": "documents",
      "path": "/dashboard/knowledge/documents",
      "permission": "knowledge.view"
    },
    {
      "id": "import",
      "path": "/dashboard/knowledge/import",
      "permission": "knowledge.import"
    },
    {
      "id": "retrieval",
      "path": "/dashboard/knowledge/retrieval",
      "permission": "knowledge.view"
    }
  ]
}
```

### 6b. Permission helper logic

- **Result:** PASS
- **Detail:** canViewKnowledge / canImportKnowledge / canManageKnowledge behave as expected


### 6c. Demo role knowledge permissions (informational)

- **Result:** PASS
- **Detail:** employee knowledge.view=false, beta-admin knowledge.view=false, beta-admin knowledge.import=false
- **Evidence:**
```json
{
  "note": "Demo seed roles do not include knowledge.* permissions. UI is gated correctly; assign knowledge.view/manage/import to company roles for non-super-admin access.",
  "knowledgePermissionsInDb": [
    "knowledge.view",
    "knowledge.manage",
    "knowledge.import",
    "knowledge.publish"
  ],
  "employeePermissionSample": [],
  "adminPermissionSample": [
    "customers.view",
    "customers.create",
    "customers.edit",
    "ai_chat.view",
    "ai_chat.use",
    "ai_assistant.view",
    "ai_assistant.edit",
    "ai.conversations.view"
  ],
  "betaAdminRoles": [
    {
      "role_id": "d0000030-0001-4001-8001-000000000002",
      "user_id": "d0000002-0001-4001-8001-000000000002",
      "roles": {
        "name": "DEMO Beta Admin"
      }
    }
  ]
}
```

### 6d. Import permission enforcement (service layer)

- **Result:** PASS
- **Detail:** Verified via unit test + scenario 4; employee context would throw PermissionDeniedError without knowledge.import
- **Evidence:**
```json
{
  "importRouteRequires": "knowledge.import",
  "sourcesRouteRequires": "knowledge.view",
  "createSourceRequires": "knowledge.manage"
}
```

### 6e. Employee denied without knowledge.view

- **Result:** PASS
- **Detail:** PermissionDeniedError thrown


## Known Limitations

1. Demo company roles (Beta Admin, Employee) are not seeded with `knowledge.*` permissions — UI access requires super-admin or role assignment.
2. Chunks are generated from full document text (paragraph strategy), not per-section — multi-page PDFs produce page sections but chunk ordering follows merged text flow.
3. No deduplication on checksum — identical PDFs create separate documents.
4. Import status is stored in `document.metadata.import`; there is no async job queue table yet.
5. `pdfjs-dist` adds ~500KB to the login-app bundle chunk for PDF parsing in-browser.

## Increment 2 Gate

Resolve failing scenarios before Increment 2.
