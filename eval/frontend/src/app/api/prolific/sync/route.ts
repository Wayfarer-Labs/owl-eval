import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-middleware';
import { prolificService, ProlificService } from '@/lib/services/prolific';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const body = await req.json();
    const { studyId } = body;

    if (!studyId) {
      return NextResponse.json({ error: 'Study ID is required' }, { status: 400 });
    }

    // Get the experiment to find its organization
    const experiment = await prisma.experiment.findFirst({
      where: { prolificStudyId: studyId },
      select: { organizationId: true }
    });

    if (!experiment || !experiment.organizationId) {
      return NextResponse.json({ error: 'Study not found or missing organization' }, { status: 404 });
    }

    // Create organization-specific Prolific service
    const organizationProlificService = await ProlificService.createForOrganization(experiment.organizationId);
    const result = await organizationProlificService.syncStudyWithDatabase(studyId);

    return NextResponse.json({
      success: true,
      studyId: result.study.id,
      studyName: result.study.name,
      studyStatus: result.study.status,
      syncedParticipants: result.syncedParticipants,
      totalSubmissions: result.submissions.length
    });

  } catch (error) {
    console.error('Error syncing Prolific data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}