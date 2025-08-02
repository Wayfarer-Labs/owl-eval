import { NextRequest, NextResponse } from 'next/server'
import { uploadVideoToTigris, getVideoKey } from '@/lib/storage'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-middleware'

export async function POST(request: NextRequest) {
  // Check authentication
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult; // Return error response if not authenticated
  }

  try {
    const formData = await request.formData()
    const file = formData.get('video') as File
    const experimentId = formData.get('experimentId') as string
    const comparisonId = formData.get('comparisonId') as string
    const modelLabel = formData.get('modelLabel') as string // 'modelA' or 'modelB'

    if (!file || !experimentId || !comparisonId || !modelLabel) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify the experiment exists and optionally check ownership
    const experiment = await prisma.experiment.findUnique({
      where: { id: experimentId }
    });

    if (!experiment) {
      return NextResponse.json(
        { error: 'Experiment not found' },
        { status: 404 }
      )
    }

    // In production, you might want to check if the user owns this experiment
    if (!authResult.devMode && authResult.user && experiment.createdBy !== authResult.user.id) {
      return NextResponse.json(
        { error: 'You can only upload videos to your own experiments' },
        { status: 403 }
      )
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer())
    
    // Generate key with experiment organization
    const key = getVideoKey(experimentId, comparisonId, modelLabel)
    
    // Upload to Tigris
    const videoUrl = await uploadVideoToTigris(buffer, key, file.type)
    
    // Update comparison with video URL
    const updateField = modelLabel === 'modelA' ? 'videoAPath' : 'videoBPath'
    await prisma.twoVideoComparisonTask.update({
      where: { id: comparisonId },
      data: { [updateField]: videoUrl }
    })

    return NextResponse.json({ 
      success: true, 
      videoUrl,
      key,
      uploadedBy: authResult.user?.id || 'dev-mode'
    })
  } catch (error) {
    console.error('Error uploading video:', error)
    return NextResponse.json(
      { error: 'Failed to upload video' },
      { status: 500 }
    )
  }
}