# Controlled TiTiler service

This directory contains the deployable container shape for the controlled raster
delivery plane. It replaces temporary Preview use of `https://titiler.xyz` with
a Nat Ford owned TiTiler endpoint.

The app only needs one environment variable:

```bash
AERIAL_TITILER_URL=https://titiler.example.com
```

## Local container

```bash
cd infra/titiler
docker compose up --build
```

Then smoke it:

```bash
AERIAL_TITILER_URL=http://localhost:8080 ../../scripts/smoke_titiler.sh
```

## Cloud Run shape

`cloud-run.service.yaml.example` is intentionally an example because the final
project id, region, artifact registry path, and CORS origins are environment
specific.

Minimal deployment flow:

```bash
gcloud artifacts repositories create aerial \
  --repository-format=docker \
  --location=REGION

gcloud builds submit infra/titiler \
  --tag REGION-docker.pkg.dev/PROJECT/aerial/titiler:TAG

cp infra/titiler/cloud-run.service.yaml.example /tmp/aerial-titiler.yaml
# edit image + CORS_ORIGINS in /tmp/aerial-titiler.yaml
gcloud run services replace /tmp/aerial-titiler.yaml --region REGION
gcloud run services add-iam-policy-binding aerial-titiler \
  --region REGION \
  --member=allUsers \
  --role=roles/run.invoker
```

Run `scripts/smoke_titiler.sh` against the Cloud Run URL before setting
`AERIAL_TITILER_URL` in Vercel.

## Production requirements

- Use a Nat Ford controlled domain, for example `https://titiler.natfordplanning.com`.
- Restrict `CORS_ORIGINS` to the production app origin and Preview origin pattern.
- Put Cloudflare, Cloud CDN, or another cache in front before heavy customer use.
- Pin `TITILER_IMAGE` to a tested digest or tag before production promotion.
- Keep TiTiler independent from NodeODM; raster serving is latency-sensitive while
  ODM processing is CPU/RAM-heavy.
- Do not treat a public demo endpoint as production evidence.
