import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getBucketName } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const comparison = await prisma.twoVideoComparisonTask.findUnique({
      where: { id },
      include: {
        experiment: {
          select: {
            name: true,
            config: true
          }
        }
      }
    })

    if (!comparison) {
      return NextResponse.json(
        { error: 'Comparison not found' },
        { status: 404 }
      )
    }

    // Import scenarios to get metadata
    const { PREDEFINED_SCENARIOS } = await import('@/lib/scenarios')
    
    // Find scenario metadata
    const scenario = PREDEFINED_SCENARIOS.find(s => s.id === comparison.scenarioId)
    
    // Convert Tigris URLs to local proxy URLs
    const convertToProxyUrl = (tigrisUrl: string) => {
      if (tigrisUrl.includes('t3.storage.dev') || tigrisUrl.includes('fly.storage.tigris.dev') || tigrisUrl.includes('.fly.storage.tigris.dev')) {
        // For URLs like https://gary-owl-eval-dev.fly.storage.tigris.dev/video-library/file.mp4
        // Extract everything after the domain
        const bucketName = getBucketName();
        
        // Try different patterns to extract the path
        let path = ''
        
        // Pattern 1: https://bucket.fly.storage.tigris.dev/path/file.ext
        if (tigrisUrl.includes('.fly.storage.tigris.dev/')) {
          const parts = tigrisUrl.split('.fly.storage.tigris.dev/')
          if (parts.length > 1) {
            path = parts[1]
          }
        }
        // Pattern 2: https://fly.storage.tigris.dev/bucket/path/file.ext
        else if (tigrisUrl.includes('fly.storage.tigris.dev/')) {
          const urlParts = tigrisUrl.split(`/${bucketName}/`)
          if (urlParts.length > 1) {
            path = urlParts[1]
          }
        }
        // Pattern 3: https://t3.storage.dev/bucket/path/file.ext
        else if (tigrisUrl.includes('t3.storage.dev/')) {
          const urlParts = tigrisUrl.split(`/${bucketName}/`)
          if (urlParts.length > 1) {
            path = urlParts[1]
          }
        }
        
        if (path) {
          return `/api/video/${path}`
        }
      }
      
      return tigrisUrl
    }

    // Format the response to match the expected structure
    const formattedComparison = {
      comparison_id: comparison.id,
      scenario_id: comparison.scenarioId,
      scenario_metadata: scenario ? {
        name: scenario.name,
        description: scenario.description
      } : (comparison.metadata || {
        name: comparison.scenarioId,
        description: `Custom scenario: ${comparison.scenarioId}`
      }),
      model_a_video_path: convertToProxyUrl(comparison.videoAPath),
      model_b_video_path: convertToProxyUrl(comparison.videoBPath),
      randomized_labels: {
        A: comparison.modelA,
        B: comparison.modelB
      }
    }

    return NextResponse.json(formattedComparison)
  } catch (error) {
    console.error('Error fetching comparison:', error)
    return NextResponse.json(
      { error: 'Failed to fetch comparison' },
      { status: 500 }
    )
  }
}