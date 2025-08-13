import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-middleware'
import { checkOrganizationAccess } from '@/lib/organization'

export async function POST(request: NextRequest) {
  // Check authentication
  const authResult = await requireAuth(request);
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

    // Verify the experiment exists and get organization
    const experiment = await prisma.experiment.findUnique({
      where: { id: experimentId },
      select: { 
        id: true,
        organizationId: true,
        createdBy: true 
      }
    });

    if (!experiment) {
      return NextResponse.json(
        { error: 'Experiment not found' },
        { status: 404 }
      )
    }

    // Check organization access or ownership
    const userId = authResult.user?.id;
    if (!authResult.devMode && userId) {
      if (experiment.organizationId) {
        // If experiment has organization, check organization access
        const hasAccess = await checkOrganizationAccess(experiment.organizationId, userId, 'MEMBER');
        if (!hasAccess) {
          return NextResponse.json(
            { error: 'You need to be a member of this organization to create comparisons' },
            { status: 403 }
          )
        }
      } else if (experiment.createdBy !== userId) {
        // If no organization, fall back to creator check
        return NextResponse.json(
          { error: 'You can only create comparisons for your own experiments' },
          { status: 403 }
        )
      }
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