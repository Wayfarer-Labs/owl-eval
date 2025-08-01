import { NextRequest, NextResponse } from 'next/server'
import { uploadVideoToTigris } from '@/lib/storage'
import { requireAdmin } from '@/lib/auth-middleware'
import { nanoid } from 'nanoid'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  // Check admin authentication
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  // Get user's organization
  let organizationId = null;
  if (authResult.user?.id) {
    try {
      const { getUserOrganizations } = await import('@/lib/organization');
      const organizations = await getUserOrganizations(authResult.user.id);
      organizationId = organizations[0]?.organization?.id || null;
    } catch (error) {
      console.warn('Could not get user organization for video upload:', error);
    }
  }

  try {
    const formData = await request.formData()
    const file = formData.get('video') as File
    const modelName = formData.get('modelName') as string | null

    if (!file) {
      return NextResponse.json(
        { error: 'No video file provided' },
        { status: 400 }
      )
    }

    if (!file.type.startsWith('video/')) {
      return NextResponse.json(
        { error: 'File must be a video' },
        { status: 400 }
      )
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer())
    
    // Generate key for video library (not tied to specific experiment)
    const fileExtension = file.name.split('.').pop() || 'mp4'
    const uniqueId = nanoid(8)
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const key = `video-library/${uniqueId}_${sanitizedName}`
    
    // Upload to Tigris
    const videoUrl = await uploadVideoToTigris(buffer, key, file.type)

    // Save video record to database
    const video = await prisma.video.create({
      data: {
        key,
        name: file.name,
        url: videoUrl,
        size: file.size,
        organizationId,
        tags: [],
        groups: [],
        modelName: modelName || null,
        metadata: {
          originalName: file.name,
          mimeType: file.type,
          uploadedBy: authResult.user?.id || 'dev-mode',
          modelName: modelName || null
        }
      }
    })

    return NextResponse.json({ 
      success: true, 
      id: video.id,
      videoUrl,
      key,
      name: file.name,
      uploadedBy: authResult.user?.id || 'dev-mode'
    })
  } catch (error) {
    console.error('Error uploading video to library:', error)
    return NextResponse.json(
      { error: 'Failed to upload video' },
      { status: 500 }
    )
  }
}