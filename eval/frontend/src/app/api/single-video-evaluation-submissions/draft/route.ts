import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    console.log('Single video draft API received data:', data);
    
    const {
      singleVideoEvaluationTaskId,
      participantId,
      experimentId,
      dimensionScores,
      completionTimeSeconds,
      clientMetadata,
      prolificPid,
    } = data;

    if (!singleVideoEvaluationTaskId) {
      console.error('Missing singleVideoEvaluationTaskId in draft save request');
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get the video task to extract the experimentId
    const videoTask = await prisma.singleVideoEvaluationTask.findUnique({
      where: { id: singleVideoEvaluationTaskId },
    });

    if (!videoTask) {
      return NextResponse.json(
        { error: 'Video task not found' },
        { status: 404 }
      );
    }

    const actualExperimentId = experimentId || videoTask.experimentId;

    // For anonymous users, create a consistent identifier based on session only
    let actualParticipantId = participantId;
    
    // If this is an anonymous user (no participant ID from database)
    if (!participantId || participantId === 'anonymous') {
      // Use session identifier only for anonymous users (consistent across video tasks)
      const sessionId = clientMetadata?.sessionId;
      if (!sessionId) {
        throw new Error('Session ID is required for anonymous users');
      }
      actualParticipantId = `anon-${sessionId}`;
      
      // Check if we need to create an anonymous participant record
      const existingParticipant = await prisma.participant.findUnique({
        where: { id: actualParticipantId },
      });
      
      if (!existingParticipant) {
        // Get all video tasks for this experiment to assign them all
        const allVideoTasks = await prisma.singleVideoEvaluationTask.findMany({
          where: { experimentId: actualExperimentId },
          select: { id: true }
        });
        
        // Create an anonymous participant record with all video tasks assigned
        await prisma.participant.create({
          data: {
            id: actualParticipantId,
            prolificId: prolificPid || `anon-${Date.now()}`,
            experimentId: actualExperimentId,
            sessionId: sessionId,
            status: 'active',
            assignedTwoVideoComparisonTasks: [], // Empty for single video mode
            assignedSingleVideoEvaluationTasks: allVideoTasks.map(vt => vt.id),
          },
        });
      }
    }

    // Check if there's already a completed evaluation for this participant/video task
    const existingEvaluation = await prisma.singleVideoEvaluationSubmission.findUnique({
      where: {
        singleVideoEvaluationTaskId_participantId: {
          singleVideoEvaluationTaskId,
          participantId: actualParticipantId,
        },
      },
    });

    // If there's already a completed evaluation, prevent further modifications
    if (existingEvaluation && existingEvaluation.status === 'completed') {
      return NextResponse.json(
        { error: 'Evaluation already completed for this participant' },
        { status: 409 }
      );
    }

    const evaluation = await prisma.singleVideoEvaluationSubmission.upsert({
      where: {
        singleVideoEvaluationTaskId_participantId: {
          singleVideoEvaluationTaskId,
          participantId: actualParticipantId,
        },
      },
      update: {
        dimensionScores: dimensionScores || {},
        completionTimeSeconds,
        clientMetadata,
        lastSavedAt: new Date(),
      },
      create: {
        singleVideoEvaluationTaskId,
        participantId: actualParticipantId,
        experimentId: actualExperimentId,
        dimensionScores: dimensionScores || {},
        completionTimeSeconds,
        clientMetadata,
        status: 'draft',
      },
    });

    return NextResponse.json({
      success: true,
      evaluationId: evaluation.id,
      lastSavedAt: evaluation.lastSavedAt,
    });
  } catch (error) {
    console.error('Error saving draft single video evaluation:', error);
    return NextResponse.json(
      { error: 'Failed to save draft evaluation' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const singleVideoEvaluationTaskId = searchParams.get('singleVideoEvaluationTaskId');
    const participantId = searchParams.get('participantId');
    const sessionId = searchParams.get('sessionId');

    if (!singleVideoEvaluationTaskId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Handle anonymous users
    let actualParticipantId = participantId;
    if (!participantId || participantId === 'anonymous') {
      actualParticipantId = `anon-${sessionId || 'default'}`;
    }

    // Ensure actualParticipantId is never null
    if (!actualParticipantId) {
      actualParticipantId = 'anonymous-user';
    }

    const evaluation = await prisma.singleVideoEvaluationSubmission.findUnique({
      where: {
        singleVideoEvaluationTaskId_participantId: {
          singleVideoEvaluationTaskId,
          participantId: actualParticipantId,
        },
      },
    });

    if (!evaluation) {
      return NextResponse.json(
        { draft: null },
        { status: 200 }
      );
    }

    return NextResponse.json({
      draft: {
        dimensionScores: evaluation.dimensionScores,
        completionTimeSeconds: evaluation.completionTimeSeconds,
        lastSavedAt: evaluation.lastSavedAt,
        status: evaluation.status,
      },
    });
  } catch (error) {
    console.error('Error fetching draft single video evaluation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch draft evaluation' },
      { status: 500 }
    );
  }
}