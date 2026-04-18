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

export async function downloadStorageText(input: {
  bucket?: string;
  path: string;
}) {
  const bucket = input.bucket?.trim() || DRONE_OPS_STORAGE_BUCKET;
  const supabase = getSupabaseAdminStorageClient();
  const result = await supabase.storage
    .from(bucket)
    .download(input.path);

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Could not download the storage object.");
  }

  return result.data.text();
}

export async function uploadStorageBytes(input: {
  bucket?: string;
  path: string;
  bytes: Uint8Array | Blob;
  contentType?: string;
  upsert?: boolean;
}): Promise<{ path: string }> {
  const bucket = input.bucket?.trim() || DRONE_OPS_STORAGE_BUCKET;
  const supabase = getSupabaseAdminStorageClient();
  const body = input.bytes instanceof Blob
    ? input.bytes
    : new Blob([input.bytes as BlobPart], { type: input.contentType ?? "application/octet-stream" });
  const result = await supabase.storage
    .from(bucket)
    .upload(input.path, body, {
      contentType: input.contentType,
      upsert: input.upsert ?? true,
    });

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Could not upload the storage object.");
  }

  return { path: result.data.path };
}

export async function downloadStorageBytes(input: {
  bucket?: string;
  path: string;
}): Promise<Blob> {
  const bucket = input.bucket?.trim() || DRONE_OPS_STORAGE_BUCKET;
  const supabase = getSupabaseAdminStorageClient();
  const result = await supabase.storage
    .from(bucket)
    .download(input.path);

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Could not download the storage object.");
  }

  return result.data;
}

export type StorageObjectSummary = {
  name: string;
  size: number | null;
};

export async function listStorageObjects(input: {
  bucket?: string;
  prefix: string;
  limit?: number;
}): Promise<StorageObjectSummary[]> {
  const bucket = input.bucket?.trim() || DRONE_OPS_STORAGE_BUCKET;
  const supabase = getSupabaseAdminStorageClient();
  const result = await supabase.storage
    .from(bucket)
    .list(input.prefix, {
      limit: input.limit ?? 200,
      sortBy: { column: "name", order: "asc" },
    });

  if (result.error) {
    throw new Error(result.error.message ?? "Could not list storage objects.");
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  return rows
    .filter((row) => typeof row?.name === "string" && row.name.length > 0)
    .map((row) => {
      const metadataSize = (row.metadata && typeof row.metadata === "object")
        ? (row.metadata as { size?: unknown }).size
        : null;
      const size = typeof metadataSize === "number" ? metadataSize : null;
      return { name: row.name, size };
    });
}
