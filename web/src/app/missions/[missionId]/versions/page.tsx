import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { getMissionDetail } from "@/lib/missions/detail-data";
import { buildVersionDiff, type DiffChange } from "@/lib/missions/version-diff";
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

function diffChangeTone(change: DiffChange): Tone {
  switch (change) {
    case "added":
      return "success";
    case "removed":
      return "danger";
    case "changed":
      return "warning";
    default:
      return "neutral";
  }
}

function formatDiffValue(value: Json | undefined): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
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
  searchParams: Promise<{
    snapshotted?: string;
    promoted?: string;
    error?: string;
    compareLeft?: string;
    compareRight?: string;
    hideUnchanged?: string;
  }>;
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

  const defaultRight = versions[0]?.id ?? "";
  const defaultLeft = versions[1]?.id ?? versions[0]?.id ?? "";
  const leftId = resolved.compareLeft ?? defaultLeft;
  const rightId = resolved.compareRight ?? defaultRight;
  const leftVersion = versions.find((v) => v.id === leftId);
  const rightVersion = versions.find((v) => v.id === rightId);
  const hideUnchanged = resolved.hideUnchanged !== "0";
  const diffEntries =
    leftVersion && rightVersion
      ? buildVersionDiff(leftVersion.plan_payload ?? null, rightVersion.plan_payload ?? null)
      : [];
  const visibleDiff = hideUnchanged
    ? diffEntries.filter((d) => d.change !== "unchanged")
    : diffEntries;

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

      {versions.length >= 2 ? (
        <section className="mission-detail__section">
          <h2>Compare versions</h2>
          <form method="get" className="mission-detail__form">
            <label htmlFor="compare-left">
              Left
              <select id="compare-left" name="compareLeft" defaultValue={leftId}>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version_number} · {formatVersionStatus(v.status)}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="compare-right">
              Right
              <select id="compare-right" name="compareRight" defaultValue={rightId}>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version_number} · {formatVersionStatus(v.status)}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="hide-unchanged">
              <input
                type="checkbox"
                id="hide-unchanged"
                name="hideUnchanged"
                value="1"
                defaultChecked={hideUnchanged}
              />{" "}
              Hide unchanged rows
            </label>
            <button type="submit" className="button button-secondary">
              Update diff
            </button>
          </form>

          {leftVersion && rightVersion ? (
            leftVersion.id === rightVersion.id ? (
              <p className="mission-detail__muted">Pick two different versions to see a diff.</p>
            ) : visibleDiff.length === 0 ? (
              <p className="mission-detail__muted">
                No differences between v{leftVersion.version_number} and v{rightVersion.version_number}.
              </p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Path</th>
                      <th>v{leftVersion.version_number}</th>
                      <th>v{rightVersion.version_number}</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDiff.map((entry, idx) => (
                      <tr key={`${entry.path}-${idx}`}>
                        <td className="admin-table__mono">{entry.path || "(root)"}</td>
                        <td className="admin-table__mono">{formatDiffValue(entry.left)}</td>
                        <td className="admin-table__mono">{formatDiffValue(entry.right)}</td>
                        <td>
                          <span className={statusPillClassName(diffChangeTone(entry.change))}>
                            {entry.change}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <p className="mission-detail__muted">Select two versions to compare.</p>
          )}
        </section>
      ) : null}
    </main>
  );
}
