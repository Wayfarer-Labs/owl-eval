import { NextRequest, NextResponse } from 'next/server'
import { syncStackAuthTeamToOrganization } from '@/lib/stack-auth-sync'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  try {
    const { organizationId } = await params
    const result = await syncStackAuthTeamToOrganization(organizationId)
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Stack Auth sync API error:', error)
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync Stack Auth team' },
      { status: 500 }
    )
  }
}