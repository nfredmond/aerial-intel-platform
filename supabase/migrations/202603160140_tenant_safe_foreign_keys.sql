alter table public.drone_projects
  add constraint uq_drone_projects_org_id_id unique (org_id, id);

alter table public.drone_sites
  add constraint uq_drone_sites_org_id_id unique (org_id, id);

alter table public.drone_missions
  add constraint uq_drone_missions_org_id_id unique (org_id, id);

alter table public.drone_datasets
  add constraint uq_drone_datasets_org_id_id unique (org_id, id);

alter table public.drone_processing_jobs
  add constraint uq_drone_processing_jobs_org_id_id unique (org_id, id);

alter table public.drone_sites
  drop constraint if exists drone_sites_project_id_fkey,
  add constraint drone_sites_org_project_fkey
    foreign key (org_id, project_id)
    references public.drone_projects (org_id, id)
    on delete cascade;

alter table public.drone_missions
  drop constraint if exists drone_missions_project_id_fkey,
  drop constraint if exists drone_missions_site_id_fkey,
  add constraint drone_missions_org_project_fkey
    foreign key (org_id, project_id)
    references public.drone_projects (org_id, id)
    on delete cascade,
  add constraint drone_missions_org_site_fkey
    foreign key (org_id, site_id)
    references public.drone_sites (org_id, id)
    on delete cascade;

alter table public.drone_mission_versions
  drop constraint if exists drone_mission_versions_mission_id_fkey,
  add constraint drone_mission_versions_org_mission_fkey
    foreign key (org_id, mission_id)
    references public.drone_missions (org_id, id)
    on delete cascade;

alter table public.drone_datasets
  drop constraint if exists drone_datasets_project_id_fkey,
  drop constraint if exists drone_datasets_site_id_fkey,
  drop constraint if exists drone_datasets_mission_id_fkey,
  add constraint drone_datasets_org_project_fkey
    foreign key (org_id, project_id)
    references public.drone_projects (org_id, id)
    on delete cascade,
  add constraint drone_datasets_org_site_fkey
    foreign key (org_id, site_id)
    references public.drone_sites (org_id, id)
    on delete set null,
  add constraint drone_datasets_org_mission_fkey
    foreign key (org_id, mission_id)
    references public.drone_missions (org_id, id)
    on delete set null;

alter table public.drone_processing_jobs
  drop constraint if exists drone_processing_jobs_project_id_fkey,
  drop constraint if exists drone_processing_jobs_site_id_fkey,
  drop constraint if exists drone_processing_jobs_mission_id_fkey,
  drop constraint if exists drone_processing_jobs_dataset_id_fkey,
  add constraint drone_processing_jobs_org_project_fkey
    foreign key (org_id, project_id)
    references public.drone_projects (org_id, id)
    on delete cascade,
  add constraint drone_processing_jobs_org_site_fkey
    foreign key (org_id, site_id)
    references public.drone_sites (org_id, id)
    on delete set null,
  add constraint drone_processing_jobs_org_mission_fkey
    foreign key (org_id, mission_id)
    references public.drone_missions (org_id, id)
    on delete set null,
  add constraint drone_processing_jobs_org_dataset_fkey
    foreign key (org_id, dataset_id)
    references public.drone_datasets (org_id, id)
    on delete set null;

alter table public.drone_processing_outputs
  drop constraint if exists drone_processing_outputs_job_id_fkey,
  drop constraint if exists drone_processing_outputs_mission_id_fkey,
  drop constraint if exists drone_processing_outputs_dataset_id_fkey,
  add constraint drone_processing_outputs_org_job_fkey
    foreign key (org_id, job_id)
    references public.drone_processing_jobs (org_id, id)
    on delete cascade,
  add constraint drone_processing_outputs_org_mission_fkey
    foreign key (org_id, mission_id)
    references public.drone_missions (org_id, id)
    on delete set null,
  add constraint drone_processing_outputs_org_dataset_fkey
    foreign key (org_id, dataset_id)
    references public.drone_datasets (org_id, id)
    on delete set null;

alter table public.drone_processing_job_events
  drop constraint if exists drone_processing_job_events_job_id_fkey,
  add constraint drone_processing_job_events_org_job_fkey
    foreign key (org_id, job_id)
    references public.drone_processing_jobs (org_id, id)
    on delete cascade;
