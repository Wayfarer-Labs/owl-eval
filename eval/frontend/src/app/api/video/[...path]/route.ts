import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { requireAuth } from '@/lib/auth-middleware'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Check authentication
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { path } = await params
    const videoPath = path.join('/')
    const { getBucketName, getTigrisClient } = await import('@/lib/storage');
    const bucketName = getBucketName();
    const s3Client = getTigrisClient();
    
    // Videos are accessible to all authenticated users for evaluation purposes
    // The authentication requirement provides sufficient access control
    
    // Get object from Tigris
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: videoPath,
    })
    
    const response = await s3Client.send(command)
    
    if (!response.Body) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }
    
    // For now, buffer the video to avoid streaming issues
    // TODO: Implement range requests for proper video streaming
    const chunks: Uint8Array[] = []
    const reader = response.Body.transformToWebStream().getReader()
    
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
    } catch (error) {
      console.error('Error reading video stream:', error)
      return NextResponse.json({ error: 'Failed to read video' }, { status: 500 })
    } finally {
      // Ensure reader is properly closed
      try {
        reader.releaseLock()
      } catch (e) {
        // Reader might already be closed
      }
    }
    
    const buffer = Buffer.concat(chunks)
    
    // Return video with proper headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': response.ContentType || 'video/mp4',
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
        'Accept-Ranges': 'bytes',
        'Last-Modified': response.LastModified?.toUTCString() || '',
        'ETag': response.ETag || '',
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

