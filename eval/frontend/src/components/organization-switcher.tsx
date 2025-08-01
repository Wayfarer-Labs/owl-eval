'use client';

import React, { useState } from 'react';
import { useOrganization } from '@/lib/organization-context';
import { useUser } from '@stackframe/stack';
import { Building2, Plus, ChevronDown, Settings } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function OrganizationSwitcher() {
  const user = useUser();
  const { currentOrganization, organizations, switchOrganization, loading } = useOrganization();

  if (!user || loading) {
    return (
      <div className="w-48 h-10 bg-gray-800 border border-gray-700 rounded-md animate-pulse" />
    );
  }

  if (organizations.length === 0) {
    return (
      <Button 
        variant="outline" 
        size="sm"
        onClick={() => window.location.href = '/onboarding/create-organization'}
        className="bg-gray-800 border-gray-700 hover:bg-gray-700"
      >
        <Plus className="h-4 w-4 mr-2" />
        Create Organization
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="w-48 bg-gray-800 border-gray-700 hover:bg-gray-700 justify-between"
        >
          <div className="flex items-center space-x-2 truncate">
            <Building2 className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">
              {currentOrganization?.name || 'Select Organization'}
            </span>
            {currentOrganization && (
              <Badge variant="outline" className="text-xs">
                {currentOrganization.role.toLowerCase()}
              </Badge>
            )}
          </div>
          <ChevronDown className="h-4 w-4 flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent className="w-64" align="start">
        <div className="px-2 py-1.5 text-sm font-semibold text-gray-400">
          Organizations
        </div>
        
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => switchOrganization(org.id)}
            className={`flex items-center justify-between p-2 ${
              currentOrganization?.id === org.id ? 'bg-gray-100 dark:bg-gray-800' : ''
            }`}
          >
            <div className="flex items-center space-x-2">
              <Building2 className="h-4 w-4" />
              <span className="truncate">{org.name}</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {org.role.toLowerCase()}
            </Badge>
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        
        {currentOrganization && (
          <DropdownMenuItem
            onClick={() => window.location.href = `/${currentOrganization.slug}/settings`}
            className="flex items-center space-x-2"
          >
            <Settings className="h-4 w-4" />
            <span>Organization Settings</span>
          </DropdownMenuItem>
        )}
        
        <DropdownMenuItem
          onClick={() => window.location.href = '/onboarding/create-organization'}
          className="flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Create Organization</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}