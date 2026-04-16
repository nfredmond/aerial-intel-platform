import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { getMissionDetail } from "@/lib/missions/detail-data";
import { buildMissionVersionSnapshot, nextVersionNumber } from "@/lib/missions/versions";
import type { Json } from "@/lib/supabase/types";
import {
  insertMissionVersion,
  updateMission,
  updateMissionVersion,
} from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/ui/datetime";
import { statusPillClassName, type Tone } from "@/lib/ui/tones";

function versionStatusTone(status: string): Tone {
  switch (status) {
    case "approved":
    case "installed":
      return "success";
    case "validated":
      return "info";
    case "archived":
      return "neutral";
    default:
      return "warning";
  }
}

function formatVersionStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function canPromote(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "analyst";
}

type VersionPlanPayload = {
  mission?: { id?: string; slug?: string; name?: string; type?: string; status?: string; objective?: string | null };
  planningGeometry?: Json | null;
  summary?: Json;
  note?: string | null;
  capturedAt?: string;
};

export default async function MissionVersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ missionId: string }>;
  searchParams: Promise<{ snapshotted?: string; promoted?: string; error?: string }>;
}) {
  const access = await getDroneOpsAccess();
  if (!access.user) redirect("/sign-in");
  if (!access.hasMembership || !access.hasActiveEntitlement) {
    return <BlockedAccessView access={access} />;
  }

  const { missionId } = await params;
  const resolved = await searchParams;
  const detail = await getMissionDetail(access, missionId);
  if (!detail) notFound();

  async function snapshotCurrentPlan(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) redirect("/sign-in");

    const refreshed = await getMissionDetail(refreshedAccess, missionId);
    if (!refreshed) {
      redirect(`/missions/${missionId}/versions?error=mission-not-found`);
    }

    const note = (formData.get("note") ?? "").toString();
    const insert = buildMissionVersionSnapshot({
      mission: refreshed.mission,
      userId: refreshedAccess.user.id,
      nextVersionNumber: nextVersionNumber(refreshed.versions),
      note,
    });

    await insertMissionVersion(insert);
    redirect(`/missions/${missionId}/versions?snapshotted=${insert.version_number}`);
  }

  async function promoteVersion(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) redirect("/sign-in");
    if (!canPromote(refreshedAccess.role)) {
      redirect(`/missions/${missionId}/versions?error=viewer-cannot-promote`);
    }

    const refreshed = await getMissionDetail(refreshedAccess, missionId);
    if (!refreshed) {
      redirect(`/missions/${missionId}/versions?error=mission-not-found`);
    }

    const rawVersionId = formData.get("versionId");
    const versionId = typeof rawVersionId === "string" ? rawVersionId.trim() : "";
    if (!versionId) {
      redirect(`/missions/${missionId}/versions?error=version-missing`);
    }

    const target = refreshed.versions.find((row) => row.id === versionId);
    if (!target) {
      redirect(`/missions/${missionId}/versions?error=version-not-found`);
    }

    const payload = (target.plan_payload ?? {}) as VersionPlanPayload;
    const summary = (payload.summary ?? {}) as Json;
    const planningGeometry = (payload.planningGeometry ?? null) as Json | null;

    try {
      await updateMission(refreshed.mission.id, {
        summary,
        planning_geometry: planningGeometry,
      });
      await updateMissionVersion(target.id, { status: "installed" });
    } catch {
      redirect(`/missions/${missionId}/versions?error=promote-failed`);
    }

    redirect(`/missions/${missionId}/versions?promoted=${target.version_number}`);
  }

  const versions = [...detail.versions].sort((a, b) => b.version_number - a.version_number);
  const promoteAllowed = canPromote(access.role);

  return (
    <main className="mission-detail">
      <nav aria-label="Breadcrumb" className="mission-detail__breadcrumb">
        <Link href="/missions">Missions</Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/missions/${missionId}`}>{detail.mission.name}</Link>
        <span aria-hidden="true"> / </span>
        <span>Versions</span>
      </nav>

      <header className="mission-detail__header">
        <h1>Mission versions</h1>
        <p className="mission-detail__subtitle">
          Snapshot the current planning geometry + summary as an immutable version, audit prior snapshots, and
          promote a past version back onto the current mission when needed.
        </p>
      </header>

      {resolved.snapshotted && (
        <p className="mission-detail__notice mission-detail__notice--success">
          Snapshotted version v{resolved.snapshotted}.
        </p>
      )}
      {resolved.promoted && (
        <p className="mission-detail__notice mission-detail__notice--success">
          Promoted v{resolved.promoted} to current. Mission geometry and summary now match this snapshot.
        </p>
      )}
      {resolved.error && (
        <p className="mission-detail__notice mission-detail__notice--warning">
          Unable to continue: {resolved.error.replace(/-/g, " ")}.
        </p>
      )}

      <section className="mission-detail__section">
        <h2>Snapshot current plan</h2>
        <form action={snapshotCurrentPlan} className="mission-detail__form">
          <label htmlFor="version-note">
            Optional note
            <textarea
              id="version-note"
              name="note"
              rows={3}
              placeholder="e.g. Pre-fieldwork baseline before 2026-04-22 capture"
            />
          </label>
          <button type="submit" className="button button-primary">
            Snapshot as v{nextVersionNumber(detail.versions)}
          </button>
        </form>
      </section>

      <section className="mission-detail__section">
        <h2>Version history</h2>
        {versions.length === 0 ? (
          <p className="mission-detail__muted">No versions snapshotted yet.</p>
        ) : (
          <ul className="mission-detail__list">
            {versions.map((version) => {
              const tone = versionStatusTone(version.status);
              const planPayload = (version.plan_payload ?? {}) as VersionPlanPayload;
              const note = typeof planPayload.note === "string" ? planPayload.note : null;
              const snapshotJson = JSON.stringify(planPayload, null, 2);
              return (
                <li key={version.id} className="mission-detail__list-item">
                  <div>
                    <strong>v{version.version_number}</strong>{" "}
                    <span className={statusPillClassName(tone)}>{formatVersionStatus(version.status)}</span>
                  </div>
                  <div className="mission-detail__muted">
                    Captured {formatDateTime(version.created_at)} · source {version.source_format}
                  </div>
                  {note && <p>{note}</p>}
                  <details className="mission-detail__details">
                    <summary>View snapshot payload</summary>
                    <pre className="mission-detail__snapshot">{snapshotJson}</pre>
                  </details>
                  {promoteAllowed && version.status !== "installed" ? (
                    <form action={promoteVersion}>
                      <input type="hidden" name="versionId" value={version.id} />
                      <button type="submit" className="button button-secondary">
                        Promote v{version.version_number} to current
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
