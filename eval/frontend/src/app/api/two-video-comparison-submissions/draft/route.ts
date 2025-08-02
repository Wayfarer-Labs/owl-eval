import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    const {
      twoVideoComparisonTaskId,
      participantId,
      experimentId,
      chosenModel,
      dimensionScores,
      completionTimeSeconds,
      clientMetadata,
      prolificPid,
    } = data;

    if (!twoVideoComparisonTaskId) {
      console.error('Missing twoVideoComparisonTaskId in draft save request');
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get the two-video comparison task to extract the experimentId
    const comparison = await prisma.twoVideoComparisonTask.findUnique({
      where: { id: twoVideoComparisonTaskId },
    });

    if (!comparison) {
      return NextResponse.json(
        { error: 'Comparison not found' },
        { status: 404 }
      );
    }

    const actualExperimentId = experimentId || comparison.experimentId;

    // For anonymous users, create a consistent identifier based on session only
    let actualParticipantId = participantId;
    
    // If this is an anonymous user (no participant ID from database)
    if (!participantId || participantId === 'anonymous') {
      // Use session identifier only for anonymous users (consistent across comparisons)
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
        // Get all two-video comparison tasks for this experiment to assign them all
        const allComparisons = await prisma.twoVideoComparisonTask.findMany({
          where: { experimentId: actualExperimentId },
          select: { id: true }
        });
        
        // Create an anonymous participant record with all two-video comparison tasks assigned
        await prisma.participant.create({
          data: {
            id: actualParticipantId,
            prolificId: prolificPid || `anon-${Date.now()}`,
            experimentId: actualExperimentId,
            sessionId: sessionId,
            status: 'active',
            assignedTwoVideoComparisonTasks: allComparisons.map(c => c.id),
          },
        });
      }
    }

    // Check if there's already a completed evaluation for this participant/comparison
    const existingEvaluation = await prisma.twoVideoComparisonSubmission.findUnique({
      where: {
        twoVideoComparisonTaskId_participantId: {
          twoVideoComparisonTaskId,
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

    const evaluation = await prisma.twoVideoComparisonSubmission.upsert({
      where: {
        twoVideoComparisonTaskId_participantId: {
          twoVideoComparisonTaskId,
          participantId: actualParticipantId,
        },
      },
      update: {
        chosenModel,
        dimensionScores: dimensionScores || {},
        completionTimeSeconds,
        clientMetadata,
        lastSavedAt: new Date(),
      },
      create: {
        twoVideoComparisonTaskId,
        participantId: actualParticipantId,
        experimentId: actualExperimentId,
        chosenModel,
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
    console.error('Error saving draft evaluation:', error);
    return NextResponse.json(
      { error: 'Failed to save draft evaluation' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const twoVideoComparisonTaskId = searchParams.get('twoVideoComparisonTaskId');
    const participantId = searchParams.get('participantId');
    const sessionId = searchParams.get('sessionId');

    if (!twoVideoComparisonTaskId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Handle anonymous users
    let actualParticipantId = participantId;
    if (!participantId || participantId === 'anonymous') {
      if (!sessionId) {
        throw new Error('Session ID is required for anonymous users');
      }
      actualParticipantId = `anon-${sessionId}`;
    }

    // Ensure actualParticipantId exists
    if (!actualParticipantId) {
      throw new Error('Participant ID could not be determined');
    }

    const evaluation = await prisma.twoVideoComparisonSubmission.findUnique({
      where: {
        twoVideoComparisonTaskId_participantId: {
          twoVideoComparisonTaskId,
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
        chosenModel: evaluation.chosenModel,
        dimensionScores: evaluation.dimensionScores,
        completionTimeSeconds: evaluation.completionTimeSeconds,
        lastSavedAt: evaluation.lastSavedAt,
        status: evaluation.status,
      },
    });
  } catch (error) {
    console.error('Error fetching draft evaluation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch draft evaluation' },
      { status: 500 }
    );
  }
}