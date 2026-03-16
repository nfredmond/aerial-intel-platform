export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type DroneMembershipRole = "owner" | "admin" | "analyst" | "viewer";
export type DroneEntitlementStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "refunded"
  | "pending";

export type Database = {
  public: {
    Tables: {
      drone_orgs: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
        };
      };
      drone_memberships: {
        Row: {
          org_id: string;
          user_id: string;
          role: DroneMembershipRole;
          created_at: string;
        };
      };
      drone_entitlements: {
        Row: {
          id: string;
          org_id: string;
          product_id: string;
          tier_id: string;
          status: DroneEntitlementStatus;
          source: string;
          external_reference: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      drone_projects: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          slug: string;
          status: "active" | "paused" | "archived";
          description: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
      };
      drone_sites: {
        Row: {
          id: string;
          org_id: string;
          project_id: string;
          name: string;
          slug: string;
          description: string | null;
          boundary: unknown | null;
          center: unknown | null;
          site_notes: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
      };
      drone_missions: {
        Row: {
          id: string;
          org_id: string;
          project_id: string;
          site_id: string;
          name: string;
          slug: string;
          mission_type: string;
          status:
            | "draft"
            | "planned"
            | "validated"
            | "queued"
            | "flying"
            | "uploaded"
            | "processing"
            | "ready_for_review"
            | "delivered"
            | "archived";
          objective: string | null;
          planning_geometry: unknown | null;
          summary: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
      };
      drone_mission_versions: {
        Row: {
          id: string;
          org_id: string;
          mission_id: string;
          version_number: number;
          source_format: string;
          status: "draft" | "validated" | "approved" | "installed" | "archived";
          plan_payload: Json;
          validation_summary: Json;
          export_summary: Json;
          created_by: string | null;
          created_at: string;
        };
      };
      drone_datasets: {
        Row: {
          id: string;
          org_id: string;
          project_id: string;
          site_id: string | null;
          mission_id: string | null;
          name: string;
          slug: string;
          kind:
            | "image"
            | "video"
            | "thermal"
            | "multispectral"
            | "lidar"
            | "external"
            | "mission_template";
          status:
            | "draft"
            | "uploading"
            | "uploaded"
            | "preflight_flagged"
            | "ready"
            | "processing"
            | "archived";
          captured_at: string | null;
          spatial_footprint: unknown | null;
          metadata: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
      };
      drone_processing_jobs: {
        Row: {
          id: string;
          org_id: string;
          project_id: string;
          site_id: string | null;
          mission_id: string | null;
          dataset_id: string | null;
          engine: string;
          preset_id: string | null;
          status: "queued" | "running" | "succeeded" | "failed" | "canceled" | "needs_review";
          stage: string;
          progress: number;
          queue_position: number | null;
          input_summary: Json;
          output_summary: Json;
          external_job_reference: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
      };
      drone_processing_outputs: {
        Row: {
          id: string;
          org_id: string;
          job_id: string;
          mission_id: string | null;
          dataset_id: string | null;
          kind:
            | "orthomosaic"
            | "dsm"
            | "dtm"
            | "dem"
            | "point_cloud"
            | "mesh"
            | "tiles_3d"
            | "report"
            | "install_bundle"
            | "preview";
          status: "pending" | "ready" | "failed" | "archived";
          storage_bucket: string | null;
          storage_path: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
      };
    };
  };
};
