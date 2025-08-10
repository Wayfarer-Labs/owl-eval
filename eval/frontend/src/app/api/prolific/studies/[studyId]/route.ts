import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-middleware';
import { prolificService, ProlificService } from '@/lib/services/prolific';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { studyId } = await params;
    
    // Get the experiment to find its organization
    const experiment = await prisma.experiment.findFirst({
      where: { prolificStudyId: studyId },
      select: { organizationId: true }
    });

    if (!experiment) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 });
    }

    // Create organization-specific Prolific service
    const organizationProlificService = await ProlificService.createForOrganization(experiment.organizationId);
    const study = await organizationProlificService.getStudy(studyId);
    return NextResponse.json(study);

  } catch (error) {
    console.error('Error fetching Prolific study:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { studyId } = await params;
    const body = await req.json();
    const { action } = body;

    // Get the experiment to find its organization
    const experiment = await prisma.experiment.findFirst({
      where: { prolificStudyId: studyId },
      select: { organizationId: true }
    });

    if (!experiment) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 });
    }

    // Create organization-specific Prolific service
    const organizationProlificService = await ProlificService.createForOrganization(experiment.organizationId);
    const updatedStudy = await organizationProlificService.updateStudyStatus(studyId, { action });
    return NextResponse.json(updatedStudy);

  } catch (error) {
    console.error('Error updating Prolific study:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}