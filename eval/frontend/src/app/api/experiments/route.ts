import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

async function fetchExperimentsWithRetry(retryCount = 0): Promise<any[]> {
  try {
    return await prisma.experiment.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        status: true,
        archived: true,
        archivedAt: true,
        group: true,
        prolificStudyId: true,
        evaluationMode: true,
        config: true,
        createdAt: true,
        updatedAt: true,
        startedAt: true,
        completedAt: true,
        _count: {
          select: {
            twoVideoComparisonTasks: true,
            singleVideoEvaluationTasks: true,
            participants: {
              where: {
                AND: [
                  {
                    id: {
                      not: {
                        startsWith: 'anon-session-'
                      }
                    }
                  },
                  {
                    status: {
                      not: 'returned'  // Always exclude returned participants
                    }
                  }
                ]
              }
            },
            twoVideoComparisonSubmissions: {
              where: {
                status: 'completed',
                participant: {
                  AND: [
                    {
                      id: {
                        not: {
                          startsWith: 'anon-session-'
                        }
                      }
                    },
                    {
                      status: {
                        not: 'returned'  // Always exclude returned participants
                      }
                    }
                  ]
                }
              }
            },
            singleVideoEvaluationSubmissions: {
              where: {
                status: 'completed',
                participant: {
                  AND: [
                    {
                      id: {
                        not: {
                          startsWith: 'anon-session-'
                        }
                      }
                    },
                    {
                      status: {
                        not: 'returned'  // Always exclude returned participants
                      }
                    }
                  ]
                }
              }
            },
          }
        }
      }
    });
  } catch (error) {
    const isRetryableError = error instanceof PrismaClientKnownRequestError && 
      ['P1001', 'P1008', 'P1017', 'P2024'].includes(error.code);
    
    if (isRetryableError && retryCount < 2) {
      console.warn(`Database operation failed (attempt ${retryCount + 1}/3). Retrying...`, error.code);
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      return fetchExperimentsWithRetry(retryCount + 1);
    }
    
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
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
        console.warn('Could not get user organization for experiment fetching:', error);
      }
    }

    // Fetch experiments for the user's organization (or all if no organization)
    const experimentsRaw = await prisma.experiment.findMany({
      where: organizationId ? { organizationId } : {},
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        status: true,
        archived: true,
        archivedAt: true,
        group: true,
        prolificStudyId: true,
        evaluationMode: true,
        config: true,
        createdAt: true,
        updatedAt: true,
        startedAt: true,
        completedAt: true,
        organizationId: true,
        _count: {
          select: {
            twoVideoComparisonTasks: true,
            singleVideoEvaluationTasks: true,
          }
        },
        participants: {
          select: {
            id: true,
            prolificId: true,
            status: true
          }
        },
        twoVideoComparisonSubmissions: {
          where: {
            status: 'completed'
          },
          select: {
            participantId: true,
            participant: {
              select: {
                id: true,
                prolificId: true,
                status: true
              }
            }
          }
        },
        singleVideoEvaluationSubmissions: {
          where: {
            status: 'completed'
          },
          select: {
            participantId: true,
            participant: {
              select: {
                id: true,
                prolificId: true,
                status: true
              }
            }
          }
        }
      }
    });

    // Process experiments to compute correct counts based on experiment type
    const experiments = experimentsRaw.map(exp => {
      // Determine valid participant filter based on experiment type - match CLI logic exactly
      const participantStatusFilter = exp.prolificStudyId 
        ? ['approved']  // For Prolific experiments, only count approved
        : ['active', 'completed', 'approved'];  // For non-Prolific experiments, count all valid statuses
        
      const validParticipants = exp.participants.filter(participant => 
        participantStatusFilter.includes(participant.status) && 
        participant.prolificId &&
        !participant.prolificId.startsWith('anon-')  // Exclude anonymous participants
      );

      const validParticipantIds = validParticipants.map(p => p.id);

      // Count submissions from valid participants only
      const validTwoVideoSubmissions = exp.twoVideoComparisonSubmissions.filter(sub =>
        validParticipantIds.includes(sub.participantId)
      );

      const validSingleVideoSubmissions = exp.singleVideoEvaluationSubmissions.filter(sub =>
        validParticipantIds.includes(sub.participantId)
      );

      return {
        ...exp,
        participants: undefined,  // Remove participants data from response
        twoVideoComparisonSubmissions: undefined,  // Remove submissions data from response
        singleVideoEvaluationSubmissions: undefined,  // Remove submissions data from response
        _count: {
          twoVideoComparisonTasks: exp._count.twoVideoComparisonTasks,
          singleVideoEvaluationTasks: exp._count.singleVideoEvaluationTasks,
          participants: validParticipants.length,
          twoVideoComparisonSubmissions: validTwoVideoSubmissions.length,
          singleVideoEvaluationSubmissions: validSingleVideoSubmissions.length,
        }
      };
    });
    
    return NextResponse.json(experiments);
  } catch (error) {
    console.error('Error fetching experiments:', error);
    
    if (error instanceof PrismaClientKnownRequestError) {
      const errorMessage = error.code === 'P1001' ? 'Database connection timeout' : 'Database error';
      return NextResponse.json({ error: errorMessage }, { status: 503 });
    }
    
    return NextResponse.json({ error: 'Failed to fetch experiments' }, { status: 500 });
  }
}

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
      console.warn('Could not get user organization for experiment creation:', error);
    }
  }

  try {
    const { name, description, slug, group, comparisons, evaluationMode = 'comparison', demographics } = await request.json();

    if (!name || !comparisons || !Array.isArray(comparisons)) {
      return NextResponse.json(
        { error: 'Name and comparisons are required' },
        { status: 400 }
      );
    }

    // Validate that all comparisons have required fields based on evaluation mode
    for (const comp of comparisons) {
      if (!comp.scenarioId || !comp.modelA || !comp.videoAUrl) {
        return NextResponse.json(
          { error: 'All tasks must have scenarioId, modelA, and videoAUrl' },
          { status: 400 }
        );
      }
      
      // Additional validation for comparison mode
      if (evaluationMode === 'comparison') {
        if (!comp.modelB || !comp.videoBUrl) {
          return NextResponse.json(
            { error: 'Comparison mode requires modelB and videoBUrl for all comparisons' },
            { status: 400 }
          );
        }
      }
    }

    // Generate unique slug
    let experimentSlug = slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-')
    
    // Check if slug already exists and make it unique if needed
    let slugExists = await prisma.experiment.findUnique({
      where: { slug: experimentSlug },
      select: { id: true }
    })
    
    let counter = 1
    const baseSlug = experimentSlug
    
    while (slugExists) {
      experimentSlug = `${baseSlug}-${counter}`
      slugExists = await prisma.experiment.findUnique({
        where: { slug: experimentSlug },
        select: { id: true }
      })
      counter++
    }

    // Create experiment with either comparisons or video tasks based on evaluation mode
    const experimentData: any = {
      name,
      description: description || null,
      slug: experimentSlug,
      group: group || null,
      status: 'draft',
      evaluationMode: evaluationMode,
      organizationId,
      config: {
        models: evaluationMode === 'comparison' 
          ? Array.from(new Set([...comparisons.map(c => c.modelA), ...comparisons.map(c => c.modelB)]))
          : Array.from(new Set(comparisons.map(c => c.modelA))),
        scenarios: Array.from(new Set(comparisons.map(c => c.scenarioId))),
        demographics: demographics || null
      },
      createdBy: authResult.user?.id || null,
    }

    if (evaluationMode === 'single_video') {
      // Create video tasks for single video evaluation
      experimentData.singleVideoEvaluationTasks = {
        create: comparisons.map(comp => ({
          scenarioId: comp.scenarioId,
          modelName: comp.modelA,
          videoPath: comp.videoAUrl,
          metadata: comp.metadata || {}
        }))
      }
    } else {
      // Create comparisons for comparison evaluation
      experimentData.twoVideoComparisonTasks = {
        create: comparisons.map(comp => ({
          scenarioId: comp.scenarioId,
          modelA: comp.modelA,
          modelB: comp.modelB,
          videoAPath: comp.videoAUrl,
          videoBPath: comp.videoBUrl,
          metadata: comp.metadata || {}
        }))
      }
    }

    const experiment = await prisma.experiment.create({
      data: experimentData,
      include: {
        twoVideoComparisonTasks: true,
        singleVideoEvaluationTasks: true,
        _count: {
          select: {
            twoVideoComparisonTasks: true,
            singleVideoEvaluationTasks: true,
            participants: {
              where: {
                AND: [
                  {
                    id: {
                      not: {
                        startsWith: 'anon-session-'
                      }
                    }
                  },
                  {
                    status: {
                      not: 'returned'  // Always exclude returned participants
                    }
                  }
                ]
              }
            },
            twoVideoComparisonSubmissions: {
              where: {
                status: 'completed',
                participant: {
                  AND: [
                    {
                      id: {
                        not: {
                          startsWith: 'anon-session-'
                        }
                      }
                    },
                    {
                      status: {
                        not: 'returned'  // Always exclude returned participants
                      }
                    }
                  ]
                }
              }
            },
            singleVideoEvaluationSubmissions: {
              where: {
                status: 'completed',
                participant: {
                  AND: [
                    {
                      id: {
                        not: {
                          startsWith: 'anon-session-'
                        }
                      }
                    },
                    {
                      status: {
                        not: 'returned'  // Always exclude returned participants
                      }
                    }
                  ]
                }
              }
            },
          }
        }
      }
    });

    return NextResponse.json(experiment);
  } catch (error) {
    console.error('Error creating experiment:', error);
    return NextResponse.json(
      { error: 'Failed to create experiment' },
      { status: 500 }
    );
  }
}