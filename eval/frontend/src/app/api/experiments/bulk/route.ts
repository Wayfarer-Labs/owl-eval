import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateUniqueSlug } from '@/lib/utils/slug'
import { requireAuth } from '@/lib/auth-middleware'

interface ComparisonMatrix {
  scenarios: string[]
  models: string[]
  videoAssignment: 'auto' | 'manual' | 'random'
  randomization: {
    orderRandomization: boolean
    modelPositionRandomization: boolean
    seed?: number
  }
}

interface BulkExperimentRequest {
  name: string
  description?: string
  slug: string
  group?: string
  mode: 'matrix' | 'manual' | 'template'
  matrix?: ComparisonMatrix
  totalComparisons: number
}

interface VideoAssignmentResult {
  modelA: string
  modelB: string
  videoAUrl: string
  videoBUrl: string
  scenarioId: string
  metadata: any
}

async function findVideosForModel(modelName: string, scenarioId?: string) {
  return await prisma.video.findMany({
    where: {
      modelName,
      ...(scenarioId && { scenarioId })
    }
  })
}

async function assignVideosAutomatically(
  modelA: string, 
  modelB: string, 
  scenarioId: string
): Promise<{ videoAUrl: string; videoBUrl: string } | null> {
  // Find videos for both models in this scenario
  const videosA = await findVideosForModel(modelA, scenarioId)
  const videosB = await findVideosForModel(modelB, scenarioId)

  if (videosA.length === 0 || videosB.length === 0) {
    // Fallback: try to find videos by model name only
    const fallbackVideosA = await findVideosForModel(modelA)
    const fallbackVideosB = await findVideosForModel(modelB)
    
    if (fallbackVideosA.length === 0 || fallbackVideosB.length === 0) {
      return null
    }
    
    // Use first available video for each model
    return {
      videoAUrl: fallbackVideosA[0].url,
      videoBUrl: fallbackVideosB[0].url
    }
  }

  // Use first available video for each model in the scenario
  return {
    videoAUrl: videosA[0].url,
    videoBUrl: videosB[0].url
  }
}

async function assignVideosRandomly(
  modelA: string, 
  modelB: string, 
  scenarioId: string,
  seed?: number
): Promise<{ videoAUrl: string; videoBUrl: string } | null> {
  const videosA = await findVideosForModel(modelA, scenarioId)
  const videosB = await findVideosForModel(modelB, scenarioId)

  if (videosA.length === 0 || videosB.length === 0) {
    return null
  }

  // Simple random selection (could be enhanced with proper seeded randomization)
  const randomA = Math.floor(Math.random() * videosA.length)
  const randomB = Math.floor(Math.random() * videosB.length)

  return {
    videoAUrl: videosA[randomA].url,
    videoBUrl: videosB[randomB].url
  }
}

function generateModelPairs(models: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  
  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      pairs.push([models[i], models[j]])
    }
  }
  
  return pairs
}

async function generateMatrixComparisons(matrix: ComparisonMatrix): Promise<VideoAssignmentResult[]> {
  const { scenarios, models, videoAssignment, randomization } = matrix
  const comparisons: VideoAssignmentResult[] = []
  
  // Generate all model pairs
  const modelPairs = generateModelPairs(models)
  
  for (const scenarioId of scenarios) {
    for (const [modelA, modelB] of modelPairs) {
      let videoAssignmentResult: { videoAUrl: string; videoBUrl: string } | null = null
      
      // Assign videos based on strategy
      switch (videoAssignment) {
        case 'auto':
          videoAssignmentResult = await assignVideosAutomatically(modelA, modelB, scenarioId)
          break
        case 'random':
          videoAssignmentResult = await assignVideosRandomly(modelA, modelB, scenarioId, randomization.seed)
          break
        case 'manual':
          // For manual assignment, we'll need additional UI - skip for now
          throw new Error('Manual video assignment not yet implemented')
      }
      
      if (!videoAssignmentResult) {
        throw new Error(`Could not find videos for comparison: ${modelA} vs ${modelB} in scenario ${scenarioId}`)
      }
      
      // Apply model position randomization if enabled
      let finalModelA = modelA
      let finalModelB = modelB
      let finalVideoA = videoAssignmentResult.videoAUrl
      let finalVideoB = videoAssignmentResult.videoBUrl
      
      if (randomization.modelPositionRandomization) {
        const shouldSwap = Math.random() < 0.5
        if (shouldSwap) {
          finalModelA = modelB
          finalModelB = modelA
          finalVideoA = videoAssignmentResult.videoBUrl
          finalVideoB = videoAssignmentResult.videoAUrl
        }
      }
      
      comparisons.push({
        modelA: finalModelA,
        modelB: finalModelB,
        videoAUrl: finalVideoA,
        videoBUrl: finalVideoB,
        scenarioId,
        metadata: {
          originalPair: [modelA, modelB],
          positionSwapped: finalModelA !== modelA,
          assignmentStrategy: videoAssignment
        }
      })
    }
  }
  
  // Apply order randomization if enabled
  if (randomization.orderRandomization) {
    // Fisher-Yates shuffle
    for (let i = comparisons.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [comparisons[i], comparisons[j]] = [comparisons[j], comparisons[i]]
    }
  }
  
  return comparisons
}

export async function POST(request: NextRequest) {
  // Check authentication
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  // Get user's organization
  let organizationId = null;
  if (authResult.user?.id) {
    try {
      const { getUserOrganizations } = await import('@/lib/organization');
      const organizations = await getUserOrganizations(authResult.user.id);
      organizationId = organizations?.[0]?.organization?.id || null;
      
      if (!organizationId) {
        return NextResponse.json(
          { error: 'No organization found. Please create or join an organization first.' },
          { status: 400 }
        );
      }
    } catch (error) {
      console.warn('Could not get user organization for bulk experiment creation:', error);
      return NextResponse.json(
        { error: 'Failed to get organization context' },
        { status: 500 }
      );
    }
  }

  try {
    const body: BulkExperimentRequest = await request.json()
    
    // Validate required fields
    if (!body.name || !body.slug) {
      return NextResponse.json(
        { error: 'Name and slug are required' },
        { status: 400 }
      )
    }
    
    if (body.mode !== 'matrix' || !body.matrix) {
      return NextResponse.json(
        { error: 'Only matrix mode is currently supported' },
        { status: 400 }
      )
    }
    
    // Ensure unique slug
    const uniqueSlug = await generateUniqueSlug(body.slug, 'experiment')
    
    // Generate comparisons based on matrix
    const comparisons = await generateMatrixComparisons(body.matrix)
    
    if (comparisons.length === 0) {
      return NextResponse.json(
        { error: 'No comparisons could be generated with the given configuration' },
        { status: 400 }
      )
    }
    
    // Create experiment and comparisons in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the experiment
      const experiment = await tx.experiment.create({
        data: {
          name: body.name,
          description: body.description || '',
          slug: uniqueSlug,
          group: body.group || '',
          status: 'draft',
          organizationId: organizationId,
          createdBy: authResult.user?.id || null,
          config: {
            mode: body.mode,
            matrix: body.matrix as any,
            totalComparisons: comparisons.length,
            createdAt: new Date().toISOString()
          }
        }
      })
      
      // Create all comparisons
      const comparisonData = comparisons.map((comp, index) => ({
        experimentId: experiment.id,
        scenarioId: comp.scenarioId,
        modelA: comp.modelA,
        modelB: comp.modelB,
        videoAPath: comp.videoAUrl,
        videoBPath: comp.videoBUrl,
        metadata: {
          ...comp.metadata,
          order: index,
          generatedAt: new Date().toISOString()
        }
      }))
      
      await tx.twoVideoComparisonTask.createMany({
        data: comparisonData
      })
      
      return {
        experiment,
        comparisonsCreated: comparisons.length
      }
    })
    
    return NextResponse.json({
      success: true,
      experiment: {
        id: result.experiment.id,
        name: result.experiment.name,
        slug: result.experiment.slug,
        comparisons: result.comparisonsCreated
      }
    })
    
  } catch (error) {
    console.error('Bulk experiment creation error:', error)
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to create bulk experiment' },
      { status: 500 }
    )
  }
}