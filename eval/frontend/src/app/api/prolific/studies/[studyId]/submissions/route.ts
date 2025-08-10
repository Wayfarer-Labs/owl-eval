import { NextRequest, NextResponse } from 'next/server';
import { stackServerApp } from '@/stack';
import { prolificService, ProlificService } from '@/lib/services/prolific';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const user = await stackServerApp.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Create organization-specific Prolific service
    const organizationProlificService = await ProlificService.createForOrganization(experiment.organizationId);
    const data = await organizationProlificService.getSubmissions(studyId);
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error fetching Prolific submissions:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  try {
    const user = await stackServerApp.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, submissionIds, rejectionReason } = body;

    // Validate action
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
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

    // Create organization-specific Prolific service
    const organizationProlificService = await ProlificService.createForOrganization(experiment.organizationId);
    const results = await organizationProlificService.processSubmissions({
      action,
      submissionIds,
      rejectionReason
    });

    return NextResponse.json({ results });

  } catch (error) {
    console.error('Error processing Prolific submissions:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}