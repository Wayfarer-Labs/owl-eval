import { NextRequest, NextResponse } from 'next/server';
import { stackServerApp } from '@/stack';
import { ExperimentService } from '@/lib/experiment-service';
import { getUserOrganizations } from '@/lib/organization';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  try {
    const user = await stackServerApp.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { organizationId } = await params;

    // Verify user has access to this organization
    const userOrganizations = await getUserOrganizations(user.id);
    const hasAccess = userOrganizations.some(org => org.organization.id === organizationId);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get filters from URL params
    const { searchParams } = new URL(request.url);
    const groupFilter = searchParams.get('group');
    const includeAnonymous = searchParams.get('includeAnonymous') === 'true';

    // Get experiments for the organization
    const experiments = await ExperimentService.getExperimentsByOrganization(organizationId, { 
      groupFilter, 
      includeAnonymous 
    });
    const stats = await ExperimentService.getOrganizationExperimentStats(organizationId);

    return NextResponse.json({
      experiments,
      stats,
    });

  } catch (error) {
    console.error('Error fetching organization experiments:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  try {
    const user = await stackServerApp.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { organizationId } = await params;

    // Verify user has access to this organization
    const userOrganizations = await getUserOrganizations(user.id);
    const userOrgMembership = userOrganizations.find(org => org.organization.id === organizationId);

    if (!userOrgMembership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if user has permission to create experiments (ADMIN or OWNER)
    if (!['OWNER', 'ADMIN'].includes(userOrgMembership.role)) {
      return NextResponse.json({ 
        error: `Insufficient permissions. You need OWNER or ADMIN role in this organization to create experiments. Your current role is: ${userOrgMembership.role}. Please contact your organization owner to upgrade your permissions.` 
      }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, evaluationMode, config } = body;

    // Validate request body
    if (!name || !evaluationMode) {
      return NextResponse.json(
        { error: 'Missing required fields: name, evaluationMode' },
        { status: 400 }
      );
    }

    // Create experiment
    const experiment = await ExperimentService.createExperiment({
      name,
      description,
      evaluationMode,
      config: config || {},
      organizationId,
    });

    return NextResponse.json({
      experiment,
      message: 'Experiment created successfully',
    });

  } catch (error) {
    console.error('Error creating experiment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}