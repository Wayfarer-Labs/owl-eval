import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-middleware'
import { stackServerApp } from '@/stack'

// POST /api/organizations/[organizationId]/leave - Leave organization
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> }
) {
  const params = await context.params;
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { organizationId } = params

  try {
    // Get the member record
    const member = await prisma.organizationMember.findUnique({
      where: {
        organizationId_stackUserId: {
          organizationId,
          stackUserId: authResult.user!.id
        }
      }
    })

    if (!member) {
      return NextResponse.json(
        { error: 'You are not a member of this organization' },
        { status: 404 }
      )
    }

    // Don't allow the last owner to leave
    if (member.role === 'OWNER') {
      const ownerCount = await prisma.organizationMember.count({
        where: {
          organizationId,
          role: 'OWNER'
        }
      })

      if (ownerCount === 1) {
        return NextResponse.json(
          { error: 'Cannot leave organization as the last owner. Transfer ownership or delete the organization instead.' },
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
      where: {
        organizationId_stackUserId: {
          organizationId,
          stackUserId: authResult.user!.id
        }
      }
    })

    // Remove from Stack Auth team if linked
    if (organization?.stackTeamId) {
      try {
        const team = await stackServerApp.getTeam(organization.stackTeamId)
        const user = await stackServerApp.getUser(authResult.user!.id)
        if (user && team) {
          await user.leaveTeam(team)
        }
      } catch (error) {
        console.error('Failed to leave Stack Auth team:', error)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully left the organization'
    })
  } catch (error) {
    console.error('Error leaving organization:', error)
    return NextResponse.json(
      { error: 'Failed to leave organization' },
      { status: 500 }
    )
  }
}