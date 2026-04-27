import assert from "node:assert/strict";
import { mergeAdditionalDocumentUrls } from "../lib/documents/additional-documents";

const formData: {
  additionalDocuments: Array<{
    id: string;
    name: string;
    category: string;
    description: string;
    file: null;
    url?: string;
  }>;
} = {
  additionalDocuments: [
    {
      id: "other_123",
      name: "Gitarama Map",
      category: "other",
      description: "",
      file: null,
    },
    {
      id: "other_456",
      name: "Signed Application form",
      category: "other",
      description: "",
      file: null,
    },
  ],
};

const merged = mergeAdditionalDocumentUrls(formData, [
  {
    id: "doc-db-1",
    name: "Gitarama Map",
    type: "other",
    file_path: "application-documents/app-1/additional_other_123-1774483683000.pdf",
  },
  {
    id: "doc-db-2",
    name: "Signed Application form",
    type: "other",
    file_path: "application-documents/app-1/additional_other_456-1774483683001.pdf",
  },
], (path) => `https://storage.example/${path}`);

assert.equal(merged, formData, "helper should mutate and return the provided form data object");
assert.equal(formData.additionalDocuments[0].url, "https://storage.example/application-documents/app-1/additional_other_123-1774483683000.pdf");
assert.equal(formData.additionalDocuments[1].url, "https://storage.example/application-documents/app-1/additional_other_456-1774483683001.pdf");
assert.equal(formData.additionalDocuments[0].file, null);
assert.equal(formData.additionalDocuments[1].file, null);

const appended = mergeAdditionalDocumentUrls({ additionalDocuments: [] }, [
  {
    id: "doc-db-3",
    name: "Untracked additional doc",
    type: "other",
    file_path: "application-documents/app-1/additional_other_789-1774483683002.pdf",
  },
], (path) => `https://storage.example/${path}`);

assert.equal(appended.additionalDocuments.length, 1);
assert.equal(appended.additionalDocuments[0].id, "other_789");
assert.equal(appended.additionalDocuments[0].category, "other");
assert.equal(appended.additionalDocuments[0].url, "https://storage.example/application-documents/app-1/additional_other_789-1774483683002.pdf");

const currentWins = mergeAdditionalDocumentUrls({
  additionalDocuments: [
    {
      id: "other_999",
      name: "Replacement Map",
      category: "other",
      description: "",
      file: null,
      url: "https://storage.example/stale-url.pdf",
    },
  ],
}, [
  {
    id: "current-doc",
    name: "Replacement Map",
    type: "other",
    file_path: "application-documents/current/additional_other_999-1774483683003.pdf",
  },
  {
    id: "original-doc",
    name: "Replacement Map",
    type: "other",
    file_path: "application-documents/original/additional_other_999-1774483683000.pdf",
  },
], (path) => `https://storage.example/${path}`);

assert.equal(
  currentWins.additionalDocuments[0].url,
  "https://storage.example/application-documents/current/additional_other_999-1774483683003.pdf"
);

const orphanActivityDoc = mergeAdditionalDocumentUrls({ additionalDocuments: [] }, [
  {
    id: "doc-db-4",
    name: "Irrigation Map",
    type: "other",
    file_path: "application-documents/app-1/additional_irrigation_789-1774483683004.pdf",
  },
  {
    id: "doc-db-5",
    name: "Industry Attachment",
    type: "other",
    file_path: "application-documents/app-1/additional_industry_789-1774483683005.pdf",
  },
], (path) => `https://storage.example/${path}`);

assert.equal(orphanActivityDoc.additionalDocuments[0].category, "irrigation");
assert.equal(orphanActivityDoc.additionalDocuments[1].category, "industrial");

console.log("additional document merge tests passed");
