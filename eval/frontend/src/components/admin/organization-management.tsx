'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@stackframe/stack'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { useOrganization } from '@/lib/organization-context'
import { UserPlus, UserMinus, Mail, Shield, Users, LogOut, Trash2, Settings, Copy } from 'lucide-react'

interface TeamMember {
  id: string
  stackUserId: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
  user?: {
    displayName?: string
    primaryEmail?: string
    profileImageUrl?: string
  }
  teamProfile?: {
    displayName?: string
    profileImageUrl?: string
  }
  joinedAt: string
}

export function OrganizationManagement() {
  const user = useUser()
  const { currentOrganization, refetchOrganizations } = useOrganization()
  const { toast } = useToast()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER' | 'VIEWER'>('MEMBER')
  const [inviting, setInviting] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<string>('MEMBER')
  const [invitations, setInvitations] = useState<any[]>([])
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const fetchMembers = useCallback(async () => {
    if (!currentOrganization?.id) return
    
    try {
      setLoading(true)
      const response = await fetch(`/api/organizations/${currentOrganization.id}/members`)
      if (!response.ok) throw new Error('Failed to fetch members')
      
      const data = await response.json()
      setMembers(data.members)
      
      // Find current user's role
      const currentMember = data.members.find((m: TeamMember) => m.stackUserId === user?.id)
      if (currentMember) {
        setCurrentUserRole(currentMember.role)
      }
    } catch (error) {
      console.error('Error fetching members:', error)
      toast({
        title: 'Error',
        description: 'Failed to load organization members',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }, [currentOrganization?.id, user?.id, toast])

  const fetchInvitations = useCallback(async () => {
    if (!currentOrganization?.id) return
    
    try {
      const response = await fetch(`/api/organizations/${currentOrganization.id}/invitations`)
      if (!response.ok) return // Silently fail for invitations
      
      const data = await response.json()
      setInvitations(data.invitations || [])
    } catch (error) {
      console.error('Error fetching invitations:', error)
    }
  }, [currentOrganization?.id])

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchMembers()
      fetchInvitations()
    }
  }, [currentOrganization?.id, fetchMembers, fetchInvitations])

  const inviteMember = async () => {
    if (!currentOrganization?.id || !inviteEmail) return
    
    try {
      setInviting(true)
      const response = await fetch(`/api/organizations/${currentOrganization.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to send invitation')
      }
      
      toast({
        title: 'Invitation sent',
        description: `Invitation sent to ${inviteEmail}`
      })
      
      setInviteEmail('')
      setShowInviteDialog(false)
      fetchInvitations()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send invitation',
        variant: 'destructive'
      })
    } finally {
      setInviting(false)
    }
  }

  const updateMemberRole = async (memberId: string, newRole: string) => {
    if (!currentOrganization?.id) return
    
    try {
      const response = await fetch(`/api/organizations/${currentOrganization.id}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      })
      
      if (!response.ok) throw new Error('Failed to update member role')
      
      toast({
        title: 'Role updated',
        description: 'Member role has been updated successfully'
      })
      
      fetchMembers()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update member role',
        variant: 'destructive'
      })
    }
  }

  const removeMember = async (memberId: string) => {
    if (!currentOrganization?.id) return
    
    try {
      const response = await fetch(`/api/organizations/${currentOrganization.id}/members/${memberId}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) throw new Error('Failed to remove member')
      
      toast({
        title: 'Member removed',
        description: 'Member has been removed from the organization'
      })
      
      fetchMembers()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove member',
        variant: 'destructive'
      })
    }
  }

  const leaveOrganization = async () => {
    if (!currentOrganization?.id || !user?.id) return
    
    try {
      const response = await fetch(`/api/organizations/${currentOrganization.id}/leave`, {
        method: 'POST'
      })
      
      if (!response.ok) throw new Error('Failed to leave organization')
      
      toast({
        title: 'Left organization',
        description: 'You have left the organization'
      })
      
      await refetchOrganizations()
      window.location.href = '/organizations/select'
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to leave organization',
        variant: 'destructive'
      })
    }
  }

  const deleteOrganization = async () => {
    if (!currentOrganization?.id) return
    
    try {
      const response = await fetch(`/api/organizations/${currentOrganization.id}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) throw new Error('Failed to delete organization')
      
      toast({
        title: 'Organization deleted',
        description: 'The organization has been deleted'
      })
      
      await refetchOrganizations()
      window.location.href = '/organizations/select'
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete organization',
        variant: 'destructive'
      })
    }
  }

  const cancelInvitation = async (invitationId: string) => {
    if (!currentOrganization?.id) return
    
    try {
      const response = await fetch(`/api/organizations/${currentOrganization.id}/invitations/${invitationId}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) throw new Error('Failed to cancel invitation')
      
      toast({
        title: 'Invitation cancelled',
        description: 'The invitation has been cancelled'
      })
      
      fetchInvitations()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to cancel invitation',
        variant: 'destructive'
      })
    }
  }

  const canManageMembers = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN'
  const canDeleteOrg = currentUserRole === 'OWNER'
  const isLastOwner = members.filter(m => m.role === 'OWNER').length === 1 && currentUserRole === 'OWNER'

  return (
    <div className="space-y-6">
      {/* Organization Info */}
      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>Manage your organization settings and members</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Organization Name</Label>
            <p className="text-lg font-medium">{currentOrganization?.name}</p>
          </div>
          <div>
            <Label>Your Role</Label>
            <Badge className="mt-1">{currentUserRole}</Badge>
          </div>
          <div>
            <Label>Organization ID</Label>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-sm bg-muted px-2 py-1 rounded">{currentOrganization?.id}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(currentOrganization?.id || '')
                  toast({ title: 'Copied', description: 'Organization ID copied to clipboard' })
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Members</CardTitle>
            <CardDescription>Manage organization members and their roles</CardDescription>
          </div>
          {canManageMembers && (
            <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Member</DialogTitle>
                  <DialogDescription>
                    Send an invitation to join your organization
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="member@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="role">Role</Label>
                    <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="MEMBER">Member</SelectItem>
                        <SelectItem value="VIEWER">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={inviteMember} disabled={inviting || !inviteEmail}>
                    {inviting ? 'Sending...' : 'Send Invitation'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading members...</p>
          ) : (
            <div className="space-y-4">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {member.teamProfile?.displayName || member.user?.displayName || 'Unknown User'}
                      </p>
                      <p className="text-sm text-muted-foreground">{member.user?.primaryEmail}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManageMembers && member.stackUserId !== user?.id ? (
                      <>
                        <Select
                          value={member.role}
                          onValueChange={(value) => updateMemberRole(member.id, value)}
                          disabled={member.role === 'OWNER'}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="OWNER">Owner</SelectItem>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                            <SelectItem value="MEMBER">Member</SelectItem>
                            <SelectItem value="VIEWER">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeMember(member.id)}
                          disabled={member.role === 'OWNER'}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Badge>{member.role}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium mb-3">Pending Invitations</h4>
              <div className="space-y-2">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{invitation.email}</span>
                      <Badge variant="secondary" className="text-xs">{invitation.role}</Badge>
                    </div>
                    {canManageMembers && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelInvitation(invitation.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions for this organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isLastOwner && (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Leave Organization</p>
                <p className="text-sm text-muted-foreground">Remove yourself from this organization</p>
              </div>
              <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Leave
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Leave Organization?</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to leave {currentOrganization?.name}? You&apos;ll need an invitation to rejoin.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={leaveOrganization}>Leave Organization</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
          
          {canDeleteOrg && (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Delete Organization</p>
                <p className="text-sm text-muted-foreground">Permanently delete this organization and all its data</p>
              </div>
              <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Organization?</DialogTitle>
                    <DialogDescription>
                      This will permanently delete {currentOrganization?.name} and all associated data. This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={deleteOrganization}>Delete Organization</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}