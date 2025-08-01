import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const videoTask = await prisma.singleVideoEvaluationTask.findUnique({
      where: { id },
      include: {
        experiment: {
          select: {
            id: true,
            name: true,
            status: true
          }
        }
      }
    })

    if (!videoTask) {
      return NextResponse.json({ error: 'Video task not found' }, { status: 404 })
    }

    // Get scenario metadata (you might need to implement this based on your scenario system)
    const scenarioMetadata = {
      name: videoTask.scenarioId,
      description: `Video evaluation for ${videoTask.modelName} on ${videoTask.scenarioId}`
    }

    const response = {
      video_task_id: videoTask.id,
      scenario_id: videoTask.scenarioId,
      modelName: videoTask.modelName,
      video_path: videoTask.videoPath,
      scenario_metadata: scenarioMetadata,
      experiment: videoTask.experiment,
      created_at: videoTask.createdAt.toISOString()
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching video task:', error)
    return NextResponse.json({ error: 'Failed to fetch video task' }, { status: 500 })
  }
}