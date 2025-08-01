import { NextRequest, NextResponse } from 'next/server'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

// Initialize S3 client for Tigris
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'auto',
  endpoint: process.env.AWS_ENDPOINT_URL_S3 || 'https://t3.storage.dev',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params
    const videoPath = path.join('/')
    const { getBucketName } = require('@/lib/storage');
    const bucketName = getBucketName();
    
    
    // Get object from Tigris
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: videoPath,
    })
    
    const response = await s3Client.send(command)
    
    if (!response.Body) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }
    
    // Convert stream to buffer
    const chunks: Uint8Array[] = []
    const reader = response.Body.transformToWebStream().getReader()
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    
    const buffer = Buffer.concat(chunks)
    
    // Return video with proper headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Accept-Ranges': 'bytes',
      },
    })
    
  } catch (error) {
    console.error('Error proxying video:', error)
    return NextResponse.json(
      { error: 'Failed to load video' },
      { status: 500 }
    )
  }
}