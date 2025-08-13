import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-middleware'
import { checkOrganizationAccess } from '@/lib/organization'

// DELETE /api/organizations/[organizationId]/invitations/[invitationId] - Cancel invitation
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string; invitationId: string }> }
) {
  const params = await context.params;
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { organizationId, invitationId } = params

  // Check if user has admin access
  const hasAccess = await checkOrganizationAccess(organizationId, authResult.user!.id, 'ADMIN')
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    )
  }

  try {
    // Delete the invitation
    await prisma.organizationInvitation.delete({
      where: {
        id: invitationId,
        organizationId // Extra check to ensure invitation belongs to this org
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Invitation cancelled'
    })
  } catch (error) {
    console.error('Error cancelling invitation:', error)
    return NextResponse.json(
      { error: 'Failed to cancel invitation' },
      { status: 500 }
    )
  }
}