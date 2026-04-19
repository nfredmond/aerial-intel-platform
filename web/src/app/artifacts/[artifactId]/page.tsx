import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { SignOutForm } from "@/app/dashboard/sign-out-form";
import { SupportContextCopyButton } from "@/app/dashboard/support-context-copy-button";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import {
  buildArtifactExportPacket,
  buildArtifactShareSummary,
  getArtifactHandoff,
  type ArtifactHandoffStage,
  updateArtifactHandoffMetadata,
} from "@/lib/artifact-handoff";
import {
  getBenchmarkOutputForArtifact,
  getBenchmarkSummaryView,
} from "@/lib/benchmark-summary";
import { getArtifactDetail, getString } from "@/lib/missions/detail-data";
import { tryCreateSignedDownloadUrl } from "@/lib/storage-delivery";
import {
  computeExpiresAt,
  generateShareToken,
  parseExpiresInHoursInput,
  parseMaxUsesInput,
  shareLinkStatus,
} from "@/lib/sharing";
import {
  insertArtifactApproval,
  insertArtifactComment,
  insertArtifactShareLink,
  insertJobEvent,
  selectArtifactApprovalsByArtifact,
  selectArtifactCommentsByArtifact,
  selectArtifactShareLinksByArtifact,
  updateArtifactComment,
  updateArtifactShareLink,
  updateProcessingOutput,
  type ArtifactApprovalDecision,
} from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/ui/datetime";
import { statusPillClassName, type Tone } from "@/lib/ui/tones";

function statusClass(status: string) {
  const tone: Tone =
    status === "running" || status === "pending"
      ? "info"
      : status === "succeeded" || status === "ready"
        ? "success"
        : "warning";
  return statusPillClassName(tone);
}

function handoffClass(stage: ArtifactHandoffStage) {
  const tone: Tone =
    stage === "reviewed" || stage === "shared" || stage === "exported"
      ? "success"
      : "warning";
  return statusPillClassName(tone);
}

type StageChecklistItem = {
  label: string;
  status: string;
};

function getStageChecklist(summary: Record<string, unknown>) {
  if (!Array.isArray(summary.stageChecklist)) {
    return [] as StageChecklistItem[];
  }

  return summary.stageChecklist.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const label = typeof item.label === "string" ? item.label : "Unnamed stage";
    const status = typeof item.status === "string" ? item.status : "pending";
    return [{ label, status }];
  });
}

function getChecklistStatusClass(status: string) {
  const tone: Tone =
    status === "complete" ? "success" : status === "running" ? "info" : "warning";
  return statusPillClassName(tone);
}

function getCalloutMessage(action?: string) {
  switch (action) {
    case "reviewed":
      return {
        tone: "success",
        text: "Artifact marked reviewed. The handoff trail now records review timing and the next action.",
      } as const;
    case "shared":
      return {
        tone: "success",
        text: "Artifact marked shared. The handoff trail now records a client/ops share checkpoint.",
      } as const;
    case "exported":
      return {
        tone: "success",
        text: "Artifact marked exported. Final delivery traceability is now recorded on this artifact.",
      } as const;
    case "note-saved":
      return {
        tone: "success",
        text: "Artifact handoff note saved. The delivery trail now includes reviewer context and the updated next action.",
      } as const;
    case "not-ready":
      return {
        tone: "error",
        text: "Only ready artifacts can be marked reviewed, shared, or exported.",
      } as const;
    case "denied":
      return {
        tone: "error",
        text: "Viewer access cannot update artifact handoff state.",
      } as const;
    case "share-link-issued":
      return {
        tone: "success",
        text: "Share link issued. Copy the full URL below and send it to the recipient.",
      } as const;
    case "share-link-revoked":
      return {
        tone: "success",
        text: "Share link revoked. It will no longer grant access, even with the token.",
      } as const;
    case "comment-added":
      return {
        tone: "success",
        text: "Comment posted. Reviewers can see the thread on this artifact now.",
      } as const;
    case "comment-resolved":
      return {
        tone: "success",
        text: "Comment thread marked resolved.",
      } as const;
    case "approved":
      return {
        tone: "success",
        text: "Approval recorded. This artifact is now cleared for export.",
      } as const;
    case "changes-requested":
      return {
        tone: "success",
        text: "Changes-requested decision recorded. Export stays blocked until a new approval is entered.",
      } as const;
    case "needs-approval":
      return {
        tone: "error",
        text: "Artifact export is gated on at least one reviewer approval. Record one in the Approvals panel first.",
      } as const;
    case "comment-empty":
      return {
        tone: "error",
        text: "Cannot post an empty comment.",
      } as const;
    case "error":
      return {
        tone: "error",
        text: "Artifact handoff state could not be updated. Check server configuration and try again.",
      } as const;
    default:
      return null;
  }
}

export default async function ArtifactDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ artifactId: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const access = await getDroneOpsAccess();

  if (!access.user) {
    redirect("/sign-in");
  }

  if (!access.hasMembership || !access.hasActiveEntitlement) {
    return <BlockedAccessView access={access} />;
  }

  const { artifactId } = await params;
  const resolvedSearchParams = await searchParams;
  const detail = await getArtifactDetail(access, artifactId);

  if (!detail) {
    notFound();
  }

  async function updateArtifactState(targetAction: "reviewed" | "shared" | "exported") {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect(`/artifacts/${artifactId}?action=denied`);
    }

    const refreshedDetail = await getArtifactDetail(refreshedAccess, artifactId);
    if (!refreshedDetail) {
      redirect("/missions");
    }

    if (refreshedDetail.output.status !== "ready") {
      redirect(`/artifacts/${artifactId}?action=not-ready`);
    }

    if (targetAction === "exported") {
      const existingApprovals = await selectArtifactApprovalsByArtifact(artifactId).catch(() => []);
      const latestApproval = existingApprovals[0];
      if (!latestApproval || latestApproval.decision !== "approved") {
        redirect(`/artifacts/${artifactId}?action=needs-approval`);
      }
    }

    const currentHandoff = getArtifactHandoff(refreshedDetail.metadata);
    const actorEmail = refreshedAccess.user.email ?? null;
    const now = new Date().toISOString();

    const nextMetadata = updateArtifactHandoffMetadata(refreshedDetail.metadata, {
      reviewedAt: currentHandoff.reviewedAt ?? now,
      reviewedByEmail: currentHandoff.reviewedByEmail ?? actorEmail,
      sharedAt: targetAction === "shared" || targetAction === "exported" ? currentHandoff.sharedAt ?? now : undefined,
      sharedByEmail:
        targetAction === "shared" || targetAction === "exported"
          ? currentHandoff.sharedByEmail ?? actorEmail
          : undefined,
      exportedAt: targetAction === "exported" ? currentHandoff.exportedAt ?? now : undefined,
      exportedByEmail: targetAction === "exported" ? currentHandoff.exportedByEmail ?? actorEmail : undefined,
      note:
        targetAction === "exported"
          ? "Final export/delivery checkpoint recorded from artifact detail page."
          : targetAction === "shared"
            ? "Artifact share checkpoint recorded from artifact detail page."
            : "Artifact reviewed from artifact detail page.",
    });

    try {
      await updateProcessingOutput(refreshedDetail.output.id, {
        metadata: nextMetadata,
      });

      await insertJobEvent({
        org_id: refreshedAccess.org.id,
        job_id: refreshedDetail.output.job_id,
        event_type:
          targetAction === "reviewed"
            ? "artifact.reviewed"
            : targetAction === "shared"
              ? "artifact.shared"
              : "artifact.exported",
        payload: {
          title:
            targetAction === "reviewed"
              ? "Artifact reviewed"
              : targetAction === "shared"
                ? "Artifact shared"
                : "Artifact exported",
          detail:
            targetAction === "reviewed"
              ? `${getString(refreshedDetail.metadata.name, refreshedDetail.output.kind.replaceAll("_", " "))} was marked reviewed from the artifact detail page.`
              : targetAction === "shared"
                ? `${getString(refreshedDetail.metadata.name, refreshedDetail.output.kind.replaceAll("_", " "))} was marked shared from the artifact detail page.`
                : `${getString(refreshedDetail.metadata.name, refreshedDetail.output.kind.replaceAll("_", " "))} was marked exported from the artifact detail page.`,
        },
      });
    } catch {
      redirect(`/artifacts/${artifactId}?action=error`);
    }

    redirect(`/artifacts/${artifactId}?action=${targetAction}`);
  }

  async function saveHandoffNote(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect(`/artifacts/${artifactId}?action=denied`);
    }

    const refreshedDetail = await getArtifactDetail(refreshedAccess, artifactId);
    if (!refreshedDetail) {
      redirect("/missions");
    }

    const noteValue = formData.get("handoffNote");
    const nextActionValue = formData.get("handoffNextAction");
    const handoffNote = typeof noteValue === "string" && noteValue.trim().length > 0 ? noteValue.trim() : null;
    const handoffNextAction = typeof nextActionValue === "string" && nextActionValue.trim().length > 0 ? nextActionValue.trim() : null;
    const artifactLabel = getString(refreshedDetail.metadata.name, refreshedDetail.output.kind.replaceAll("_", " "));

    const nextMetadata = updateArtifactHandoffMetadata(refreshedDetail.metadata, {
      note: handoffNote,
      nextAction: handoffNextAction,
    });

    try {
      await updateProcessingOutput(refreshedDetail.output.id, {
        metadata: nextMetadata,
      });

      await insertJobEvent({
        org_id: refreshedAccess.org.id,
        job_id: refreshedDetail.output.job_id,
        event_type: "artifact.note.updated",
        payload: {
          title: "Artifact handoff note updated",
          detail: handoffNote
            ? `${artifactLabel} handoff note updated from the artifact detail page: ${handoffNote}`
            : `${artifactLabel} handoff note was cleared from the artifact detail page.`,
        },
      });
    } catch {
      redirect(`/artifacts/${artifactId}?action=error`);
    }

    redirect(`/artifacts/${artifactId}?action=note-saved`);
  }

  async function createShareLinkAction(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }
    if (
      !refreshedAccess.org?.id ||
      !refreshedAccess.hasMembership ||
      !refreshedAccess.hasActiveEntitlement
    ) {
      redirect("/dashboard");
    }
    if (refreshedAccess.role === "viewer") {
      redirect(`/artifacts/${artifactId}?action=denied`);
    }

    const refreshedDetail = await getArtifactDetail(refreshedAccess, artifactId);
    if (!refreshedDetail) {
      redirect("/missions");
    }
    if (refreshedDetail.output.status !== "ready") {
      redirect(`/artifacts/${artifactId}?action=not-ready`);
    }

    const rawNote = formData.get("shareNote");
    const rawExpires = formData.get("shareExpiresInHours");
    const rawMaxUses = formData.get("shareMaxUses");
    const note = typeof rawNote === "string" && rawNote.trim() ? rawNote.trim() : null;
    const expiresInHours = parseExpiresInHoursInput(typeof rawExpires === "string" ? rawExpires : null);
    const maxUses = parseMaxUsesInput(typeof rawMaxUses === "string" ? rawMaxUses : null);
    const expiresAt = computeExpiresAt(expiresInHours);
    const token = generateShareToken();

    try {
      const link = await insertArtifactShareLink({
        org_id: refreshedAccess.org.id,
        artifact_id: refreshedDetail.output.id,
        token,
        note,
        max_uses: maxUses,
        expires_at: expiresAt,
        created_by: refreshedAccess.user.id,
      });

      if (link) {
        await insertJobEvent({
          org_id: refreshedAccess.org.id,
          job_id: refreshedDetail.output.job_id,
          event_type: "artifact.share_link.issued",
          payload: {
            title: "Artifact share link issued",
            detail: `Share link issued for ${getString(
              refreshedDetail.metadata.name,
              refreshedDetail.output.kind.replaceAll("_", " "),
            )}${expiresAt ? ` with expiry ${expiresAt}` : ""}${maxUses ? ` (max ${maxUses} uses)` : ""}${note ? `: ${note}` : "."}`,
            linkId: link.id,
          },
        }).catch(() => undefined);
      }
    } catch {
      redirect(`/artifacts/${artifactId}?action=error`);
    }

    redirect(`/artifacts/${artifactId}?action=share-link-issued`);
  }

  async function revokeShareLinkAction(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }
    if (
      !refreshedAccess.org?.id ||
      !refreshedAccess.hasMembership ||
      !refreshedAccess.hasActiveEntitlement
    ) {
      redirect("/dashboard");
    }
    if (refreshedAccess.role === "viewer") {
      redirect(`/artifacts/${artifactId}?action=denied`);
    }

    const rawId = formData.get("linkId");
    const linkId = typeof rawId === "string" ? rawId.trim() : "";
    if (!linkId) {
      redirect(`/artifacts/${artifactId}?action=error`);
    }

    const refreshedDetail = await getArtifactDetail(refreshedAccess, artifactId);
    if (!refreshedDetail) {
      redirect("/missions");
    }

    try {
      await updateArtifactShareLink(linkId, { revoked_at: new Date().toISOString() });

      await insertJobEvent({
        org_id: refreshedAccess.org.id,
        job_id: refreshedDetail.output.job_id,
        event_type: "artifact.share_link.revoked",
        payload: {
          title: "Artifact share link revoked",
          detail: `Share link ${linkId} was revoked.`,
          linkId,
        },
      }).catch(() => undefined);
    } catch {
      redirect(`/artifacts/${artifactId}?action=error`);
    }

    redirect(`/artifacts/${artifactId}?action=share-link-revoked`);
  }

  async function postCommentAction(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) redirect("/sign-in");
    if (
      !refreshedAccess.org?.id ||
      !refreshedAccess.hasMembership ||
      !refreshedAccess.hasActiveEntitlement
    ) {
      redirect("/dashboard");
    }
    if (refreshedAccess.role === "viewer") {
      redirect(`/artifacts/${artifactId}?action=denied`);
    }

    const refreshedDetail = await getArtifactDetail(refreshedAccess, artifactId);
    if (!refreshedDetail) redirect("/missions");

    const rawBody = formData.get("commentBody");
    const body = typeof rawBody === "string" ? rawBody.trim() : "";
    if (body.length === 0) {
      redirect(`/artifacts/${artifactId}?action=comment-empty`);
    }
    const rawParent = formData.get("parentId");
    const parentId = typeof rawParent === "string" && rawParent.trim() ? rawParent.trim() : null;

    try {
      const comment = await insertArtifactComment({
        org_id: refreshedAccess.org.id,
        artifact_id: refreshedDetail.output.id,
        parent_id: parentId,
        author_user_id: refreshedAccess.user.id,
        author_email: refreshedAccess.user.email ?? null,
        body,
      });

      if (comment) {
        await insertJobEvent({
          org_id: refreshedAccess.org.id,
          job_id: refreshedDetail.output.job_id,
          event_type: "artifact.comment.posted",
          payload: {
            title: "Artifact comment posted",
            detail: `${refreshedAccess.user.email ?? "A reviewer"} posted a comment on ${getString(
              refreshedDetail.metadata.name,
              refreshedDetail.output.kind.replaceAll("_", " "),
            )}: ${body.length > 200 ? `${body.slice(0, 200)}…` : body}`,
            commentId: comment.id,
          },
        }).catch(() => undefined);
      }
    } catch {
      redirect(`/artifacts/${artifactId}?action=error`);
    }

    redirect(`/artifacts/${artifactId}?action=comment-added`);
  }

  async function resolveCommentAction(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) redirect("/sign-in");
    if (
      !refreshedAccess.org?.id ||
      !refreshedAccess.hasMembership ||
      !refreshedAccess.hasActiveEntitlement
    ) {
      redirect("/dashboard");
    }
    if (refreshedAccess.role === "viewer") {
      redirect(`/artifacts/${artifactId}?action=denied`);
    }

    const rawId = formData.get("commentId");
    const commentId = typeof rawId === "string" ? rawId.trim() : "";
    if (!commentId) redirect(`/artifacts/${artifactId}?action=error`);

    try {
      await updateArtifactComment(commentId, { resolved_at: new Date().toISOString() });
    } catch {
      redirect(`/artifacts/${artifactId}?action=error`);
    }

    redirect(`/artifacts/${artifactId}?action=comment-resolved`);
  }

  async function recordApprovalAction(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) redirect("/sign-in");
    if (
      !refreshedAccess.org?.id ||
      !refreshedAccess.hasMembership ||
      !refreshedAccess.hasActiveEntitlement
    ) {
      redirect("/dashboard");
    }
    if (refreshedAccess.role === "viewer") {
      redirect(`/artifacts/${artifactId}?action=denied`);
    }

    const refreshedDetail = await getArtifactDetail(refreshedAccess, artifactId);
    if (!refreshedDetail) redirect("/missions");

    const rawDecision = formData.get("decision");
    const decision: ArtifactApprovalDecision =
      rawDecision === "approved"
        ? "approved"
        : rawDecision === "changes_requested"
          ? "changes_requested"
          : "approved";
    const rawNote = formData.get("approvalNote");
    const note = typeof rawNote === "string" && rawNote.trim() ? rawNote.trim() : null;

    try {
      const approval = await insertArtifactApproval({
        org_id: refreshedAccess.org.id,
        artifact_id: refreshedDetail.output.id,
        reviewer_user_id: refreshedAccess.user.id,
        reviewer_email: refreshedAccess.user.email ?? null,
        decision,
        note,
      });

      if (approval) {
        await insertJobEvent({
          org_id: refreshedAccess.org.id,
          job_id: refreshedDetail.output.job_id,
          event_type:
            decision === "approved"
              ? "artifact.approval.approved"
              : "artifact.approval.changes_requested",
          payload: {
            title:
              decision === "approved"
                ? "Artifact approved for export"
                : "Artifact approval: changes requested",
            detail: `${refreshedAccess.user.email ?? "Reviewer"} recorded decision "${decision}" on ${getString(
              refreshedDetail.metadata.name,
              refreshedDetail.output.kind.replaceAll("_", " "),
            )}${note ? `: ${note}` : "."}`,
            approvalId: approval.id,
          },
        }).catch(() => undefined);
      }
    } catch {
      redirect(`/artifacts/${artifactId}?action=error`);
    }

    redirect(
      `/artifacts/${artifactId}?action=${decision === "approved" ? "approved" : "changes-requested"}`,
    );
  }

  const artifactName = getString(detail.metadata.name, detail.output.kind.replaceAll("_", " "));
  const storagePath = detail.output.storage_path ?? "Storage path pending";
  const benchmarkSummary = getBenchmarkSummaryView(detail.outputSummary.benchmarkSummary ?? detail.outputSummary);
  const benchmarkOutput = getBenchmarkOutputForArtifact(benchmarkSummary, detail.output.kind);
  const latestCheckpoint = getString(detail.outputSummary.latestCheckpoint, "No checkpoint recorded yet.");
  const stageChecklist = getStageChecklist(detail.outputSummary);
  const handoff = getArtifactHandoff(detail.metadata);
  const artifactDownloadUrl = await tryCreateSignedDownloadUrl({
    bucket: detail.output.storage_bucket,
    path: detail.output.storage_path,
    download: artifactName,
  });
  const exportPacket = buildArtifactExportPacket({
    artifactName,
    artifactKind: detail.output.kind,
    artifactStatus: detail.output.status,
    artifactFormat: getString(detail.metadata.format, "Derived artifact"),
    missionName: detail.mission?.name,
    projectName: detail.project?.name,
    datasetName: detail.dataset?.name,
    storagePath,
    deliveryNote: getString(detail.metadata.delivery, "Delivery note pending"),
    handoff,
  });

  const shareSummary = buildArtifactShareSummary({
    artifactName,
    missionName: detail.mission?.name,
    projectName: detail.project?.name,
    status: detail.output.status,
    storagePath,
    handoffStageLabel: handoff.stageLabel,
    handoffNote: handoff.note,
  });
  const shareLinks = await selectArtifactShareLinksByArtifact(detail.output.id).catch(() => []);
  const comments = await selectArtifactCommentsByArtifact(detail.output.id).catch(() => []);
  const approvals = await selectArtifactApprovalsByArtifact(detail.output.id).catch(() => []);
  const latestApproval = approvals[0] ?? null;
  const hasApprovedApproval = Boolean(latestApproval && latestApproval.decision === "approved");
  const callout = getCalloutMessage(resolvedSearchParams.action);

  return (
    <main className="app-shell stack-md">
      <section className="surface section-header">
        <div className="stack-sm">
          <p className="eyebrow">Artifact detail</p>
          <h1>{artifactName}</h1>
          <p className="muted">
            {detail.project?.name ?? "Project pending"}
            {detail.mission ? ` · ${detail.mission.name}` : ""}
            {detail.job ? ` · ${detail.job.engine}` : ""}
          </p>
        </div>

        <div className="header-actions">
          <Link href={detail.mission ? `/missions/${detail.mission.id}` : "/missions"} className="button button-secondary">
            Back to mission
          </Link>
          {detail.job ? (
            <Link href={`/jobs/${detail.job.id}`} className="button button-secondary">
              View job
            </Link>
          ) : null}
          <SignOutForm label="Sign out" variant="secondary" />
        </div>
      </section>

      {callout ? (
        <section className={callout.tone === "success" ? "callout callout-success" : "callout callout-error"}>
          {callout.text}
        </section>
      ) : null}

      <section className="detail-grid">
        <article className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Artifact summary</p>
            <h2>Review and delivery context</h2>
          </div>

          <dl className="mission-meta-grid">
            <div className="kv-row">
              <dt>Status</dt>
              <dd><span className={statusClass(detail.output.status)}>{detail.output.status}</span></dd>
            </div>
            <div className="kv-row">
              <dt>Kind</dt>
              <dd>{detail.output.kind.replaceAll("_", " ")}</dd>
            </div>
            <div className="kv-row">
              <dt>Format</dt>
              <dd>{getString(detail.metadata.format, "Derived artifact")}</dd>
            </div>
            <div className="kv-row">
              <dt>Delivery</dt>
              <dd>{getString(detail.metadata.delivery, "Delivery note pending")}</dd>
            </div>
            <div className="kv-row">
              <dt>Handoff stage</dt>
              <dd><span className={handoffClass(handoff.stage)}>{handoff.stageLabel}</span></dd>
            </div>
            <div className="kv-row">
              <dt>Bucket</dt>
              <dd>{detail.output.storage_bucket ?? "Storage bucket pending"}</dd>
            </div>
            <div className="kv-row mission-meta-grid__wide">
              <dt>Storage path</dt>
              <dd>{storagePath}</dd>
            </div>
            <div className="kv-row">
              <dt>Created</dt>
              <dd>{formatDateTime(detail.output.created_at)}</dd>
            </div>
            <div className="kv-row">
              <dt>Updated</dt>
              <dd>{formatDateTime(detail.output.updated_at)}</dd>
            </div>
          </dl>
        </article>

        <aside className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Handoff controls</p>
            <h2>Record review, share, and export</h2>
            <p className="muted">
              This artifact surface now records a real handoff audit trail and issues signed downloads whenever the file has actually been published into protected storage.
            </p>
          </div>

          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Current stage</dt>
              <dd>{handoff.stageLabel}</dd>
            </div>
            <div className="kv-row">
              <dt>Reviewed</dt>
              <dd>{handoff.reviewedAt ? formatDateTime(handoff.reviewedAt) : "Not recorded"}</dd>
            </div>
            <div className="kv-row">
              <dt>Shared</dt>
              <dd>{handoff.sharedAt ? formatDateTime(handoff.sharedAt) : "Not recorded"}</dd>
            </div>
            <div className="kv-row">
              <dt>Exported</dt>
              <dd>{handoff.exportedAt ? formatDateTime(handoff.exportedAt) : "Not recorded"}</dd>
            </div>
            <div className="kv-row mission-meta-grid__wide">
              <dt>Next action</dt>
              <dd>{handoff.nextAction}</dd>
            </div>
          </dl>

          <div className="stack-xs surface-form-shell">
            <h3>Update handoff state</h3>
            <form action={updateArtifactState.bind(null, "reviewed")}>
              <button type="submit" className="button button-secondary" disabled={access.role === "viewer" || detail.output.status !== "ready"}>
                Mark reviewed
              </button>
            </form>
            <form action={updateArtifactState.bind(null, "shared")}>
              <button type="submit" className="button button-secondary" disabled={access.role === "viewer" || detail.output.status !== "ready"}>
                Mark shared
              </button>
            </form>
            <form action={updateArtifactState.bind(null, "exported")}>
              <button
                type="submit"
                className="button button-secondary"
                disabled={
                  access.role === "viewer" ||
                  detail.output.status !== "ready" ||
                  !hasApprovedApproval
                }
              >
                Mark exported
              </button>
            </form>
            {detail.output.status !== "ready" ? (
              <p className="muted">Artifact handoff actions unlock once the artifact itself is ready.</p>
            ) : !hasApprovedApproval ? (
              <p className="muted">Export is blocked until a reviewer approves this artifact below.</p>
            ) : null}
          </div>

          <div className="stack-xs surface-form-shell">
            <h3>Handoff notes</h3>
            <form action={saveHandoffNote} className="stack-sm">
              <label className="stack-xs">
                <span>Reviewer / delivery note</span>
                <textarea
                  name="handoffNote"
                  defaultValue={handoff.note ?? ""}
                  placeholder="Capture review findings, client-safe caveats, or delivery context."
                  rows={4}
                  disabled={access.role === "viewer"}
                />
              </label>
              <label className="stack-xs">
                <span>Next action override</span>
                <input
                  name="handoffNextAction"
                  type="text"
                  defaultValue={handoff.nextAction}
                  placeholder="Optional custom next step for this artifact."
                  disabled={access.role === "viewer"}
                />
              </label>
              <button type="submit" className="button button-secondary" disabled={access.role === "viewer"}>
                Save handoff note
              </button>
            </form>
          </div>

          <div className="stack-sm">
            {artifactDownloadUrl ? (
              <a href={artifactDownloadUrl} className="button button-primary" target="_blank" rel="noreferrer">
                Download artifact
              </a>
            ) : (
              <p className="muted">Protected download is not available yet for this artifact. Use the storage path and delivery notes until the file is published.</p>
            )}
            <SupportContextCopyButton
              text={shareSummary}
              buttonLabel="Copy share summary"
              successMessage="Share summary copied. Paste it into chat, email, or a client handoff note."
              fallbackAriaLabel="Share summary text"
              fallbackHintMessage="Press Ctrl/Cmd+C, then paste this share summary into chat, docs, or email."
            />
            <SupportContextCopyButton
              text={exportPacket}
              buttonLabel="Copy export packet"
              successMessage="Export packet copied. Paste it into an ops note, ticket, or delivery checklist."
              fallbackAriaLabel="Export packet text"
              fallbackHintMessage="Press Ctrl/Cmd+C, then paste this export packet into docs, tickets, or a delivery note."
            />
          </div>
        </aside>
      </section>

      <section className="grid-cards">
        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Source context</p>
            <h2>Mission and dataset linkage</h2>
          </div>
          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Mission</dt>
              <dd>{detail.mission?.name ?? "No mission linked"}</dd>
            </div>
            <div className="kv-row">
              <dt>Site</dt>
              <dd>{detail.site?.name ?? "No site linked"}</dd>
            </div>
            <div className="kv-row">
              <dt>Dataset</dt>
              <dd>{detail.dataset?.name ?? "No dataset linked"}</dd>
            </div>
            <div className="kv-row">
              <dt>Job stage</dt>
              <dd>{detail.job?.stage ?? "No job linked"}</dd>
            </div>
            <div className="kv-row">
              <dt>ETA</dt>
              <dd>{getString(detail.outputSummary.eta, "Pending")}</dd>
            </div>
          </dl>
        </article>

        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Job notes</p>
            <h2>Current processing context</h2>
          </div>
          <p className="muted">{getString(detail.outputSummary.notes, "No job notes recorded yet.")}</p>
          <p className="muted">Latest checkpoint: {latestCheckpoint}</p>
          <p className="muted">{handoff.note ?? "No artifact-specific handoff note recorded yet."}</p>
        </article>
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Processing checkpoints</p>
          <h2>Stage checklist</h2>
          <p className="muted">
            This artifact inherits the current proving checklist from its source job so reviewers can see whether the run is still active or fully assembled.
          </p>
        </div>
        {stageChecklist.length > 0 ? (
          <div className="stack-xs">
            {stageChecklist.map((item) => (
              <article key={`${item.label}-${item.status}`} className="ops-list-card">
                <div className="ops-list-card-header">
                  <strong>{item.label}</strong>
                  <span className={getChecklistStatusClass(item.status)}>{item.status}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">No proving stage checklist has been recorded for the source job yet.</p>
        )}
      </section>

      <section className="grid-cards">
      </section>

      {benchmarkSummary ? (
        <section className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Benchmark linkage</p>
            <h2>Evidence from imported ODM benchmark</h2>
            <p className="muted">
              This artifact is linked to benchmark evidence when available, so reviewers can see whether the source run actually emitted a real file and what QA posture it had.
            </p>
          </div>

          <div className="grid-cards">
            <article className="surface-form-shell stack-sm">
              <dl className="mission-meta-grid">
                <div className="kv-row">
                  <dt>Benchmark project</dt>
                  <dd>{benchmarkSummary.projectName}</dd>
                </div>
                <div className="kv-row">
                  <dt>Run status</dt>
                  <dd>
                    <span className={statusClass(benchmarkSummary.status)}>{benchmarkSummary.status}</span>
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>QA gate</dt>
                  <dd>
                    <span className={benchmarkSummary.minimumPass ? "status-pill status-pill--success" : "status-pill status-pill--warning"}>
                      {benchmarkSummary.minimumPass ? "Minimum pass" : "Needs review"}
                    </span>
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Duration</dt>
                  <dd>{benchmarkSummary.durationSeconds} sec</dd>
                </div>
                <div className="kv-row mission-meta-grid__wide">
                  <dt>Run log</dt>
                  <dd>{benchmarkSummary.runLog}</dd>
                </div>
              </dl>
            </article>

            <article className="surface-form-shell stack-sm">
              <div className="stack-xs">
                <h3>Artifact-specific benchmark output</h3>
              </div>
              {benchmarkOutput ? (
                <dl className="kv-grid">
                  <div className="kv-row">
                    <dt>Mapped output</dt>
                    <dd>{benchmarkOutput.key.replaceAll("_", " ")}</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Exists</dt>
                    <dd>{benchmarkOutput.exists ? "Yes" : "No"}</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Non-zero size</dt>
                    <dd>{benchmarkOutput.nonZeroSize ? "Yes" : "No"}</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Size</dt>
                    <dd>{benchmarkOutput.sizeBytes} bytes</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Benchmark path</dt>
                    <dd>{benchmarkOutput.path}</dd>
                  </div>
                </dl>
              ) : (
                <p className="muted">This artifact kind does not map directly to a benchmark output file.</p>
              )}
            </article>
          </div>
        </section>
      ) : null}

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Reviewer decisions</p>
          <h2>Artifact approvals</h2>
          <p className="muted">
            At least one &quot;approved&quot; decision is required before this artifact can be exported. Decisions are kept as an audit trail; the latest one on top is what gates the export button.
          </p>
        </div>

        {approvals.length === 0 ? (
          <p className="muted">No approval decisions recorded yet.</p>
        ) : (
          <div className="stack-xs">
            {approvals.map((approval) => {
              const tone: Tone = approval.decision === "approved" ? "success" : "warning";
              const label = approval.decision === "approved" ? "Approved" : "Changes requested";
              return (
                <article key={approval.id} className="ops-list-card">
                  <div className="ops-list-card-header">
                    <strong>
                      <span className={statusPillClassName(tone)}>{label}</span>{" "}
                      {approval.reviewer_email ?? "Unknown reviewer"}
                    </strong>
                    <span className="muted">{formatDateTime(approval.decided_at)}</span>
                  </div>
                  {approval.note ? <p className="muted">{approval.note}</p> : null}
                </article>
              );
            })}
          </div>
        )}

        {access.role !== "viewer" ? (
          <form action={recordApprovalAction} className="stack-sm surface-form-shell">
            <label className="stack-xs">
              <span className="muted">Decision</span>
              <select name="decision" defaultValue="approved">
                <option value="approved">Approve — cleared for export</option>
                <option value="changes_requested">Request changes</option>
              </select>
            </label>
            <label className="stack-xs">
              <span className="muted">Reviewer note (optional)</span>
              <textarea
                name="approvalNote"
                rows={3}
                placeholder="Context, caveats, or what the reviewer checked."
                maxLength={1000}
              />
            </label>
            <button type="submit" className="button button-secondary">
              Record decision
            </button>
          </form>
        ) : null}
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Artifact thread</p>
          <h2>Comments</h2>
          <p className="muted">
            Collaborate on review findings, client-safe caveats, and delivery context without leaving the artifact surface.
          </p>
        </div>

        {comments.length === 0 ? (
          <p className="muted">No comments posted yet.</p>
        ) : (
          <div className="stack-xs">
            {comments.map((comment) => {
              const resolved = Boolean(comment.resolved_at);
              return (
                <article
                  key={comment.id}
                  className="ops-list-card"
                  style={resolved ? { opacity: 0.6 } : undefined}
                >
                  <div className="ops-list-card-header">
                    <strong>
                      {comment.author_email ?? "Unknown"}
                      {resolved ? (
                        <span className={statusPillClassName("success")} style={{ marginLeft: "0.5rem" }}>
                          resolved
                        </span>
                      ) : null}
                    </strong>
                    <span className="muted">{formatDateTime(comment.created_at)}</span>
                  </div>
                  <p>{comment.body}</p>
                  {!resolved && access.role !== "viewer" ? (
                    <form action={resolveCommentAction}>
                      <input type="hidden" name="commentId" value={comment.id} />
                      <button type="submit" className="button button-secondary">
                        Mark resolved
                      </button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {access.role !== "viewer" ? (
          <form action={postCommentAction} className="stack-sm surface-form-shell">
            <label className="stack-xs">
              <span className="muted">New comment</span>
              <textarea
                name="commentBody"
                rows={3}
                placeholder="Share a review note, a caveat, or a delivery follow-up."
                maxLength={4000}
                required
              />
            </label>
            <button type="submit" className="button button-primary">
              Post comment
            </button>
          </form>
        ) : null}
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">External share</p>
          <h2>Signed share links</h2>
          <p className="muted">
            Issue a revocable link that lets an external recipient download this artifact without signing in. The link points at <code>/s/&lt;token&gt;</code>; each download mints a short-lived signed storage URL and counts against the configured limit.
          </p>
        </div>

        {shareLinks.length === 0 ? (
          <p className="muted">No share links issued yet.</p>
        ) : (
          <div className="share-links">
            {shareLinks.map((link) => {
              const status = shareLinkStatus(link);
              const tone: Tone =
                status === "active" ? "success" : status === "revoked" ? "danger" : "warning";
              const usesLabel =
                link.max_uses === null || link.max_uses === undefined
                  ? `${link.use_count} downloads`
                  : `${link.use_count} / ${link.max_uses} downloads`;
              const expiresLabel = link.expires_at ? formatDateTime(link.expires_at) : "No expiry";
              return (
                <article key={link.id} className="share-links__item">
                  <div className="share-links__meta">
                    <div className="share-links__url">{`/s/${link.token}`}</div>
                    <div className="share-links__stats">
                      <span className={statusPillClassName(tone)}>{status}</span>{" "}
                      · {usesLabel} · Expires {expiresLabel} · Created {formatDateTime(link.created_at)}
                      {link.note ? ` · ${link.note}` : ""}
                    </div>
                  </div>
                  {status === "active" ? (
                    <form action={revokeShareLinkAction}>
                      <input type="hidden" name="linkId" value={link.id} />
                      <button type="submit" className="button button-secondary">
                        Revoke
                      </button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {detail.output.status === "ready" ? (
          <form action={createShareLinkAction} className="share-links__form">
            <label className="stack-xs">
              <span className="muted">Note (optional)</span>
              <input
                type="text"
                name="shareNote"
                placeholder="e.g. Client preview — do not redistribute"
                maxLength={200}
              />
            </label>
            <label className="stack-xs">
              <span className="muted">Expires in hours (optional)</span>
              <input type="number" name="shareExpiresInHours" min={1} max={8760} step={1} placeholder="24" />
            </label>
            <label className="stack-xs">
              <span className="muted">Max uses (optional)</span>
              <input type="number" name="shareMaxUses" min={1} step={1} placeholder="5" />
            </label>
            <button type="submit" className="button button-primary">
              Issue share link
            </button>
          </form>
        ) : (
          <p className="muted">Share links require a ready artifact. This one is currently {detail.output.status}.</p>
        )}
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Artifact timeline</p>
          <h2>Recent events</h2>
        </div>
        <div className="stack-xs">
          {detail.events.slice(0, 8).map((event) => {
            const payload = (event.payload as Record<string, string | undefined>) ?? {};
            return (
              <article key={event.id} className="ops-event-card stack-xs">
                <div className="ops-list-card-header">
                  <strong>{payload.title ?? event.event_type}</strong>
                  <span className="muted">{formatDateTime(event.created_at)}</span>
                </div>
                <p className="muted">{payload.detail ?? "No event detail"}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
