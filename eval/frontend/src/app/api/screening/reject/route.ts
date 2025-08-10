import { NextRequest, NextResponse } from 'next/server'
import { ProlificService } from '@/lib/services/prolific'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { participantId, reason } = await request.json()

    if (!participantId) {
      return NextResponse.json(
        { error: 'Participant ID is required' },
        { status: 400 }
      )
    }

    // Find the participant in our database
    const participant = await prisma.participant.findFirst({
      where: { 
        OR: [
          { prolificId: participantId },
          { sessionId: participantId },
          { id: participantId }
        ]
      },
      include: {
        experiment: true
      }
    })

    if (!participant) {
      return NextResponse.json(
        { error: 'Participant not found' },
        { status: 404 }
      )
    }

    // If this is a Prolific participant, reject their submission
    if (participant.prolificId && participant.experiment?.prolificStudyId && participant.experiment?.organizationId) {
      try {
        // Create organization-specific Prolific service
        const organizationProlificService = await ProlificService.createForOrganization(participant.experiment.organizationId)
        
        // Find the Prolific submission for this participant
        const studyId = participant.experiment.prolificStudyId
        const submissionsData = await organizationProlificService.getSubmissions(studyId)
        const submission = submissionsData.results.find(
          (sub: any) => sub['Participant id'] === participant.prolificId
        )

        if (submission) {
          // Reject the submission on Prolific
          const rejectionResult = await organizationProlificService.processSubmissions({
            action: 'reject',
            submissionIds: [submission['Submission id']],
            rejectionReason: reason || 'Failed gold-standard items'
          })

          if (rejectionResult[0]?.success) {
            // Update participant status in our database
            await prisma.participant.update({
              where: { id: participant.id },
              data: {
                status: 'rejected',
                metadata: {
                  ...participant.metadata as object,
                  rejectionReason: reason || 'Failed screening task',
                  rejectedAt: new Date().toISOString()
                }
              }
            })

            return NextResponse.json({
              success: true,
              message: 'Participant rejected successfully',
              prolificRejected: true
            })
          } else {
            throw new Error(rejectionResult[0]?.error || 'Failed to reject Prolific submission')
          }
        } else {
          // No submission found - participant may not have completed yet
          await prisma.participant.update({
            where: { id: participant.id },
            data: {
              status: 'rejected',
              metadata: {
                ...participant.metadata as object,
                rejectionReason: reason || 'Failed screening task',
                rejectedAt: new Date().toISOString()
              }
            }
          })

          return NextResponse.json({
            success: true,
            message: 'Participant marked as rejected (no Prolific submission found)',
            prolificRejected: false
          })
        }
      } catch (error) {
        console.error('Error rejecting Prolific submission:', error)
        
        // Still mark as rejected in our database even if Prolific rejection fails
        await prisma.participant.update({
          where: { id: participant.id },
          data: {
            status: 'rejected',
            metadata: {
              ...participant.metadata as object,
              rejectionReason: reason || 'Failed screening task',
              rejectedAt: new Date().toISOString(),
              prolificRejectionError: error instanceof Error ? error.message : 'Unknown error'
            }
          }
        })

        return NextResponse.json({
          success: true,
          message: 'Participant rejected locally, but Prolific rejection failed',
          prolificRejected: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    } else {
      // Non-Prolific participant - just update status
      await prisma.participant.update({
        where: { id: participant.id },
        data: {
          status: 'rejected',
          metadata: {
            ...participant.metadata as object,
            rejectionReason: reason || 'Failed screening task',
            rejectedAt: new Date().toISOString()
          }
        }
      })

      return NextResponse.json({
        success: true,
        message: 'Non-Prolific participant rejected',
        prolificRejected: false
      })
    }
  } catch (error) {
    console.error('Error in screening rejection:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}