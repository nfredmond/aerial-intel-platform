export type BrowserZipIntakeDraft = {
  sessionLabel: string;
  sourceType: "browser_zip";
  status: "zip_received";
  reviewBundleReady: false;
  truthfulPass: null;
  notes: string;
  metadata: {
    intakeMode: "browser_file_picker";
    uploadPersisted: false;
    extractionStarted: false;
    orchestrationStarted: false;
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

export function buildBrowserZipIntakeDraft(input: {
  missionName: string;
  filename: string;
}) : BrowserZipIntakeDraft {
  const missionName = compactWhitespace(input.missionName) || "Mission";
  const filename = compactWhitespace(input.filename) || "selected.zip";

  return {
    sessionLabel: `${missionName} browser ZIP intake · ${filename}`,
    sourceType: "browser_zip",
    status: "zip_received",
    reviewBundleReady: false,
    truthfulPass: null,
    notes: `Browser ZIP evidence recorded from ${filename}. The browser selected the file, but durable upload/storage, extraction, and ODM orchestration have not run yet.`,
    metadata: {
      intakeMode: "browser_file_picker",
      uploadPersisted: false,
      extractionStarted: false,
      orchestrationStarted: false,
    },
  };
}
