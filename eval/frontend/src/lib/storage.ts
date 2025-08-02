import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'


// Lazy initialization of Tigris client to ensure environment variables are loaded
let tigrisClient: S3Client | null = null;

export function getTigrisClient(): S3Client {
  if (!tigrisClient) {
    
    tigrisClient = new S3Client({
      endpoint: process.env.AWS_ENDPOINT_URL_S3,
      region: process.env.AWS_REGION,
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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    // Fallback: try to detect from window.location in browser
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol;
      const host = window.location.host;
      return `${protocol}//${host}/api/video/${key}`;
    } else {
      // Server-side: NEXT_PUBLIC_APP_URL must be set properly in production
      throw new Error('NEXT_PUBLIC_APP_URL environment variable is required for server-side video URL generation');
    }
  }
  return `${baseUrl}/api/video/${key}`;
}

// Convert any video URL to use the correct current domain
export function normalizeVideoUrl(url: string): string {
  // Extract key from various URL formats
  let key: string | null = null;
  
  // From direct Tigris URL
  const tigrisPattern = /https:\/\/[^.]+\.fly\.storage\.tigris\.dev\/(.+)/;
  const tigrisMatch = url.match(tigrisPattern);
  if (tigrisMatch) {
    key = tigrisMatch[1];
  }
  
  // From proxy URL with any domain
  const proxyPattern = /https?:\/\/[^/]+\/api\/video\/(.+)/;
  const proxyMatch = url.match(proxyPattern);
  if (proxyMatch) {
    key = proxyMatch[1];
  }
  
  // If we extracted a key, generate new URL with current domain
  if (key) {
    return getProxyVideoUrl(key);
  }
  
  // If no pattern matched, return as-is
  return url;
}

// Legacy function for backward compatibility
export function convertToProxyUrl(directUrl: string): string {
  return normalizeVideoUrl(directUrl);
}