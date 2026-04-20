-- Synthetic failed-job seed for Wave 2 C-2 (processing-QA diagnostic) staging
-- verification on nat-ford-drone-lab.
--
-- No real NodeODM run has failed on staging, so the QA skill has nothing to
-- diagnose. This seed inserts one `drone_processing_jobs` row with
-- status='failed' + a realistic `output_summary.benchmarkSummary` that drives
-- `buildProcessingQaFacts` end-to-end, plus four timeline events.
--
-- The row is explicitly marked `output_summary->>'synthetic' = 'true'` so
-- it can always be distinguished from real jobs and cleaned up later.
--
-- Provenance:
--   org_id      = a7081499-7f98-4915-9b68-27856fb7d440  (nat-ford-drone-lab)
--   project_id  = 40f3b8bc-8573-41d4-88a1-0fef259939d1  (Downtown corridor)
--   mission_id  = 09cc1483-d3a4-48b8-98fc-44d426af3273  (Downtown corridor baseline)
--   dataset_id  = 7ec061c5-1d05-4a97-9206-a8dddc99166b  (Downtown imagery batch)
--   job_id      = 11111111-1111-4111-8111-111111111111  (pinned for reproducibility)
--
-- The job attaches to the Downtown corridor mission (not Toledo-20) so the
-- Toledo-20 verified-success posture stays clean.

begin;

insert into public.drone_processing_jobs (
  id,
  org_id,
  project_id,
  mission_id,
  dataset_id,
  engine,
  preset_id,
  status,
  stage,
  progress,
  input_summary,
  output_summary,
  external_job_reference,
  created_at,
  updated_at,
  started_at,
  completed_at
) values (
  '11111111-1111-4111-8111-111111111111',
  'a7081499-7f98-4915-9b68-27856fb7d440',
  '40f3b8bc-8573-41d4-88a1-0fef259939d1',
  '09cc1483-d3a4-48b8-98fc-44d426af3273',
  '7ec061c5-1d05-4a97-9206-a8dddc99166b',
  'nodeodm',
  'nodeodm-baseline',
  'failed',
  'odm:feature_extraction',
  18,
  jsonb_build_object(
    'synthetic', true,
    'imageCount', 20,
    'datasetName', 'Downtown imagery batch'
  ),
  jsonb_build_object(
    'synthetic', true,
    'syntheticSeedVersion', '2026-04-19',
    'latestCheckpoint', 'odm:feature_extraction failed at 18%',
    'benchmarkSummary', jsonb_build_object(
      'run_exit_code', 137,
      'image_count', 20,
      'duration_seconds', 410,
      'minimum_pass', false,
      'required_outputs_present', false,
      'missing_required_outputs', jsonb_build_array('odm_orthophoto.tif', 'odm_dem.tif'),
      'odm_args', '--min-num-features 8000 --feature-quality high --matcher-type flann',
      'outputs', jsonb_build_object(
        'odm_orthophoto.tif', jsonb_build_object('exists', false, 'non_zero_size', false),
        'odm_dem.tif', jsonb_build_object('exists', false, 'non_zero_size', false),
        'odm_report.pdf', jsonb_build_object('exists', false, 'non_zero_size', false)
      )
    ),
    'stageChecklist', jsonb_build_array(
      jsonb_build_object('label', 'Ingest', 'status', 'complete'),
      jsonb_build_object('label', 'Preflight', 'status', 'complete'),
      jsonb_build_object('label', 'Feature extraction', 'status', 'failed'),
      jsonb_build_object('label', 'Matching', 'status', 'pending'),
      jsonb_build_object('label', 'Reconstruction', 'status', 'pending'),
      jsonb_build_object('label', 'Orthomosaic', 'status', 'pending')
    ),
    'nodeodm', jsonb_build_object(
      'taskUuid', 'synthetic-task-0001'
    ),
    'logTail', jsonb_build_array(
      '[ingest] 20 images registered',
      '[preflight] EXIF + GPS present on 20/20',
      '[feature_extraction] OpenMVG compute_features start',
      '[feature_extraction] processing batch 1/4',
      '[feature_extraction] OOM killer signaled by host',
      '[feature_extraction] child exited with code 137 after 410s'
    )
  ),
  'synthetic-task-0001',
  timezone('utc', now()) - interval '2 hours',
  timezone('utc', now()) - interval '1 hour 55 minutes',
  timezone('utc', now()) - interval '1 hour 50 minutes',
  timezone('utc', now()) - interval '1 hour 43 minutes'
)
on conflict (id) do nothing;

delete from public.drone_processing_job_events
where job_id = '11111111-1111-4111-8111-111111111111'
  and exists (
    select 1
    from public.drone_processing_jobs
    where id = '11111111-1111-4111-8111-111111111111'
      and output_summary->>'synthetic' = 'true'
  );

insert into public.drone_processing_job_events (
  org_id,
  job_id,
  event_type,
  payload,
  created_at
)
select *
from (
  values
  (
    'a7081499-7f98-4915-9b68-27856fb7d440',
    '11111111-1111-4111-8111-111111111111',
    'job.queued',
    jsonb_build_object('title', 'Synthetic NodeODM job queued', 'synthetic', true),
    timezone('utc', now()) - interval '1 hour 55 minutes'
  ),
  (
    'a7081499-7f98-4915-9b68-27856fb7d440',
    '11111111-1111-4111-8111-111111111111',
    'job.started',
    jsonb_build_object('title', 'Synthetic NodeODM job started', 'synthetic', true),
    timezone('utc', now()) - interval '1 hour 50 minutes'
  ),
  (
    'a7081499-7f98-4915-9b68-27856fb7d440',
    '11111111-1111-4111-8111-111111111111',
    'stage.entered',
    jsonb_build_object(
      'title', 'Feature extraction started',
      'stage', 'odm:feature_extraction',
      'synthetic', true
    ),
    timezone('utc', now()) - interval '1 hour 49 minutes'
  ),
  (
    'a7081499-7f98-4915-9b68-27856fb7d440',
    '11111111-1111-4111-8111-111111111111',
    'job.failed',
    jsonb_build_object(
      'title', 'Job failed at feature extraction (exit 137)',
      'stage', 'odm:feature_extraction',
      'exit_code', 137,
      'synthetic', true
    ),
    timezone('utc', now()) - interval '1 hour 43 minutes'
  )
) as events (org_id, job_id, event_type, payload, created_at)
where exists (
  select 1
  from public.drone_processing_jobs
  where id = '11111111-1111-4111-8111-111111111111'
    and output_summary->>'synthetic' = 'true'
);

commit;

-- Cleanup (uncomment and run to remove the synthetic row + its events):
--
-- begin;
-- delete from public.drone_processing_job_events
--   where job_id = '11111111-1111-4111-8111-111111111111';
-- delete from public.drone_processing_jobs
--   where id = '11111111-1111-4111-8111-111111111111'
--     and output_summary->>'synthetic' = 'true';
-- commit;
