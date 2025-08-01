import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { Experiment } from '@prisma/client';
import { ExperimentStatus } from '@/lib/utils/status';

export interface CreateExperimentData {
  name: string;
  description?: string;
  evaluationMode: string;
  config: any;
  organizationId: string;
}

export interface UpdateExperimentData {
  name?: string;
  description?: string;
  status?: ExperimentStatus;
  archived?: boolean;
  config?: any;
}

export class ExperimentService {
  /**
   * Get all experiments for an organization
   */
  static async getExperimentsByOrganization(
    organizationId: string, 
    options?: { groupFilter?: string | null; includeAnonymous?: boolean }
  ) {
    const { groupFilter, includeAnonymous = false } = options || {};
    
    // Fetch experiments with full participant data to compute correct counts
    const experimentsRaw = await prisma.experiment.findMany({
      where: {
        organizationId,
        archived: false,
        ...(groupFilter && { group: groupFilter }),
      },
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
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Process experiments to compute correct counts based on experiment type
    const experiments = experimentsRaw.map(exp => {
      // Determine valid participant filter based on experiment type - match CLI logic exactly
      const participantStatusFilter = exp.prolificStudyId 
        ? ['approved']  // For Prolific experiments, only count approved
        : ['active', 'completed', 'approved'];  // For non-Prolific experiments, count all valid statuses
        
      const validParticipants = exp.participants.filter(participant => {
        // Must have a prolific ID and not be anonymous
        if (!participant.prolificId || participant.prolificId.startsWith('anon-')) {
          return false;
        }
        
        // Must have valid status
        if (!participantStatusFilter.includes(participant.status)) {
          return false;
        }
        
        // Additional anonymous check for includeAnonymous option
        if (!includeAnonymous && participant.id.startsWith('anon-session-')) {
          return false;
        }
        
        return true;
      });

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

    return experiments;
  }

  /**
   * Get a specific experiment by ID within an organization
   */
  static async getExperimentById(
    experimentId: string,
    organizationId: string
  ): Promise<Experiment | null> {
    return await prisma.experiment.findFirst({
      where: {
        id: experimentId,
        organizationId,
      },
      include: {
        twoVideoComparisonTasks: true,
        singleVideoEvaluationTasks: true,
        participants: true,
        _count: {
          select: {
            twoVideoComparisonSubmissions: true,
            singleVideoEvaluationSubmissions: true,
          },
        },
      },
    });
  }

  /**
   * Create a new experiment within an organization
   */
  static async createExperiment(data: CreateExperimentData) {
    // Generate unique slug
    const baseSlug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    let slug = baseSlug;
    let counter = 1;

    while (await prisma.experiment.findFirst({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const experiment = await prisma.experiment.create({
      data: {
        name: data.name,
        description: data.description,
        slug,
        evaluationMode: data.evaluationMode,
        config: data.config,
        organizationId: data.organizationId,
        status: ExperimentStatus.DRAFT,
      },
      include: {
        _count: {
          select: {
            twoVideoComparisonTasks: true,
            singleVideoEvaluationTasks: true,
            participants: true,
            twoVideoComparisonSubmissions: true,
            singleVideoEvaluationSubmissions: true,
          },
        },
      },
    });

    revalidatePath(`/api/experiments`);
    return experiment;
  }

  /**
   * Update an experiment within the organization
   */
  static async updateExperiment(
    experimentId: string,
    organizationId: string,
    data: UpdateExperimentData
  ) {
    // Verify experiment belongs to organization
    const existingExperiment = await prisma.experiment.findFirst({
      where: {
        id: experimentId,
        organizationId,
      },
    });

    if (!existingExperiment) {
      throw new Error('Experiment not found or access denied');
    }

    const experiment = await prisma.experiment.update({
      where: {
        id: experimentId,
      },
      data: {
        ...data,
        ...(data.status === ExperimentStatus.ACTIVE && existingExperiment.status !== ExperimentStatus.ACTIVE 
          ? { startedAt: new Date() }
          : {}),
        ...(data.status === ExperimentStatus.COMPLETED && existingExperiment.status !== ExperimentStatus.COMPLETED
          ? { completedAt: new Date() }
          : {}),
        ...(data.archived === true && !existingExperiment.archived
          ? { archivedAt: new Date() }
          : {}),
      },
      include: {
        _count: {
          select: {
            twoVideoComparisonTasks: true,
            singleVideoEvaluationTasks: true,
            participants: true,
            twoVideoComparisonSubmissions: true,
            singleVideoEvaluationSubmissions: true,
          },
        },
      },
    });

    revalidatePath(`/api/experiments`);
    return experiment;
  }

  /**
   * Delete an experiment within the organization
   */
  static async deleteExperiment(experimentId: string, organizationId: string) {
    // Verify experiment belongs to organization
    const existingExperiment = await prisma.experiment.findFirst({
      where: {
        id: experimentId,
        organizationId,
      },
    });

    if (!existingExperiment) {
      throw new Error('Experiment not found or access denied');
    }

    // Check if experiment has submissions - if so, archive instead of delete
    const submissionCount = await prisma.experiment.findFirst({
      where: { id: experimentId },
      include: {
        _count: {
          select: {
            twoVideoComparisonSubmissions: true,
            singleVideoEvaluationSubmissions: true,
          },
        },
      },
    });

    const hasSubmissions = (submissionCount?._count.twoVideoComparisonSubmissions ?? 0) > 0 ||
                          (submissionCount?._count.singleVideoEvaluationSubmissions ?? 0) > 0;

    if (hasSubmissions) {
      // Archive instead of delete if there are submissions
      const archivedExperiment = await prisma.experiment.update({
        where: { id: experimentId },
        data: {
          archived: true,
          archivedAt: new Date(),
        },
      });
      
      revalidatePath(`/api/experiments`);
      return { archived: true, experiment: archivedExperiment };
    } else {
      // Safe to delete if no submissions
      await prisma.experiment.delete({
        where: { id: experimentId },
      });
      
      revalidatePath(`/api/experiments`);
      return { deleted: true };
    }
  }

  /**
   * Get experiment statistics for an organization
   */
  static async getOrganizationExperimentStats(organizationId: string) {
    const experiments = await prisma.experiment.findMany({
      where: {
        organizationId,
        archived: false,
      },
      include: {
        _count: {
          select: {
            twoVideoComparisonSubmissions: true,
            singleVideoEvaluationSubmissions: true,
          },
        },
      },
    });

    const stats = {
      total: experiments.length,
      byStatus: {
        DRAFT: experiments.filter(e => e.status === ExperimentStatus.DRAFT).length,
        READY: experiments.filter(e => e.status === ExperimentStatus.READY).length,
        ACTIVE: experiments.filter(e => e.status === ExperimentStatus.ACTIVE).length,
        PAUSED: experiments.filter(e => e.status === ExperimentStatus.PAUSED).length,
        COMPLETED: experiments.filter(e => e.status === ExperimentStatus.COMPLETED).length,
      },
      totalSubmissions: experiments.reduce((sum, exp) => 
        sum + exp._count.twoVideoComparisonSubmissions + exp._count.singleVideoEvaluationSubmissions, 0
      ),
    };

    return stats;
  }

  /**
   * Check if user has access to experiment within organization
   */
  static async hasExperimentAccess(
    experimentId: string,
    organizationId: string
  ): Promise<boolean> {
    const experiment = await prisma.experiment.findFirst({
      where: {
        id: experimentId,
        organizationId,
      },
      select: { id: true },
    });

    return !!experiment;
  }

  /**
   * Get available videos for experiment creation within organization
   */
  static async getOrganizationVideos(organizationId: string) {
    return await prisma.video.findMany({
      where: {
        OR: [
          { organizationId },
          { isShared: true },
        ],
      },
      orderBy: {
        uploadedAt: 'desc',
      },
    });
  }
}