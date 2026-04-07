import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

const DRONE_OPS_STORAGE_BUCKET = "drone-ops";

function getSupabaseAdminStorageClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Set it for storage-backed ingest actions.",
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export type SignedUploadTicket = {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
};

export async function createDroneOpsSignedUploadTicket(path: string): Promise<SignedUploadTicket> {
  const supabase = getSupabaseAdminStorageClient();
  const result = await supabase.storage
    .from(DRONE_OPS_STORAGE_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Could not create a signed upload URL for the mission ZIP.");
  }

  return {
    bucket: DRONE_OPS_STORAGE_BUCKET,
    path: result.data.path,
    token: result.data.token,
    signedUrl: result.data.signedUrl,
  };
}

export async function createSignedDownloadUrl(input: {
  bucket?: string;
  path: string;
  expiresInSeconds?: number;
  download?: string | boolean;
}) {
  const bucket = input.bucket?.trim() || DRONE_OPS_STORAGE_BUCKET;
  const supabase = getSupabaseAdminStorageClient();
  const result = await supabase.storage
    .from(bucket)
    .createSignedUrl(input.path, input.expiresInSeconds ?? 60 * 60, {
      download: input.download,
    });

  if (result.error || !result.data?.signedUrl) {
    throw new Error(result.error?.message ?? "Could not create a signed download URL.");
  }

  return result.data.signedUrl;
}
