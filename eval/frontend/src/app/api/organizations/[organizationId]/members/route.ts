import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-middleware'
import { checkOrganizationAccess } from '@/lib/organization'
import { stackServerApp } from '@/stack'

// GET /api/organizations/[organizationId]/members - List all members
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> }
) {
  const params = await context.params;
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { organizationId } = params

  // Check if user has access to this organization
  const hasAccess = await checkOrganizationAccess(organizationId, authResult.user!.id)
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Access denied' },
      { status: 403 }
    )
  }

  try {
    // Get organization with Stack Auth team ID
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: true
      }
    })

    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    // Get Stack Auth user details for each member
    const membersWithDetails = await Promise.all(
      organization.members.map(async (member) => {
        try {
          const stackUser = await stackServerApp.getUser(member.stackUserId)
          
          // If organization has Stack Auth team, get team profile
          let teamProfile = null
          if (organization.stackTeamId) {
            try {
              const team = await stackServerApp.getTeam(organization.stackTeamId)
              // Get team member profile if available
              if (team) {
                const teamMembers = await team.listUsers()
                const teamMember = teamMembers.find(tm => tm.id === member.stackUserId)
                if (teamMember) {
                  teamProfile = {
                    displayName: teamMember.displayName,
                    profileImageUrl: teamMember.profileImageUrl
                  }
                }
              }
            } catch (error) {
              console.warn('Could not fetch team profile:', error)
            }
          }

          return {
            id: member.id,
            stackUserId: member.stackUserId,
            role: member.role,
            joinedAt: member.joinedAt,
            user: stackUser ? {
              displayName: stackUser.displayName,
              primaryEmail: stackUser.primaryEmail,
              profileImageUrl: stackUser.profileImageUrl
            } : undefined,
            teamProfile
          }
        } catch (error) {
          console.warn(`Could not fetch user details for ${member.stackUserId}:`, error)
          return {
            id: member.id,
            stackUserId: member.stackUserId,
            role: member.role,
            joinedAt: member.joinedAt
          }
        }
      })
    )

    return NextResponse.json({
      members: membersWithDetails
    })
  } catch (error) {
    console.error('Error fetching members:', error)
    return NextResponse.json(
      { error: 'Failed to fetch members' },
      { status: 500 }
    )
  }
}