import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-middleware'
import { checkOrganizationAccess } from '@/lib/organization'
import { stackServerApp } from '@/stack'

// DELETE /api/organizations/[organizationId] - Delete organization
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> }
) {
  const params = await context.params;
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { organizationId } = params

  // Check if user has owner access to delete
  const hasAccess = await checkOrganizationAccess(organizationId, authResult.user!.id, 'OWNER')
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Only organization owners can delete organizations' },
      { status: 403 }
    )
  }

  try {
    // Get organization with all related data
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        experiments: true,
        videos: true,
        members: true
      }
    })

    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    // Delete Stack Auth team if linked
    if (organization.stackTeamId) {
      try {
        const team = await stackServerApp.getTeam(organization.stackTeamId)
        if (team) {
          await team.delete()
        }
      } catch (error) {
        console.error('Failed to delete Stack Auth team:', error)
      }
    }

    // Delete all related data in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete all experiments and their tasks/submissions
      for (const experiment of organization.experiments) {
        await tx.twoVideoComparisonSubmission.deleteMany({
          where: { experimentId: experiment.id }
        })
        await tx.singleVideoEvaluationSubmission.deleteMany({
          where: { experimentId: experiment.id }
        })
        await tx.twoVideoComparisonTask.deleteMany({
          where: { experimentId: experiment.id }
        })
        await tx.singleVideoEvaluationTask.deleteMany({
          where: { experimentId: experiment.id }
        })
        await tx.participant.deleteMany({
          where: { experimentId: experiment.id }
        })
      }
      
      // Delete experiments
      await tx.experiment.deleteMany({
        where: { organizationId }
      })

      // Delete videos
      await tx.video.deleteMany({
        where: { organizationId }
      })

      // Delete invitations
      await tx.organizationInvitation.deleteMany({
        where: { organizationId }
      })

      // Delete members
      await tx.organizationMember.deleteMany({
        where: { organizationId }
      })

      // Finally, delete the organization
      await tx.organization.delete({
        where: { id: organizationId }
      })
    })

    return NextResponse.json({
      success: true,
      message: 'Organization and all related data deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting organization:', error)
    return NextResponse.json(
      { error: 'Failed to delete organization' },
      { status: 500 }
    )
  }
}