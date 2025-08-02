import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'


// Lazy initialization of Tigris client to ensure environment variables are loaded
let tigrisClient: S3Client | null = null;

export function getTigrisClient(): S3Client {
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

  // Return proxy URL instead of direct Tigris URL for security
  return getProxyVideoUrl(key);
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

// Generate proxy URL that goes through our API route instead of direct Tigris access
export function getProxyVideoUrl(key: string): string {
  // In production, this should use the actual app URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/api/video/${key}`;
}

// Convert direct Tigris URLs to proxy URLs (for existing data migration)
export function convertToProxyUrl(directUrl: string): string {
  // Extract key from direct Tigris URL
  const tigrisPattern = /https:\/\/[^.]+\.fly\.storage\.tigris\.dev\/(.+)/;
  const match = directUrl.match(tigrisPattern);
  
  if (match) {
    const key = match[1];
    return getProxyVideoUrl(key);
  }
  
  // If it's already a proxy URL or unrecognized format, return as-is
  return directUrl;
}