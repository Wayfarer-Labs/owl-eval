# Setting up Workload Identity Federation for GitHub Actions

This guide walks through setting up Workload Identity Federation (WIF) to securely deploy from GitHub Actions to Google Cloud Platform without using service account keys.

## Prerequisites

- Google Cloud Project with billing enabled
- `gcloud` CLI installed and authenticated
- Owner or IAM Admin permissions on the GCP project

## Step 1: Enable Required APIs

```bash
export PROJECT_ID="your-gcp-project-id"
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable iamcredentials.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

## Step 2: Create Artifact Registry Repository

```bash
export REGION="us-central1"
export REPO_NAME="matrix-game-eval"

gcloud artifacts repositories create $REPO_NAME \
  --repository-format=docker \
  --location=$REGION \
  --description="Docker images for Matrix Game Evaluation platform"
```

## Step 3: Create Service Account

```bash
export SERVICE_ACCOUNT_NAME="github-actions-deploy"

gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
  --display-name="GitHub Actions Deploy Account" \
  --description="Service account for GitHub Actions deployments"
```

## Step 4: Grant Permissions to Service Account

```bash
export SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Cloud Run permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/run.admin"

# Artifact Registry permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/artifactregistry.writer"

# Service Account user (to act as the service account)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/iam.serviceAccountUser"
```

## Step 5: Create Workload Identity Pool

```bash
export POOL_NAME="github-actions-pool"
export POOL_DISPLAY_NAME="GitHub Actions Pool"

gcloud iam workload-identity-pools create $POOL_NAME \
  --location="global" \
  --display-name="$POOL_DISPLAY_NAME" \
  --description="Workload Identity Pool for GitHub Actions"
```

## Step 6: Create Workload Identity Provider

Replace `YOUR_GITHUB_ORG` with your GitHub organization or username:

```bash
export GITHUB_ORG="YOUR_GITHUB_ORG"
export GITHUB_REPO="matrix-game-eval"
export PROVIDER_NAME="github-actions-provider"

gcloud iam workload-identity-pools providers create-oidc $PROVIDER_NAME \
  --location="global" \
  --workload-identity-pool=$POOL_NAME \
  --display-name="GitHub Actions Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == '${GITHUB_ORG}'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

## Step 7: Allow GitHub Actions to Impersonate Service Account

```bash
# Get the full identifier for the Workload Identity Pool
export WORKLOAD_IDENTITY_POOL_ID=$(gcloud iam workload-identity-pools describe $POOL_NAME \
  --location="global" \
  --format="value(name)")

# Grant the service account impersonation permission
gcloud iam service-accounts add-iam-policy-binding $SERVICE_ACCOUNT_EMAIL \
  --member="principalSet://iam.googleapis.com/${WORKLOAD_IDENTITY_POOL_ID}/attribute.repository/${GITHUB_ORG}/${GITHUB_REPO}" \
  --role="roles/iam.workloadIdentityUser"
```

## Step 8: Get Provider and Service Account Details

```bash
# Get the provider resource name
export PROVIDER_RESOURCE_NAME=$(gcloud iam workload-identity-pools providers describe $PROVIDER_NAME \
  --location="global" \
  --workload-identity-pool=$POOL_NAME \
  --format="value(name)")

echo "WIF_PROVIDER: ${PROVIDER_RESOURCE_NAME}"
echo "WIF_SERVICE_ACCOUNT: ${SERVICE_ACCOUNT_EMAIL}"
echo "GCP_PROJECT_ID: ${PROJECT_ID}"
```

## Step 9: Add GitHub Secrets

Add these secrets to your GitHub repository:

1. Go to your repository on GitHub
2. Navigate to Settings → Secrets and variables → Actions
3. Add the following secrets:
   - `GCP_PROJECT_ID`: Your GCP project ID
   - `WIF_PROVIDER`: The provider resource name from step 8
   - `WIF_SERVICE_ACCOUNT`: The service account email from step 8

## Step 10: Test the Deployment

1. Push to the `main` branch or create a pull request
2. Check the Actions tab in your GitHub repository
3. The workflow should authenticate using WIF and deploy to Cloud Run

## Troubleshooting

### Permission Denied Errors

If you get permission denied errors, ensure:
- The attribute condition in the provider matches your GitHub org/username
- The repository name in the service account binding is correct
- All required APIs are enabled

### Authentication Failures

Check that:
- The GitHub secrets are set correctly
- The service account has the required permissions
- The workload identity pool and provider are properly configured

### Viewing Logs

```bash
# View Cloud Run logs
gcloud run services logs read matrix-game-eval --region=$REGION

# View deployment details
gcloud run services describe matrix-game-eval --region=$REGION
```

## Clean Up (Optional)

To remove all created resources:

```bash
# Delete Cloud Run service
gcloud run services delete matrix-game-eval --region=$REGION

# Delete Artifact Registry repository
gcloud artifacts repositories delete $REPO_NAME --location=$REGION

# Delete Workload Identity Provider and Pool
gcloud iam workload-identity-pools providers delete $PROVIDER_NAME \
  --location="global" \
  --workload-identity-pool=$POOL_NAME

gcloud iam workload-identity-pools delete $POOL_NAME --location="global"

# Delete Service Account
gcloud iam service-accounts delete $SERVICE_ACCOUNT_EMAIL
```