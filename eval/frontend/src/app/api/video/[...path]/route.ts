import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { requireAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'

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
    
    // Check if user has access to this video
    if (!authResult.devMode && authResult.user?.id) {
      const hasAccess = await checkVideoAccess(authResult.user.id, videoPath);
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
    }
    
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

// Check if user has access to the video based on organization membership
async function checkVideoAccess(userId: string, videoPath: string): Promise<boolean> {
  try {
    // Get user's organizations
    const { getUserOrganizations } = await import('@/lib/organization');
    const userOrgs = await getUserOrganizations(userId);
    const userOrgIds = userOrgs.map(uo => uo.organization.id);

    // For video-library paths, check if video belongs to user's organization
    if (videoPath.startsWith('video-library/')) {
      const video = await prisma.video.findFirst({
        where: { key: videoPath }
      });
      
      if (!video) return false;
      
      // Allow access if video has no organization (shared) or user belongs to video's org
      return !video.organizationId || userOrgIds.includes(video.organizationId);
    }
    
    // For experiment paths (experiments/{expId}/...), check experiment ownership
    if (videoPath.startsWith('experiments/')) {
      const pathParts = videoPath.split('/');
      if (pathParts.length >= 2) {
        const experimentId = pathParts[1];
        const experiment = await prisma.experiment.findFirst({
          where: { id: experimentId }
        });
        
        if (!experiment) return false;
        
        // Allow access if experiment belongs to user's organization
        return !experiment.organizationId || userOrgIds.includes(experiment.organizationId);
      }
    }
    
    // Default deny for unknown paths
    return false;
  } catch (error) {
    console.error('Error checking video access:', error);
    return false;
  }
}