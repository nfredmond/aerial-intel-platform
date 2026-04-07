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
      kind: string;
      filename: string;
    }
  | {
      ok: false;
      error: string;
    };

type FinalizeImportResult =
  | {
      ok: true;
      redirectTo: string;
    }
  | {
      ok: false;
      error: string;
    };

const FILE_FIELDS = [
  { name: "benchmarkSummaryFile", kind: "benchmark_summary", label: "Benchmark summary JSON", required: true },
  { name: "runLogFile", kind: "run_log", label: "Run log" },
  { name: "reviewBundleFile", kind: "review_bundle", label: "Review bundle ZIP" },
  { name: "orthophotoFile", kind: "orthophoto", label: "Orthophoto" },
  { name: "demFile", kind: "dem", label: "DEM / DSM" },
  { name: "pointCloudFile", kind: "point_cloud", label: "Point cloud" },
  { name: "meshFile", kind: "mesh", label: "Mesh" },
] as const;

export function ManagedOutputImportForm(props: {
  disabled: boolean;
  prepareUpload: (formData: FormData) => Promise<PrepareUploadResult>;
  finalizeImport: (formData: FormData) => Promise<FinalizeImportResult>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (props.disabled || isPending) {
      return;
    }

    const form = event.currentTarget;
    const submitted = new FormData(form);
    const summaryFile = submitted.get("benchmarkSummaryFile");
    if (!(summaryFile instanceof File) || summaryFile.size <= 0) {
      setError("Choose a benchmark summary JSON file before importing managed outputs.");
      return;
    }

    setError(null);
    setStatus("Preparing upload tickets…");

    startTransition(async () => {
      const uploadedRefs: Array<{ kind: string; bucket: string; path: string }> = [];

      for (const field of FILE_FIELDS) {
        const file = submitted.get(field.name);
        if (!(file instanceof File) || file.size <= 0) {
          continue;
        }

        const prepareData = new FormData();
        prepareData.set("uploadKind", field.kind);
        prepareData.set("uploadFilename", file.name);

        const prepareResult = await props.prepareUpload(prepareData);
        if (!prepareResult.ok) {
          setStatus(null);
          setError(prepareResult.error);
          return;
        }

        setStatus(`Uploading ${field.label.toLowerCase()}…`);
        const uploadResult = await supabase.storage
          .from(prepareResult.bucket)
          .uploadToSignedUrl(prepareResult.path, prepareResult.token, file, {
            contentType: file.type || undefined,
          });

        if (uploadResult.error) {
          setStatus(null);
          setError(uploadResult.error.message || `The ${field.label.toLowerCase()} upload failed.`);
          return;
        }

        uploadedRefs.push({
          kind: prepareResult.kind,
          bucket: prepareResult.bucket,
          path: prepareResult.path,
        });
      }

      setStatus("Finalizing managed import…");
      const finalizeData = new FormData();
      const notes = submitted.get("operatorNotes");
      if (typeof notes === "string" && notes.trim()) {
        finalizeData.set("operatorNotes", notes.trim());
      }

      for (const ref of uploadedRefs) {
        finalizeData.set(`${ref.kind}Bucket`, ref.bucket);
        finalizeData.set(`${ref.kind}Path`, ref.path);
      }

      const finalizeResult = await props.finalizeImport(finalizeData);
      if (!finalizeResult.ok) {
        setStatus(null);
        setError(finalizeResult.error);
        return;
      }

      setStatus("Managed import attached. Refreshing job lane…");
      formRef.current?.reset();
      router.push(finalizeResult.redirectTo);
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="stack-sm surface-form-shell">
      <div className="stack-xs">
        <h3>Import real outputs + delivery evidence</h3>
        <p className="muted">
          Upload benchmark evidence and any delivered artifacts directly from the browser, then attach them to this managed request without the shell-only import script.
        </p>
      </div>

      <div className="form-grid-2">
        <label className="stack-xs">
          <span>Benchmark summary JSON</span>
          <input name="benchmarkSummaryFile" type="file" accept=".json,application/json" required disabled={props.disabled || isPending} />
        </label>
        <label className="stack-xs">
          <span>Run log (optional)</span>
          <input name="runLogFile" type="file" accept=".log,.txt,text/plain" disabled={props.disabled || isPending} />
        </label>
      </div>

      <div className="form-grid-2">
        <label className="stack-xs">
          <span>Review bundle ZIP (optional)</span>
          <input name="reviewBundleFile" type="file" accept=".zip,application/zip,application/x-zip-compressed" disabled={props.disabled || isPending} />
        </label>
        <label className="stack-xs">
          <span>Orthophoto (optional)</span>
          <input name="orthophotoFile" type="file" accept=".tif,.tiff,image/tiff" disabled={props.disabled || isPending} />
        </label>
      </div>

      <div className="form-grid-2">
        <label className="stack-xs">
          <span>DEM / DSM (optional)</span>
          <input name="demFile" type="file" accept=".tif,.tiff,image/tiff" disabled={props.disabled || isPending} />
        </label>
        <label className="stack-xs">
          <span>Point cloud (optional)</span>
          <input name="pointCloudFile" type="file" accept=".laz,.ply" disabled={props.disabled || isPending} />
        </label>
      </div>

      <label className="stack-xs">
        <span>Mesh (optional)</span>
        <input name="meshFile" type="file" accept=".obj,.glb,.gltf" disabled={props.disabled || isPending} />
      </label>

      <label className="stack-xs">
        <span>Operator notes (optional)</span>
        <textarea
          name="operatorNotes"
          rows={3}
          placeholder="Capture what was imported, what still needs QA, or any delivery caveats."
          disabled={props.disabled || isPending}
        />
      </label>

      {status ? <p className="muted">{status}</p> : null}
      {error ? <p className="status-text status-text--warning">{error}</p> : null}

      <button type="submit" className="button button-primary" disabled={props.disabled || isPending}>
        {isPending ? "Importing managed evidence…" : "Import outputs + evidence"}
      </button>
    </form>
  );
}
