import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'


// Lazy initialization of Tigris client to ensure environment variables are loaded
let tigrisClient: S3Client | null = null;

function getTigrisClient(): S3Client {
  if (!tigrisClient) {
    
    tigrisClient = new S3Client({
      endpoint: process.env.AWS_ENDPOINT_URL_S3 || 'https://fly.storage.tigris.dev',
      region: process.env.AWS_REGION || 'auto',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return tigrisClient;
}

export function getBucketName(): string {
  if (!process.env.TIGRIS_BUCKET_NAME) {
    throw new Error('TIGRIS_BUCKET_NAME environment variable is not set');
  }
  return process.env.TIGRIS_BUCKET_NAME;
}

export async function uploadVideoToTigris(
  file: Buffer,
  key: string,
  contentType: string = 'video/mp4'
): Promise<string> {
  const bucketName = getBucketName();
  
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: file,
    ContentType: contentType,
    // Remove ACL - Tigris handles public access differently
  });

  await getTigrisClient().send(command);

  // Return public URL - make sure to use the correct format for Tigris
  const endpoint = `https://${bucketName}.fly.storage.tigris.dev`
  return `${endpoint}/${key}`;
}

export async function getSignedVideoUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  })

  return getSignedUrl(getTigrisClient(), command, { expiresIn })
}

// Helper to organize videos by experiment
export function getVideoKey(experimentId: string, comparisonId: string, modelLabel: string): string {
  return `experiments/${experimentId}/comparisons/${comparisonId}/${modelLabel}.mp4`
}