#!/bin/bash
set -e

IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/${SERVICE_NAME}:${CIRCLE_SHA1}"

gcloud builds submit \
    --project="$GCP_PROJECT" \
    --region="$GCP_REGION" \
    --service-account="projects/${GCP_PROJECT}/serviceAccounts/${CR_BUILD_SA}" \
    --gcs-log-dir="gs://${GCP_PROJECT}-cloudbuild-logs" \
    --tag="$IMAGE" \
    --quiet
