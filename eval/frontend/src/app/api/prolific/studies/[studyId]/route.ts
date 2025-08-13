import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-middleware';
import { checkOrganizationAccess } from '@/lib/organization';
import { prolificService, ProlificService } from '@/lib/services/prolific';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { studyId } = await params;
    
    // Get the experiment to find its organization
    const experiment = await prisma.experiment.findFirst({
      where: { prolificStudyId: studyId },
      select: { organizationId: true }
    });

    if (!experiment || !experiment.organizationId) {
      return NextResponse.json({ error: 'Study not found or missing organization' }, { status: 404 });
    }

    // Check if user has access to the organization
    const userId = authResult.user?.id;
    if (!userId || !await checkOrganizationAccess(experiment.organizationId, userId, 'MEMBER')) {
      return NextResponse.json({ error: 'Access denied to this organization' }, { status: 403 });
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
    const authResult = await requireAuth(req);
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

    if (!experiment || !experiment.organizationId) {
      return NextResponse.json({ error: 'Study not found or missing organization' }, { status: 404 });
    }

    // Check if user has admin access to the organization
    const userId = authResult.user?.id;
    if (!userId || !await checkOrganizationAccess(experiment.organizationId, userId, 'ADMIN')) {
      return NextResponse.json({ error: 'Admin access required for this organization' }, { status: 403 });
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