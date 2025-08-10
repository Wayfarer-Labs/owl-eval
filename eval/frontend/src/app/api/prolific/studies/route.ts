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
    const { experimentId, title, description, reward, totalParticipants } = body;

    // Get the experiment to find its organization
    const experiment = await prisma.experiment.findUnique({
      where: { id: experimentId },
      select: { organizationId: true }
    });

    if (!experiment) {
      return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
    }

    // Create organization-specific Prolific service
    const organizationProlificService = await ProlificService.createForOrganization(experiment.organizationId);

    const prolificStudy = await organizationProlificService.createStudy({
      experimentId,
      title,
      description,
      reward,
      totalParticipants
    });

    return NextResponse.json({
      studyId: prolificStudy.id,
      status: prolificStudy.status,
      internalName: prolificStudy.internal_name,
      externalStudyUrl: prolificStudy.external_study_url
    });

  } catch (error) {
    console.error('Error creating Prolific study:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Get experiments with Prolific studies
    const experiments = await prolificService.instance.getExperimentsWithProlificStudies();

    // Fetch study details from Prolific
    const studies = await Promise.all(
      experiments.map(async (exp) => {
        try {
          const study = await prolificService.instance.getStudy(exp.prolificStudyId!);
          return {
            experimentId: exp.id,
            experimentName: exp.name,
            prolificStudyId: exp.prolificStudyId,
            status: study.status,
            totalParticipants: study.total_available_places,
            completedSubmissions: study.number_of_submissions,
            reward: study.reward / 100, // Convert from pence/cents
            createdAt: study.date_created
          };
        } catch (error) {
          return {
            experimentId: exp.id,
            experimentName: exp.name,
            prolificStudyId: exp.prolificStudyId,
            error: 'Failed to fetch study details'
          };
        }
      })
    );

    return NextResponse.json({ studies });

  } catch (error) {
    console.error('Error fetching Prolific studies:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}