import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-middleware'
import { checkOrganizationAccess } from '@/lib/organization'
import { stackServerApp } from '@/stack'
import { randomBytes } from 'crypto'

// POST /api/organizations/[organizationId]/invite - Invite a member
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

  // Check if user has admin access to invite members
  const hasAccess = await checkOrganizationAccess(organizationId, authResult.user!.id, 'ADMIN')
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Admin access required to invite members' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const { email, role = 'MEMBER' } = body

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    if (!['ADMIN', 'MEMBER', 'VIEWER'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Cannot invite as OWNER.' },
        { status: 400 }
      )
    }

    // Get organization with Stack Auth team
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId }
    })

    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    // Check if user is already a member
    const existingUsers = await stackServerApp.listUsers({ 
      query: email,
      limit: 1 
    })

    if (existingUsers.length > 0) {
      const existingMember = await prisma.organizationMember.findUnique({
        where: {
          organizationId_stackUserId: {
            organizationId,
            stackUserId: existingUsers[0].id
          }
        }
      })

      if (existingMember) {
        return NextResponse.json(
          { error: 'User is already a member of this organization' },
          { status: 400 }
        )
      }
    }

    // Check for existing invitation
    const existingInvitation = await prisma.organizationInvitation.findUnique({
      where: {
        organizationId_email: {
          organizationId,
          email
        }
      }
    })

    if (existingInvitation && existingInvitation.expiresAt > new Date()) {
      return NextResponse.json(
        { error: 'An invitation has already been sent to this email' },
        { status: 400 }
      )
    }

    // Create invitation token
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // Create or update invitation
    const invitation = await prisma.organizationInvitation.upsert({
      where: {
        organizationId_email: {
          organizationId,
          email
        }
      },
      update: {
        role,
        token,
        expiresAt,
        acceptedAt: null
      },
      create: {
        organizationId,
        email,
        role,
        token,
        expiresAt
      }
    })

    // If organization has Stack Auth team, use Stack Auth invitation
    if (organization.stackTeamId) {
      try {
        const team = await stackServerApp.getTeam(organization.stackTeamId)
        if (team) {
          await team.inviteUser({ email })
        }
      } catch (error) {
        console.error('Failed to send Stack Auth team invitation:', error)
        // Continue anyway - we have our own invitation system
      }
    }

    // TODO: Send invitation email with the token
    // For now, we'll just return success
    console.log(`Invitation created for ${email} with token: ${token}`)

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt
      }
    })
  } catch (error) {
    console.error('Error inviting member:', error)
    return NextResponse.json(
      { error: 'Failed to send invitation' },
      { status: 500 }
    )
  }
}