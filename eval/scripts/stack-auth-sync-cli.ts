import { prisma } from './prisma-client';

// CLI-compatible Stack Auth sync without Next.js dependencies
export interface StackAuthSyncResult {
  success: boolean
  organization: {
    id: string
    name: string
  }
  stackTeam: {
    id: string
    totalMembers: number
  }
  sync: {
    existingMembers: number
    addedMembers: number
    newMembers: Array<{
      id: string
      email: string
      role: string
      stackUserId: string
    }>
  }
  error?: string
}

export async function syncStackAuthTeamToOrganization(organizationId: string): Promise<StackAuthSyncResult> {
  try {
    console.log(`🔄 Starting Stack Auth sync for organization: ${organizationId}`)

    // Get organization
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId }
    })

    if (!organization) {
      return {
        success: false,
        error: 'Organization not found',
        organization: { id: '', name: '' },
        stackTeam: { id: '', totalMembers: 0 },
        sync: { existingMembers: 0, addedMembers: 0, newMembers: [] }
      }
    }

    console.log(`✅ Found organization: ${organization.name}`)

    if (!organization.stackTeamId) {
      return {
        success: false,
        error: 'No Stack Auth team linked to this organization',
        organization: { id: organization.id, name: organization.name },
        stackTeam: { id: '', totalMembers: 0 },
        sync: { existingMembers: 0, addedMembers: 0, newMembers: [] }
      }
    }

    console.log(`🔍 Fetching Stack Auth team: ${organization.stackTeamId}`)

    // Use Stack Auth API directly with the server key
    console.log(`🔑 Using Stack Auth Project ID: ${process.env.NEXT_PUBLIC_STACK_PROJECT_ID}`)
    console.log(`🔐 Server key present: ${process.env.STACK_SECRET_SERVER_KEY ? 'Yes' : 'No'}`)
    
    // First, let's try to get all users and see if we can identify team membership
    const usersResponse = await fetch(`https://api.stack-auth.com/api/v1/users`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-stack-project-id': process.env.NEXT_PUBLIC_STACK_PROJECT_ID!,
        'x-stack-secret-server-key': process.env.STACK_SECRET_SERVER_KEY!,
        'x-stack-access-type': 'server'
      }
    });

    console.log(`📡 Users API response: ${usersResponse.status} ${usersResponse.statusText}`)
    
    if (!usersResponse.ok) {
      const errorText = await usersResponse.text();
      console.log(`📄 Users API error response body: ${errorText}`)
      
      return {
        success: false,
        error: `Stack Auth Users API error: ${usersResponse.status} ${usersResponse.statusText} - ${errorText}`,
        organization: { id: organization.id, name: organization.name },
        stackTeam: { id: organization.stackTeamId, totalMembers: 0 },
        sync: { existingMembers: 0, addedMembers: 0, newMembers: [] }
      }
    }

    const allUsers = await usersResponse.json();
    console.log(`🔍 Raw Users API Response:`, JSON.stringify(allUsers, null, 2));
    
    // Extract users array if it's wrapped in an object  
    const usersArray = Array.isArray(allUsers) ? allUsers : allUsers.items || [];
    console.log(`🔍 Total users in project:`, usersArray.length);
    
    // All users in the Stack Auth project should be considered team members
    const teamUsers = usersArray;
    console.log(`📋 Found ${teamUsers?.length || 0} users in Stack Auth project to sync as team members`)

    // Get current members in our database
    const currentMembers = await prisma.organizationMember.findMany({
      where: { organizationId: organization.id }
    })
    const currentUserIds = new Set(currentMembers.map(m => m.stackUserId))

    console.log(`📊 Current database members: ${currentMembers.length}`)

    const addedMembers = []
    
    // Add new members
    if (teamUsers && teamUsers.length > 0) {
      for (const teamUser of teamUsers) {
        if (!currentUserIds.has(teamUser.id)) {
          // Determine role based on Stack Auth permissions - we'll use ADMIN for all team users for now
          const role = 'ADMIN'
          
          console.log(`➕ Adding new member: ${teamUser.primary_email || teamUser.id} as ${role}`)
          
          const member = await prisma.organizationMember.create({
            data: {
              organizationId: organization.id,
              stackUserId: teamUser.id,
              role: role
            }
          })
          
          addedMembers.push({
            id: member.id,
            email: teamUser.primary_email || 'unknown',
            role: role,
            stackUserId: teamUser.id
          })
        } else {
          console.log(`➖ User already exists: ${teamUser.primary_email || teamUser.id}`)
        }
      }
    }

    console.log(`✅ Sync complete: ${addedMembers.length} new members added`)

    return {
      success: true,
      organization: {
        id: organization.id,
        name: organization.name
      },
      stackTeam: {
        id: organization.stackTeamId,
        totalMembers: teamUsers?.length || 0
      },
      sync: {
        existingMembers: currentMembers.length,
        addedMembers: addedMembers.length,
        newMembers: addedMembers
      }
    }

  } catch (error) {
    console.error('❌ Stack Auth sync error:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync Stack Auth team',
      organization: { id: '', name: '' },
      stackTeam: { id: '', totalMembers: 0 },
      sync: { existingMembers: 0, addedMembers: 0, newMembers: [] }
    }
  }
}