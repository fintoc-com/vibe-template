#!/bin/bash
set -e

IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/${SERVICE_NAME}:${CIRCLE_SHA1}"

gcloud run deploy "$SERVICE_NAME" \
    --project="$GCP_PROJECT" \
    --region="$GCP_REGION" \
    --image="$IMAGE" \
    --set-secrets=DOPPLER_SECRETS="${CR_DOPPLER_SECRET}:latest" \
    --quiet
