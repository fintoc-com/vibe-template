#!/bin/bash
set -e

if ! ls drizzle/*.sql >/dev/null 2>&1; then
  echo "No migrations in drizzle/ — skipping migration job"
  exit 0
fi

IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/${SERVICE_NAME}:${CIRCLE_SHA1}"

gcloud run jobs deploy "$CR_MIGRATE_JOB" \
    --project="$GCP_PROJECT" \
    --region="$GCP_REGION" \
    --image="$IMAGE" \
    --command="node" \
    --args="scripts/migrate.mjs" \
    --set-secrets=DOPPLER_SECRETS="${CR_DOPPLER_SECRET}:latest" \
    --quiet

echo "Running migration job..."
gcloud run jobs execute "$CR_MIGRATE_JOB" \
    --project="$GCP_PROJECT" \
    --region="$GCP_REGION" \
    --wait
