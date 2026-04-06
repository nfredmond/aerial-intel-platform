"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createClientSupabaseClient } from "@/lib/supabase/client";

type PrepareUploadResult =
  | {
      ok: true;
      bucket: string;
      path: string;
      token: string;
      filename: string;
      fileSizeBytes: number;
      linkedDatasetId: string | null;
      sessionLabel: string | null;
      notes: string | null;
    }
  | {
      ok: false;
      error: string;
    };

type FinalizeUploadResult =
  | {
      ok: true;
      redirectTo: string;
    }
  | {
      ok: false;
      error: string;
    };

export function BrowserZipIntakeForm(props: {
  missionName: string;
  datasets: Array<{ id: string; name: string }>;
  disabled: boolean;
  prepareUpload: (formData: FormData) => Promise<PrepareUploadResult>;
  finalizeUpload: (formData: FormData) => Promise<FinalizeUploadResult>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const supabase = useMemo(() => createClientSupabaseClient(), []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (props.disabled || isPending) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const browserZipFile = formData.get("browserZipFile");

    if (!(browserZipFile instanceof File) || browserZipFile.size <= 0 || browserZipFile.name.trim().length === 0) {
      setError("Choose a ZIP file before uploading browser intake evidence.");
      return;
    }

    setError(null);
    setStatus("Preparing signed upload…");

    startTransition(async () => {
      const prepareFormData = new FormData();
      prepareFormData.set("browserZipFilename", browserZipFile.name);
      prepareFormData.set("browserZipFileSizeBytes", String(browserZipFile.size));
      prepareFormData.set("browserZipMimeType", browserZipFile.type || "application/zip");

      const linkedDatasetId = formData.get("browserLinkedDatasetId");
      if (typeof linkedDatasetId === "string" && linkedDatasetId.trim()) {
        prepareFormData.set("browserLinkedDatasetId", linkedDatasetId.trim());
      }

      const sessionLabel = formData.get("browserSessionLabel");
      if (typeof sessionLabel === "string" && sessionLabel.trim()) {
        prepareFormData.set("browserSessionLabel", sessionLabel.trim());
      }

      const notes = formData.get("browserSessionNotes");
      if (typeof notes === "string" && notes.trim()) {
        prepareFormData.set("browserSessionNotes", notes.trim());
      }

      const prepareResult = await props.prepareUpload(prepareFormData);
      if (!prepareResult.ok) {
        setStatus(null);
        setError(prepareResult.error);
        return;
      }

      setStatus("Uploading ZIP directly to storage…");
      const uploadResult = await supabase.storage
        .from(prepareResult.bucket)
        .uploadToSignedUrl(
          prepareResult.path,
          prepareResult.token,
          browserZipFile,
          {
            contentType: browserZipFile.type || "application/zip",
          },
        );

      if (uploadResult.error) {
        setStatus(null);
        setError(uploadResult.error.message || "The ZIP could not be uploaded to storage.");
        return;
      }

      setStatus("Finalizing ingest session…");
      const finalizeFormData = new FormData();
      finalizeFormData.set("browserZipFilename", prepareResult.filename);
      finalizeFormData.set("browserZipFileSizeBytes", String(prepareResult.fileSizeBytes));
      finalizeFormData.set("browserStorageBucket", prepareResult.bucket);
      finalizeFormData.set("browserStoragePath", prepareResult.path);

      if (prepareResult.linkedDatasetId) {
        finalizeFormData.set("browserLinkedDatasetId", prepareResult.linkedDatasetId);
      }

      if (prepareResult.sessionLabel) {
        finalizeFormData.set("browserSessionLabel", prepareResult.sessionLabel);
      }

      if (prepareResult.notes) {
        finalizeFormData.set("browserSessionNotes", prepareResult.notes);
      }

      const finalizeResult = await props.finalizeUpload(finalizeFormData);
      if (!finalizeResult.ok) {
        setStatus(null);
        setError(finalizeResult.error);
        return;
      }

      setStatus("ZIP uploaded. Refreshing mission lane…");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      form.reset();
      router.push(finalizeResult.redirectTo);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="stack-sm surface-form-shell">
      <div className="stack-xs">
        <h3>Upload browser ZIP to managed intake storage</h3>
        <p className="muted">
          Upload a mission ZIP directly from the browser into protected storage, then record a truthful ingest session. This clears the browser selection gap without claiming extraction, benchmarking, or ODM orchestration already happened.
        </p>
      </div>
      <label className="stack-xs">
        <span>Mission ZIP</span>
        <input
          ref={fileInputRef}
          name="browserZipFile"
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          required
          disabled={props.disabled || isPending}
        />
      </label>
      <div className="form-grid-2">
        <label className="stack-xs">
          <span>Session label override (optional)</span>
          <input
            name="browserSessionLabel"
            type="text"
            placeholder={`${props.missionName} browser ZIP intake · mission-batch.zip`}
            disabled={props.disabled || isPending}
          />
        </label>
        <label className="stack-xs">
          <span>Linked dataset</span>
          <select name="browserLinkedDatasetId" defaultValue="" disabled={props.disabled || isPending}>
            <option value="">No linked dataset yet</option>
            {props.datasets.map((dataset) => (
              <option key={`browser-intake-${dataset.id}`} value={dataset.id}>{dataset.name}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="stack-xs">
        <span>Operator notes (optional)</span>
        <textarea
          name="browserSessionNotes"
          rows={3}
          placeholder="Capture who uploaded the ZIP, what it should contain, or what should happen next."
          disabled={props.disabled || isPending}
        />
      </label>
      {status ? <p className="muted">{status}</p> : null}
      {error ? <p className="status-text status-text--warning">{error}</p> : null}
      <button
        type="submit"
        className="button button-primary"
        disabled={props.disabled || isPending}
      >
        {isPending ? "Uploading ZIP…" : "Upload ZIP + record intake"}
      </button>
    </form>
  );
}
