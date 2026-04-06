export type BrowserZipIntakeDraft = {
  sessionLabel: string;
  sourceType: "browser_zip";
  status: "zip_received" | "zip_uploaded";
  reviewBundleReady: false;
  truthfulPass: null;
  notes: string;
  metadata: {
    intakeMode: "browser_file_picker";
    uploadPersisted: boolean;
    extractionStarted: false;
    orchestrationStarted: false;
    storagePath: string | null;
  };
};

function compactWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function isZipFilename(filename: string | null | undefined) {
  if (typeof filename !== "string") {
    return false;
  }

  return /\.zip$/i.test(filename.trim());
}

function sanitizeFilenameStem(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "mission-zip";
}

export function buildBrowserZipStoragePath(input: {
  orgSlug: string;
  missionId: string;
  filename: string;
  uploadedAt?: string;
}) {
  const orgSlug = sanitizeFilenameStem(input.orgSlug || "org");
  const missionId = sanitizeFilenameStem(input.missionId || "mission");
  const filename = compactWhitespace(input.filename) || "selected.zip";
  const uploadedAt = compactWhitespace(input.uploadedAt || new Date().toISOString());
  const timestamp = uploadedAt.replace(/[^0-9]/g, "").slice(0, 14) || "upload";
  const extension = filename.toLowerCase().endsWith(".zip") ? ".zip" : "";
  const stem = sanitizeFilenameStem(filename);

  return `${orgSlug}/mission-intake/${missionId}/${timestamp}-${stem}${extension || ".zip"}`;
}

export function buildBrowserZipIntakeDraft(input: {
  missionName: string;
  filename: string;
  uploadPersisted?: boolean;
  storagePath?: string | null;
}) : BrowserZipIntakeDraft {
  const missionName = compactWhitespace(input.missionName) || "Mission";
  const filename = compactWhitespace(input.filename) || "selected.zip";
  const uploadPersisted = input.uploadPersisted === true;
  const storagePath = typeof input.storagePath === "string" && input.storagePath.trim().length > 0
    ? input.storagePath.trim()
    : null;

  return {
    sessionLabel: `${missionName} browser ZIP intake · ${filename}`,
    sourceType: "browser_zip",
    status: uploadPersisted ? "zip_uploaded" : "zip_received",
    reviewBundleReady: false,
    truthfulPass: null,
    notes: uploadPersisted
      ? `Browser ZIP uploaded from ${filename} into managed intake storage at ${storagePath ?? "the protected drone-ops bucket"}. Extraction, benchmarking, and ODM orchestration have not run yet.`
      : `Browser ZIP evidence recorded from ${filename}. The browser selected the file, but durable upload/storage, extraction, and ODM orchestration have not run yet.`,
    metadata: {
      intakeMode: "browser_file_picker",
      uploadPersisted,
      extractionStarted: false,
      orchestrationStarted: false,
      storagePath,
    },
  };
}
