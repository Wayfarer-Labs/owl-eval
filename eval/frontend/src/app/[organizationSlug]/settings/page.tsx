'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@stackframe/stack';
import { useOrganization } from '@/lib/organization-context';
import { Building2, Settings, Users, Key, Save, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';

interface OrganizationSettings {
  prolificApiKey?: string;
  defaultParticipantReward?: number;
  defaultStudyDuration?: number;
  notificationEmail?: string;
}

export default function OrganizationSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const user = useUser();
  const { currentOrganization, organizations, loading } = useOrganization();
  const { toast } = useToast();
  
  const [settings, setSettings] = useState<OrganizationSettings>({});
  const [orgName, setOrgName] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  const organizationSlug = params.organizationSlug as string;

  // Find the organization by slug
  const organization = organizations.find(org => org.slug === organizationSlug);

  const fetchOrganizationSettings = useCallback(async () => {
    if (!organization) return;
    
    try {
      const response = await fetch(`/api/organizations/${organization.id}/settings`);
      if (response.ok) {
        const data = await response.json();
        setSettings(data.settings || {});
      }
    } catch (error) {
      console.error('Failed to fetch organization settings:', error);
    } finally {
      setLoadingSettings(false);
    }
  }, [organization]);

  useEffect(() => {
    if (!loading && organization) {
      setOrgName(organization.name);
      setOrgDescription(organization.description || '');
      fetchOrganizationSettings();
    }
  }, [loading, organization, fetchOrganizationSettings]);

  const handleSaveBasicSettings = async () => {
    if (!organization) return;
    
    setSaving(true);
    try {
      const response = await fetch(`/api/organizations/${organization.id}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: orgName,
          description: orgDescription,
        }),
      });

      if (response.ok) {
        toast({
          title: "Settings updated",
          description: "Organization settings updated successfully",
        });
      } else {
        throw new Error('Failed to update settings');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update organization settings",
        variant: "destructive",
      });
      console.error('Save error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveIntegrationSettings = async () => {
    if (!organization) return;
    
    setSaving(true);
    try {
      const response = await fetch(`/api/organizations/${organization.id}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settings: settings,
        }),
      });

      if (response.ok) {
        toast({
          title: "Integration settings updated",
          description: "Integration settings updated successfully",
        });
      } else {
        throw new Error('Failed to update integration settings');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update integration settings",
        variant: "destructive",
      });
      console.error('Save error:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div>Please sign in to access organization settings.</div>
      </div>
    );
  }

  if (loading || loadingSettings) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Organization Not Found</h1>
          <p className="text-gray-600 mb-4">The organization &quot;{organizationSlug}&quot; could not be found.</p>
          <Button onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // Check if user has admin privileges
  const canEditSettings = organization.role === 'OWNER' || organization.role === 'ADMIN';

  if (!canEditSettings) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-4">You don&apos;t have permission to view organization settings.</p>
          <Button onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/')}
          className="h-8 w-8 p-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-semibold">{organization.name}</h1>
            <p className="text-sm text-gray-600">Organization Settings</p>
          </div>
          <Badge variant="outline" className="ml-2">
            {organization.role.toLowerCase()}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Integrations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Organization Details</CardTitle>
              <CardDescription>
                Update your organization&apos;s basic information and settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name</Label>
                <Input
                  id="orgName"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Enter organization name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="orgSlug">Organization Slug</Label>
                <Input
                  id="orgSlug"
                  value={organization.slug}
                  disabled
                  className="bg-gray-50"
                />
                <p className="text-sm text-gray-500">
                  The organization slug cannot be changed after creation.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="orgDescription">Description</Label>
                <Textarea
                  id="orgDescription"
                  value={orgDescription}
                  onChange={(e) => setOrgDescription(e.target.value)}
                  placeholder="Enter organization description (optional)"
                  rows={3}
                />
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={handleSaveBasicSettings} disabled={saving}>
                  {saving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Manage your organization&apos;s team members and their roles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Member Management</h3>
                <p className="text-gray-600 mb-4">
                  Team member management is handled through Stack Auth. Members are automatically synced from your Stack Auth team.
                </p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={() => window.open('https://app.stack-auth.com', '_blank')}>
                    Manage in Stack Auth
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={async () => {
                      try {
                        const response = await fetch(`/api/organizations/${organization.id}/sync-stack-auth`, {
                          method: 'POST',
                        });
                        if (response.ok) {
                          toast({
                            title: "Sync successful",
                            description: "Team members synced successfully",
                          });
                        } else {
                          throw new Error('Sync failed');
                        }
                      } catch (error) {
                        toast({
                          title: "Error",
                          description: "Failed to sync team members",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Sync Members
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Prolific Integration</CardTitle>
              <CardDescription>
                Configure your Prolific API credentials for participant recruitment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prolificApiKey">Prolific API Key</Label>
                <Input
                  id="prolificApiKey"
                  type="password"
                  value={settings.prolificApiKey || ''}
                  onChange={(e) => setSettings({ ...settings, prolificApiKey: e.target.value })}
                  placeholder="Enter your Prolific API key"
                />
                <p className="text-sm text-gray-500">
                  Your Prolific API key is required to create and manage studies. Get your API key from your{' '}
                  <a href="https://app.prolific.com/settings/api" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    Prolific account settings
                  </a>.
                </p>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultReward">Default Participant Reward (£)</Label>
                  <Input
                    id="defaultReward"
                    type="number"
                    step="0.01"
                    min="0"
                    value={settings.defaultParticipantReward || ''}
                    onChange={(e) => setSettings({ 
                      ...settings, 
                      defaultParticipantReward: parseFloat(e.target.value) || undefined 
                    })}
                    placeholder="5.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="defaultDuration">Default Study Duration (minutes)</Label>
                  <Input
                    id="defaultDuration"
                    type="number"
                    min="1"
                    value={settings.defaultStudyDuration || ''}
                    onChange={(e) => setSettings({ 
                      ...settings, 
                      defaultStudyDuration: parseInt(e.target.value) || undefined 
                    })}
                    placeholder="10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notificationEmail">Notification Email</Label>
                <Input
                  id="notificationEmail"
                  type="email"
                  value={settings.notificationEmail || ''}
                  onChange={(e) => setSettings({ ...settings, notificationEmail: e.target.value })}
                  placeholder="notifications@yourorg.com"
                />
                <p className="text-sm text-gray-500">
                  Email address to receive notifications about study progress and issues.
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={handleSaveIntegrationSettings} disabled={saving}>
                  {saving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Integration Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}