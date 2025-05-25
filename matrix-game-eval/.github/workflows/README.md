# GitHub Actions Workflows

This directory contains GitHub Actions workflows for CI/CD.

## Workflows

### 1. CI (`ci.yml`)
Runs on every pull request and push to develop branch:
- Lints and type-checks TypeScript code
- Builds the Next.js application
- Validates Python code formatting
- Tests Docker build

### 2. Deploy to GCP (`deploy-gcp.yml`)
Runs on push to main branch:
- Builds and tests the application
- Creates Docker image and pushes to Artifact Registry
- Deploys to Cloud Run using Workload Identity Federation

## Required Secrets

Set these in your GitHub repository settings:

- `GCP_PROJECT_ID`: Your Google Cloud project ID
- `WIF_PROVIDER`: Workload Identity Federation provider (see setup guide)
- `WIF_SERVICE_ACCOUNT`: Service account email for deployments

## Setup Instructions

See `setup-gcp-wif.md` in the root directory for detailed setup instructions.