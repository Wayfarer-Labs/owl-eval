import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth-middleware'

export async function POST(request: NextRequest) {
  // Check admin authentication
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult; // Return error response if not authenticated
  }

  try {
    const body = await request.json()
    const { 
      experimentId, 
      scenarioId, 
      modelA, 
      modelB, 
      videoAPath, 
      videoBPath, 
      metadata 
    } = body

    if (!experimentId || !scenarioId || !modelA || !modelB) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify the experiment exists
    const experiment = await prisma.experiment.findUnique({
      where: { id: experimentId }
    });

    if (!experiment) {
      return NextResponse.json(
        { error: 'Experiment not found' },
        { status: 404 }
      )
    }

    // Check ownership if not in dev mode
    if (!authResult.devMode && authResult.user && experiment.createdBy !== authResult.user.id) {
      return NextResponse.json(
        { error: 'You can only create comparisons for your own experiments' },
        { status: 403 }
      )
    }

    // Create the comparison
    const comparison = await prisma.twoVideoComparisonTask.create({
      data: {
        experimentId,
        scenarioId,
        modelA,
        modelB,
        videoAPath: videoAPath || '',
        videoBPath: videoBPath || '',
        metadata: metadata || {}
      }
    })

    if (!authResult.user?.id) {
      throw new Error('User ID is required but not found in auth result');
    }

    return NextResponse.json({ 
      success: true, 
      comparison,
      createdBy: authResult.user.id
    })
  } catch (error) {
    console.error('Error creating comparison:', error)
    return NextResponse.json(
      { error: 'Failed to create comparison' },
      { status: 500 }
    )
  }
}