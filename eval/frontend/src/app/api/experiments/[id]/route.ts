import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const experiment = await prisma.experiment.findUnique({
      where: { id },
      include: {
        twoVideoComparisonTasks: true,
        _count: {
          select: {
            twoVideoComparisonTasks: true,
            participants: {
              where: {
                id: {
                  not: {
                    startsWith: 'anon-session-'
                  }
                }
              }
            },
            twoVideoComparisonSubmissions: {
              where: {
                participant: {
                  id: {
                    not: {
                      startsWith: 'anon-session-'
                    }
                  }
                }
              }
            },
          }
        }
      }
    });

    if (!experiment) {
      return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
    }

    return NextResponse.json(experiment);
  } catch (error) {
    console.error('Error fetching experiment:', error);
    return NextResponse.json({ error: 'Failed to fetch experiment' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check authentication
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { id } = await params;
    const { name, description, status, archived, group } = await request.json();

    const experiment = await prisma.experiment.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(group !== undefined && { group }),
        ...(status && { status }),
        ...(archived !== undefined && { 
          archived,
          ...(archived && { archivedAt: new Date() }),
          ...(!archived && { archivedAt: null })
        }),
        updatedAt: new Date(),
        ...(status === 'active' && { startedAt: new Date() }),
        ...(status === 'completed' && { completedAt: new Date() })
      },
      include: {
        _count: {
          select: {
            twoVideoComparisonTasks: true,
            participants: {
              where: {
                id: {
                  not: {
                    startsWith: 'anon-session-'
                  }
                }
              }
            },
            twoVideoComparisonSubmissions: {
              where: {
                participant: {
                  id: {
                    not: {
                      startsWith: 'anon-session-'
                    }
                  }
                }
              }
            },
          }
        }
      }
    });

    return NextResponse.json(experiment);
  } catch (error) {
    console.error('Error updating experiment:', error);
    return NextResponse.json({ error: 'Failed to update experiment' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check authentication
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { id } = await params;
    // First check if experiment exists
    const experiment = await prisma.experiment.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            twoVideoComparisonSubmissions: {
              where: {
                participant: {
                  id: {
                    not: {
                      startsWith: 'anon-session-'
                    }
                  }
                }
              }
            },
            singleVideoEvaluationSubmissions: {
              where: {
                status: 'completed',
                participant: {
                  id: {
                    not: {
                      startsWith: 'anon-session-'
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!experiment) {
      return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
    }

    // Check if experiment has evaluations and is not archived
    const totalEvaluations = experiment._count.twoVideoComparisonSubmissions + (experiment._count.singleVideoEvaluationSubmissions || 0);
    if (totalEvaluations > 0 && !experiment.archived) {
      return NextResponse.json(
        { error: 'Cannot delete experiment with existing evaluations. Archive it first.' },
        { status: 400 }
      );
    }

    // Delete related data in correct order to avoid foreign key constraint violations
    
    // First, get all participants for this experiment
    const participants = await prisma.participant.findMany({
      where: { experimentId: id },
      select: { id: true }
    });
    
    const participantIds = participants.map(p => p.id);

    // 1. Delete all submissions by participant ID to ensure we catch all references
    await prisma.twoVideoComparisonSubmission.deleteMany({
      where: { 
        participantId: { in: participantIds }
      }
    });

    await prisma.singleVideoEvaluationSubmission.deleteMany({
      where: { 
        participantId: { in: participantIds }
      }
    });

    // 2. Also delete any submissions directly by experiment ID as a safety net
    await prisma.twoVideoComparisonSubmission.deleteMany({
      where: { experimentId: id }
    });

    await prisma.singleVideoEvaluationSubmission.deleteMany({
      where: { experimentId: id }
    });

    // 3. Now safe to delete participants (no more foreign key references)
    await prisma.participant.deleteMany({
      where: { experimentId: id }
    });

    // 4. Delete comparisons (they reference experiment)
    await prisma.twoVideoComparisonTask.deleteMany({
      where: { experimentId: id }
    });

    // 5. Delete video tasks (they reference experiment)
    await prisma.singleVideoEvaluationTask.deleteMany({
      where: { experimentId: id }
    });

    // 6. Finally delete the experiment
    await prisma.experiment.delete({
      where: { id }
    });

    return NextResponse.json({ message: 'Experiment deleted successfully' });
  } catch (error) {
    console.error('Error deleting experiment:', error);
    return NextResponse.json({ error: 'Failed to delete experiment' }, { status: 500 });
  }
}