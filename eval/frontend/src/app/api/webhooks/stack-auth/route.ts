import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Stack Auth webhook endpoint
export async function POST(request: NextRequest) {
  try {
    console.log('📡 Stack Auth webhook received')
    
    // Parse the webhook payload
    const payload = await request.json()
    console.log('🔍 Webhook payload:', JSON.stringify(payload, null, 2))
    
    // Get headers for verification (Stack Auth should provide signature)
    const headers = Object.fromEntries(request.headers.entries())
    console.log('📋 Webhook headers:', headers)
    
    // TODO: Verify webhook signature for security
    // const signature = headers['x-stack-signature'] || headers['x-webhook-signature']
    // if (!verifyWebhookSignature(payload, signature)) {
    //   return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    // }
    
    // Handle different webhook event types
    const eventType = payload.type || payload.event_type
    
    switch (eventType) {
      case 'user.created':
        return await handleUserCreated(payload)
        
      case 'user.updated':
        return await handleUserUpdated(payload)
        
      case 'user.deleted':
        return await handleUserDeleted(payload)
        
      case 'team.updated':
        return await handleTeamUpdated(payload)
        
      default:
        console.log(`ℹ️ Unhandled webhook event type: ${eventType}`)
        return NextResponse.json({ message: 'Event type not handled', eventType })
    }

  } catch (error) {
    console.error('❌ Stack Auth webhook error:', error)
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

async function handleUserCreated(payload: any) {
  console.log('👤 Processing user created event')
  
  try {
    const userData = payload.data || payload
    const { id: userId, primary_email: userEmail, display_name } = userData
    
    if (!userId) {
      console.error('Missing user ID in user created payload')
      return NextResponse.json({ error: 'Missing user ID' }, { status: 400 })
    }
    
    console.log(`👤 New user created: ${userEmail || display_name || userId}`)
    
    // For now, just log the new user
    // We might want to automatically add them to a default organization in the future
    
    return NextResponse.json({
      message: 'User created event processed',
      user: {
        stackUserId: userId,
        email: userEmail,
        displayName: display_name
      }
    })
    
  } catch (error) {
    console.error('Error handling user created:', error)
    throw error
  }
}

async function handleUserUpdated(payload: any) {
  console.log('👤 Processing user updated event')
  
  try {
    const userData = payload.data || payload
    const { id: userId, primary_email: userEmail, display_name } = userData
    
    if (!userId) {
      console.error('Missing user ID in user updated payload')
      return NextResponse.json({ error: 'Missing user ID' }, { status: 400 })
    }
    
    console.log(`👤 User updated: ${userEmail || display_name || userId}`)
    
    // User update might include team membership changes
    // Trigger a sync for all organizations to ensure membership is current
    console.log('🔄 User updated - triggering organization sync to catch membership changes')
    
    // Find all organizations and sync them
    const organizations = await prisma.organization.findMany({
      where: { 
        stackTeamId: { not: null } 
      }
    })
    
    let syncResults = []
    
    for (const org of organizations) {
      try {
        // Import the sync function from your existing sync implementation
        const { syncStackAuthTeamToOrganization } = await import('@/lib/stack-auth-sync')
        const result = await syncStackAuthTeamToOrganization(org.id)
        
        if (result.success) {
          console.log(`✅ Synced organization: ${org.name} (${result.sync.addedMembers} new members)`)
          syncResults.push({
            organizationId: org.id,
            organizationName: org.name,
            success: true,
            addedMembers: result.sync.addedMembers
          })
        } else {
          console.error(`❌ Failed to sync organization: ${org.name} - ${result.error}`)
          syncResults.push({
            organizationId: org.id,
            organizationName: org.name,
            success: false,
            error: result.error
          })
        }
      } catch (syncError) {
        console.error(`❌ Error syncing organization: ${org.name}`, syncError)
        syncResults.push({
          organizationId: org.id,
          organizationName: org.name,
          success: false,
          error: syncError instanceof Error ? syncError.message : 'Unknown sync error'
        })
      }
    }
    
    return NextResponse.json({
      message: 'User updated event processed with organization sync',
      user: {
        stackUserId: userId,
        email: userEmail,
        displayName: display_name
      },
      syncResults
    })
    
  } catch (error) {
    console.error('Error handling user updated:', error)
    throw error
  }
}

async function handleUserDeleted(payload: any) {
  console.log('👤 Processing user deleted event')
  
  try {
    const userData = payload.data || payload
    const { id: userId } = userData
    
    if (!userId) {
      console.error('Missing user ID in user deleted payload')
      return NextResponse.json({ error: 'Missing user ID' }, { status: 400 })
    }
    
    console.log(`👤 User deleted: ${userId}`)
    
    // Remove user from all organizations
    const deletedMembers = await prisma.organizationMember.deleteMany({
      where: { stackUserId: userId }
    })
    
    console.log(`✅ Removed user from ${deletedMembers.count} organizations`)
    
    return NextResponse.json({
      message: 'User deleted event processed',
      removedFromOrganizations: deletedMembers.count
    })
    
  } catch (error) {
    console.error('Error handling user deleted:', error)
    throw error
  }
}

async function handleTeamUpdated(payload: any) {
  console.log('👥 Processing team updated event')
  
  try {
    const teamData = payload.data || payload
    const { id: teamId, display_name: teamName } = teamData
    
    if (!teamId) {
      console.error('Missing team ID in team updated payload')
      return NextResponse.json({ error: 'Missing team ID' }, { status: 400 })
    }
    
    console.log(`👥 Team updated: ${teamName || teamId}`)
    
    // Could update organization name if needed
    // Find organization by Stack Auth team ID and update
    
    return NextResponse.json({
      message: 'Team updated event processed',
      team: {
        stackTeamId: teamId,
        name: teamName
      }
    })
    
  } catch (error) {
    console.error('Error handling team updated:', error)
    throw error
  }
}