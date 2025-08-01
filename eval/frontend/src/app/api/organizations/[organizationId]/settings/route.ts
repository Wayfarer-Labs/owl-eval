import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stackServerApp } from '@/stack';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  try {
    const { organizationId } = await params;
    
    // Get current user
    const user = await stackServerApp.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find organization and verify user membership
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: {
          where: { stackUserId: user.id },
        },
      },
    });

    if (!organization || organization.members.length === 0) {
      return NextResponse.json({ error: 'Organization not found or access denied' }, { status: 404 });
    }

    // Check if user has admin/owner role
    const member = organization.members[0];
    if (member.role !== 'ADMIN' && member.role !== 'OWNER') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        description: organization.description,
      },
      settings: organization.settings,
    });

  } catch (error) {
    console.error('Organization settings GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  try {
    const { organizationId } = await params;
    const body = await request.json();
    
    // Get current user
    const user = await stackServerApp.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find organization and verify user membership
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: {
          where: { stackUserId: user.id },
        },
      },
    });

    if (!organization || organization.members.length === 0) {
      return NextResponse.json({ error: 'Organization not found or access denied' }, { status: 404 });
    }

    // Check if user has admin/owner role
    const member = organization.members[0];
    if (member.role !== 'ADMIN' && member.role !== 'OWNER') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Prepare update data
    const updateData: any = {};
    
    // Update basic organization fields if provided
    if (body.name !== undefined) {
      updateData.name = body.name;
    }
    if (body.description !== undefined) {
      updateData.description = body.description;
    }
    
    // Update settings if provided
    if (body.settings !== undefined) {
      // Merge with existing settings to preserve other settings
      const currentSettings = organization.settings as object || {};
      updateData.settings = {
        ...currentSettings,
        ...body.settings,
      };
    }

    // Update the organization
    const updatedOrganization = await prisma.organization.update({
      where: { id: organizationId },
      data: updateData,
    });

    return NextResponse.json({
      organization: {
        id: updatedOrganization.id,
        name: updatedOrganization.name,
        slug: updatedOrganization.slug,
        description: updatedOrganization.description,
      },
      settings: updatedOrganization.settings,
    });

  } catch (error) {
    console.error('Organization settings PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}