import Link from "next/link";

import {
  selectArtifactShareLinkByToken,
  selectProcessingOutputById,
} from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/ui/datetime";
import { shareLinkStatus, validateShareLink } from "@/lib/sharing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MetadataRecord = Record<string, unknown>;

function coerceString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function describeArtifactKind(kind: string): string {
  switch (kind) {
    case "orthomosaic":
      return "Orthomosaic";
    case "dsm":
      return "Digital surface model (DSM)";
    case "dtm":
      return "Digital terrain model (DTM)";
    case "dem":
      return "Digital elevation model (DEM)";
    case "point_cloud":
      return "Point cloud";
    case "mesh":
      return "3D mesh";
    case "tiles_3d":
      return "3D tiles";
    case "report":
      return "Report";
    case "install_bundle":
      return "Install bundle";
    case "preview":
      return "Preview";
    default:
      return kind.replace(/_/g, " ");
  }
}

function describeReason(
  reason: "not_found" | "revoked" | "expired" | "exhausted" | "unavailable",
): { heading: string; body: string } {
  switch (reason) {
    case "not_found":
      return {
        heading: "Share link not found",
        body: "This link is invalid. It may have been mistyped, superseded, or was never issued.",
      };
    case "revoked":
      return {
        heading: "Share link revoked",
        body: "The team revoked this link. Contact the sender for an updated link.",
      };
    case "expired":
      return {
        heading: "Share link expired",
        body: "This link has passed its expiration time. Contact the sender for a fresh link.",
      };
    case "exhausted":
      return {
        heading: "Share link fully used",
        body: "This link has reached its download limit. Contact the sender if you need another pass.",
      };
    case "unavailable":
      return {
        heading: "Download unavailable",
        body: "The underlying artifact is no longer downloadable. Contact the sender for an updated link.",
      };
  }
}

function formatExpires(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return formatDateTime(iso);
}

function ShareShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="share-page">
      <header className="share-page__header">
        <Link href="/" className="share-page__brand">
          Nat Ford · Aerial Intel
        </Link>
      </header>
      <section className="share-page__body">{children}</section>
      <footer className="share-page__footer">
        <p>Link recipients are bound by the sender&apos;s use terms. Do not redistribute without authorization.</p>
      </footer>
    </main>
  );
}

export default async function ShareLinkLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let link: Awaited<ReturnType<typeof selectArtifactShareLinkByToken>> = null;
  try {
    link = await selectArtifactShareLinkByToken(token);
  } catch {
    link = null;
  }

  const validation = validateShareLink(link);
  if (!validation.ok) {
    const copy = describeReason(validation.reason);
    return (
      <ShareShell>
        <h1>{copy.heading}</h1>
        <p>{copy.body}</p>
      </ShareShell>
    );
  }

  const valid = validation.link;
  let artifact: Awaited<ReturnType<typeof selectProcessingOutputById>> = null;
  try {
    artifact = await selectProcessingOutputById(valid.artifact_id);
  } catch {
    artifact = null;
  }

  if (!artifact || artifact.status !== "ready" || !artifact.storage_path) {
    const copy = describeReason("unavailable");
    return (
      <ShareShell>
        <h1>{copy.heading}</h1>
        <p>{copy.body}</p>
      </ShareShell>
    );
  }

  const metadata = (artifact.metadata ?? {}) as MetadataRecord;
  const title =
    coerceString(metadata.label) ??
    coerceString(metadata.display_name) ??
    coerceString(metadata.title) ??
    describeArtifactKind(artifact.kind);
  const kindLabel = describeArtifactKind(artifact.kind);
  const fileName = coerceString(metadata.file_name) ?? coerceString(metadata.fileName);
  const expiresLabel = formatExpires(valid.expires_at);
  const status = shareLinkStatus(valid);
  const usesLeftLabel =
    valid.max_uses === null || valid.max_uses === undefined
      ? "No download limit"
      : `${Math.max(0, valid.max_uses - valid.use_count)} of ${valid.max_uses} downloads remaining`;

  return (
    <ShareShell>
      <h1>{title}</h1>
      <p className="share-page__subtitle">
        {kindLabel} · Published {formatDateTime(artifact.created_at)}
      </p>

      {valid.note ? <p className="share-page__note">{valid.note}</p> : null}

      <dl className="share-page__meta">
        <div>
          <dt>Status</dt>
          <dd>{status}</dd>
        </div>
        <div>
          <dt>Downloads</dt>
          <dd>{usesLeftLabel}</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>{expiresLabel ?? "No expiration"}</dd>
        </div>
        {fileName ? (
          <div>
            <dt>File</dt>
            <dd>{fileName}</dd>
          </div>
        ) : null}
      </dl>

      <a
        href={`/s/${encodeURIComponent(token)}/download`}
        className="share-page__download"
      >
        Download artifact
      </a>

      <p className="share-page__fine-print">
        Clicking Download counts against this link&apos;s download budget. The file streams directly from protected
        storage via a short-lived signed URL.
      </p>
    </ShareShell>
  );
}
