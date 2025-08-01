import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isVisibleToPublic } from '@/lib/utils/status'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    // Get experiment ID from session storage if this is a Prolific participant
    const url = new URL(request.url)
    const experimentId = url.searchParams.get('experimentId')
    
    let videoTasks
    
    if (experimentId) {
      // Get video tasks for specific experiment
      videoTasks = await prisma.singleVideoEvaluationTask.findMany({
        where: { experimentId },
        include: {
          experiment: {
            select: {
              name: true,
              createdAt: true
            }
          },
          _count: {
            select: { 
              singleVideoEvaluationSubmissions: {
                where: {
                  status: 'completed'
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    } else {
      // Get all public-visible experiments' video tasks for non-Prolific users
      const publicExperiments = await prisma.experiment.findMany({
        where: { 
          evaluationMode: 'single_video'
        },
        select: { id: true, status: true }
      })
      
      // Filter experiments that are visible to public
      const visibleExperimentIds = publicExperiments
        .filter(exp => isVisibleToPublic(exp.status))
        .map(exp => exp.id)
      
      videoTasks = await prisma.singleVideoEvaluationTask.findMany({
        where: {
          experimentId: {
            in: visibleExperimentIds
          }
        },
        include: {
          experiment: {
            select: {
              name: true,
              createdAt: true
            }
          },
          _count: {
            select: { 
              singleVideoEvaluationSubmissions: {
                where: {
                  status: 'completed'
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    }
    
    const videoTaskList = videoTasks.map(videoTask => ({
      video_task_id: videoTask.id,
      id: videoTask.id,
      scenario_id: videoTask.scenarioId,
      modelName: videoTask.modelName,
      video_path: videoTask.videoPath,
      created_at: videoTask.createdAt.toISOString(),
      num_evaluations: videoTask._count.singleVideoEvaluationSubmissions,
      evaluation_url: `/evaluate/${videoTask.id}`,
      experiment_name: videoTask.experiment?.name,
      experiment_created_at: videoTask.experiment?.createdAt.toISOString()
    }))
    
    return NextResponse.json(videoTaskList)
  } catch (error) {
    console.error('Error fetching video tasks:', error)
    return NextResponse.json({ error: 'Failed to fetch video tasks' }, { status: 500 })
  }
}