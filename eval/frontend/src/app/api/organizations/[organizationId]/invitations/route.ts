import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-middleware'
import { checkOrganizationAccess } from '@/lib/organization'

// GET /api/organizations/[organizationId]/invitations - List pending invitations
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

  // Check if user has access to view invitations (admin or higher)
  const hasAccess = await checkOrganizationAccess(organizationId, authResult.user!.id, 'ADMIN')
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    )
  }

  try {
    const invitations = await prisma.organizationInvitation.findMany({
      where: {
        organizationId,
        acceptedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({
      invitations: invitations.map(inv => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt
      }))
    })
  } catch (error) {
    console.error('Error fetching invitations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invitations' },
      { status: 500 }
    )
  }
}