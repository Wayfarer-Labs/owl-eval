import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-middleware'
import { checkOrganizationAccess } from '@/lib/organization'
import { stackServerApp } from '@/stack'

// PATCH /api/organizations/[organizationId]/members/[memberId] - Update member role
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string; memberId: string }> }
) {
  const params = await context.params;
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { organizationId, memberId } = params

  // Check if user has admin access to this organization
  const hasAccess = await checkOrganizationAccess(organizationId, authResult.user!.id, 'ADMIN')
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const { role } = body

    if (!role || !['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      )
    }

    // Don't allow changing the last owner
    const member = await prisma.organizationMember.findUnique({
      where: { id: memberId }
    })

    if (!member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      )
    }

    if (member.role === 'OWNER') {
      const ownerCount = await prisma.organizationMember.count({
        where: {
          organizationId,
          role: 'OWNER'
        }
      })

      if (ownerCount === 1 && role !== 'OWNER') {
        return NextResponse.json(
          { error: 'Cannot remove the last owner' },
          { status: 400 }
        )
      }
    }

    // Update the member role
    const updatedMember = await prisma.organizationMember.update({
      where: { id: memberId },
      data: { role }
    })

    // TODO: Update Stack Auth team permissions based on role

    return NextResponse.json({
      member: updatedMember
    })
  } catch (error) {
    console.error('Error updating member role:', error)
    return NextResponse.json(
      { error: 'Failed to update member role' },
      { status: 500 }
    )
  }
}

// DELETE /api/organizations/[organizationId]/members/[memberId] - Remove member
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string; memberId: string }> }
) {
  const params = await context.params;
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { organizationId, memberId } = params

  // Check if user has admin access to this organization
  const hasAccess = await checkOrganizationAccess(organizationId, authResult.user!.id, 'ADMIN')
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    )
  }

  try {
    // Get the member to be removed
    const member = await prisma.organizationMember.findUnique({
      where: { id: memberId }
    })

    if (!member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      )
    }

    // Don't allow removing the last owner
    if (member.role === 'OWNER') {
      const ownerCount = await prisma.organizationMember.count({
        where: {
          organizationId,
          role: 'OWNER'
        }
      })

      if (ownerCount === 1) {
        return NextResponse.json(
          { error: 'Cannot remove the last owner' },
          { status: 400 }
        )
      }
    }

    // Get organization to check for Stack Auth team
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId }
    })

    // Remove from database
    await prisma.organizationMember.delete({
      where: { id: memberId }
    })

    // Remove from Stack Auth team if linked
    if (organization?.stackTeamId) {
      try {
        const team = await stackServerApp.getTeam(organization.stackTeamId)
        const stackUser = await stackServerApp.getUser(member.stackUserId)
        if (stackUser && team) {
          await stackUser.leaveTeam(team)
        }
      } catch (error) {
        console.error('Failed to remove user from Stack Auth team:', error)
      }
    }

    return NextResponse.json({
      success: true
    })
  } catch (error) {
    console.error('Error removing member:', error)
    return NextResponse.json(
      { error: 'Failed to remove member' },
      { status: 500 }
    )
  }
}