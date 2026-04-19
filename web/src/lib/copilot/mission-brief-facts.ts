import type { MissionDetail } from "@/lib/missions/detail-data";
import type { Json } from "@/lib/supabase/types";

import type { MissionBriefFact } from "./mission-brief";

function pushFact(out: MissionBriefFact[], id: string, label: string, value: unknown): void {
  if (value === undefined || value === null) return;
  const s = typeof value === "string" ? value : String(value);
  if (!s.trim()) return;
  out.push({ id, label, value: s });
}

function readRecord(value: Json | null | undefined): Record<string, Json> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, Json>;
}

function readNumber(v: Json | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function readString(v: Json | undefined): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/**
 * Pulls a narrow, citable set of facts off the loaded mission detail. Every
 * entry in the returned array becomes a legal `[fact:<id>]` citation. Keep the
 * list tight — every fact is an input token, and the brief only has budget
 * for so many claims.
 */
export function buildMissionBriefFacts(detail: MissionDetail): MissionBriefFact[] {
  const facts: MissionBriefFact[] = [];

  const m = detail.mission;
  pushFact(facts, `mission:${m.id}:name`, "Mission name", m.name);
  pushFact(facts, `mission:${m.id}:type`, "Mission type", m.mission_type);
  pushFact(facts, `mission:${m.id}:status`, "Mission status", m.status);
  pushFact(facts, `mission:${m.id}:objective`, "Objective", m.objective ?? "");

  if (detail.project) {
    pushFact(facts, `project:${detail.project.id}:name`, "Project", detail.project.name);
  }
  if (detail.site) {
    pushFact(facts, `site:${detail.site.id}:name`, "Site", detail.site.name);
  }

  const summary = readRecord(m.summary ?? null);
  if (summary) {
    const areaHa = readNumber(summary.area_ha);
    if (areaHa !== null) {
      pushFact(
        facts,
        `mission:${m.id}:area_ha`,
        "Area covered (ha)",
        areaHa.toFixed(2),
      );
    }
    const plannedDate = readString(summary.planned_capture_date);
    if (plannedDate) {
      pushFact(facts, `mission:${m.id}:planned_date`, "Planned capture date", plannedDate);
    }
  }

  for (const ds of detail.datasets.slice(0, 5)) {
    pushFact(facts, `dataset:${ds.id}:name`, `Dataset ${ds.slug}`, ds.name);
    pushFact(facts, `dataset:${ds.id}:kind`, `Dataset ${ds.slug} kind`, ds.kind);
    if (ds.captured_at) {
      pushFact(
        facts,
        `dataset:${ds.id}:captured_at`,
        `Dataset ${ds.slug} capture date`,
        ds.captured_at,
      );
    }
    const meta = readRecord(ds.metadata ?? null);
    if (meta) {
      const imageCount = readNumber(meta.image_count);
      if (imageCount !== null) {
        pushFact(
          facts,
          `dataset:${ds.id}:image_count`,
          `Dataset ${ds.slug} image count`,
          String(imageCount),
        );
      }
      const altitude = readNumber(meta.median_altitude_m);
      if (altitude !== null) {
        pushFact(
          facts,
          `dataset:${ds.id}:altitude_m`,
          `Dataset ${ds.slug} median AGL (m)`,
          altitude.toFixed(0),
        );
      }
    }
  }

  for (const ing of detail.ingestSessions.slice(0, 3)) {
    if (ing.image_count !== null && ing.image_count !== undefined) {
      pushFact(
        facts,
        `ingest:${ing.id}:image_count`,
        `Ingest ${ing.session_label} images`,
        String(ing.image_count),
      );
    }
    if (ing.truthful_pass !== null && ing.truthful_pass !== undefined) {
      pushFact(
        facts,
        `ingest:${ing.id}:truthful_pass`,
        `Ingest ${ing.session_label} truthful-pass`,
        String(ing.truthful_pass),
      );
    }
  }

  for (const job of detail.jobs.slice(0, 3)) {
    pushFact(facts, `job:${job.id}:engine`, `Job ${job.id.slice(0, 8)} engine`, job.engine);
    pushFact(facts, `job:${job.id}:status`, `Job ${job.id.slice(0, 8)} status`, job.status);
    if (job.preset_id) {
      pushFact(facts, `job:${job.id}:preset`, `Job ${job.id.slice(0, 8)} preset`, job.preset_id);
    }
    if (job.completed_at) {
      pushFact(
        facts,
        `job:${job.id}:completed_at`,
        `Job ${job.id.slice(0, 8)} completed at`,
        job.completed_at,
      );
    }
    const outSummary = readRecord(job.output_summary ?? null);
    const qaGate = outSummary ? readRecord(outSummary.qa_gate) : null;
    if (qaGate) {
      const minPass = qaGate.minimum_pass;
      if (minPass !== undefined && minPass !== null) {
        pushFact(
          facts,
          `qa:${job.id}:minimum_pass`,
          `Job ${job.id.slice(0, 8)} QA minimum_pass`,
          String(minPass),
        );
      }
      const verdict = readString(qaGate.verdict);
      if (verdict) {
        pushFact(facts, `qa:${job.id}:verdict`, `Job ${job.id.slice(0, 8)} QA verdict`, verdict);
      }
    }
  }

  const outputKinds = new Map<string, number>();
  for (const output of detail.outputs) {
    outputKinds.set(output.kind, (outputKinds.get(output.kind) ?? 0) + 1);
  }
  for (const [kind, count] of outputKinds) {
    pushFact(
      facts,
      `outputs:${m.id}:${kind}`,
      `Outputs of kind ${kind}`,
      `${count} artifact${count === 1 ? "" : "s"}`,
    );
  }

  return facts;
}
