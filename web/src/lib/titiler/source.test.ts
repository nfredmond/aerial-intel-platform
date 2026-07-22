import { afterEach, describe, expect, it } from "vitest";

import { resolveTitilerSourceUrl, rewriteStorageOrigin } from "./source";

const ORIGINAL_STORAGE_URL = process.env.AERIAL_TITILER_STORAGE_URL;
const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  restore("AERIAL_TITILER_STORAGE_URL", ORIGINAL_STORAGE_URL);
  restore("NEXT_PUBLIC_SUPABASE_URL", ORIGINAL_SUPABASE_URL);
  restore("NEXT_PUBLIC_SUPABASE_ANON_KEY", ORIGINAL_SUPABASE_ANON);
});

const SIGNED_URL =
  "http://127.0.0.1:55321/storage/v1/object/sign/drone-ops/gv-ops/jobs/abc/outputs/orthomosaic/odm_orthophoto.tif?token=eyJhbGciOiJIUzI1NiJ9.payload.sig";

describe("rewriteStorageOrigin", () => {
  it("swaps only the origin and preserves the path + signing token", () => {
    const out = rewriteStorageOrigin(
      SIGNED_URL,
      "http://127.0.0.1:55321",
      "http://172.17.0.1:55321",
    );
    expect(out).toBe(
      "http://172.17.0.1:55321/storage/v1/object/sign/drone-ops/gv-ops/jobs/abc/outputs/orthomosaic/odm_orthophoto.tif?token=eyJhbGciOiJIUzI1NiJ9.payload.sig",
    );
  });

  it("leaves the URL unchanged when its origin does not match fromOrigin", () => {
    const out = rewriteStorageOrigin(
      "https://cdn.example.com/ortho.tif",
      "http://127.0.0.1:55321",
      "http://172.17.0.1:55321",
    );
    expect(out).toBe("https://cdn.example.com/ortho.tif");
  });

  it("rewrites regardless of origin when fromOrigin is unknown", () => {
    const out = rewriteStorageOrigin(
      SIGNED_URL,
      null,
      "http://172.17.0.1:55321",
    );
    expect(out).toBe(
      "http://172.17.0.1:55321/storage/v1/object/sign/drone-ops/gv-ops/jobs/abc/outputs/orthomosaic/odm_orthophoto.tif?token=eyJhbGciOiJIUzI1NiJ9.payload.sig",
    );
  });

  it("returns the URL unchanged when it cannot be parsed", () => {
    expect(rewriteStorageOrigin("not a url", null, "http://172.17.0.1:55321")).toBe(
      "not a url",
    );
  });

  it("returns the URL unchanged when the target base URL has no usable origin", () => {
    expect(rewriteStorageOrigin(SIGNED_URL, "http://127.0.0.1:55321", "")).toBe(
      SIGNED_URL,
    );
  });
});

describe("resolveTitilerSourceUrl", () => {
  it("passes the URL through unchanged when AERIAL_TITILER_STORAGE_URL is unset", () => {
    delete process.env.AERIAL_TITILER_STORAGE_URL;
    expect(resolveTitilerSourceUrl(SIGNED_URL)).toBe(SIGNED_URL);
  });

  it("rewrites the app storage origin to the configured TiTiler storage origin", () => {
    process.env.AERIAL_TITILER_STORAGE_URL = "http://172.17.0.1:55321";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    expect(resolveTitilerSourceUrl(SIGNED_URL)).toBe(
      "http://172.17.0.1:55321/storage/v1/object/sign/drone-ops/gv-ops/jobs/abc/outputs/orthomosaic/odm_orthophoto.tif?token=eyJhbGciOiJIUzI1NiJ9.payload.sig",
    );
  });

  it("does not rewrite a URL from a different origin than the app storage origin", () => {
    process.env.AERIAL_TITILER_STORAGE_URL = "http://172.17.0.1:55321";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const hosted = "https://ref.supabase.co/storage/v1/object/sign/drone-ops/x.tif?token=t";
    expect(resolveTitilerSourceUrl(hosted)).toBe(hosted);
  });
});
