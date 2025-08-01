'use client'

import { useState } from 'react'
import { toast } from '@/components/ui/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  ExternalLink, 
  Plus, 
  Search, 
  MoreHorizontal,
  Calendar,
  Users,
  BarChart3,
  Play,
  Pause,
  Archive,
  ArchiveRestore,
  Edit,
  Trash2,
  UserPlus,
  DollarSign,
  RefreshCw,
  Upload,
  StopCircle
} from 'lucide-react'
import { getStatusColor, ExperimentStatus } from '@/lib/utils/status'

interface Experiment {
  id: string
  slug: string
  name: string
  description: string | null
  status: string
  archived: boolean
  archivedAt: string | null
  group: string | null
  prolificStudyId: string | null
  evaluationMode: string
  config: any
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  _count: {
    twoVideoComparisonTasks: number
    singleVideoEvaluationTasks: number
    participants: number
    twoVideoComparisonSubmissions: number
    singleVideoEvaluationSubmissions: number
  }
}

interface ExperimentTableProps {
  experiments: Experiment[]
  loading?: boolean
  onCreateNew: () => void
  onRefresh?: () => void
  onCreateProlificStudy?: (experimentId: string) => void
}

export function ExperimentTable({ 
  experiments, 
  loading, 
  onCreateNew,
  onRefresh,
  onCreateProlificStudy 
}: ExperimentTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const filteredExperiments = experiments.filter(exp => {
    const matchesSearch = searchTerm === '' || 
      exp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.description?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || exp.status === statusFilter
    const matchesGroup = groupFilter === 'all' || exp.group === groupFilter || (!exp.group && groupFilter === 'ungrouped')
    
    return matchesSearch && matchesStatus && matchesGroup
  })

  const uniqueGroups = Array.from(new Set(experiments.map(exp => exp.group).filter(Boolean)))


  const getProgressPercentage = (exp: Experiment) => {
    // For progress, show completed participants vs requested participants
    const requestedParticipants = exp.config?.evaluationsPerComparison
    const completedParticipants = exp._count.participants
    
    if (!requestedParticipants || requestedParticipants === 0) return 0
    return Math.min((completedParticipants / requestedParticipants) * 100, 100)
  }

  const getTargetParticipants = (exp: Experiment) => {
    return exp.config?.evaluationsPerComparison
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const handleUpdateStatus = async (experimentId: string, newStatus: string) => {
    setActionLoading(experimentId)
    try {
      const response = await fetch(`/api/experiments/${experimentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) {
        throw new Error('Failed to update experiment status')
      }

      toast({
        title: 'Success',
        description: `Experiment ${newStatus === 'active' ? 'started' : newStatus === 'paused' ? 'paused' : 'updated'} successfully`,
      })

      // Refresh the experiments list
      if (onRefresh) {
        onRefresh()
      }
    } catch (error) {
      console.error('Error updating experiment:', error)
      toast({
        title: 'Error',
        description: 'Failed to update experiment status',
        variant: 'destructive'
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleLaunchExperiment = async (experiment: Experiment) => {
    setActionLoading(experiment.id)
    try {
      // First publish the Prolific study
      if (experiment.prolificStudyId) {
        const prolificResponse = await fetch(`/api/prolific/studies/${experiment.prolificStudyId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'publish' }),
        })

        if (!prolificResponse.ok) {
          const errorData = await prolificResponse.json()
          throw new Error(errorData.error || 'Failed to publish Prolific study')
        }
      }

      // Then update experiment status to active
      const response = await fetch(`/api/experiments/${experiment.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'active' }),
      })

      if (!response.ok) {
        throw new Error('Failed to update experiment status')
      }

      toast({
        title: 'Success',
        description: 'Experiment launched successfully! Prolific study is now active.',
      })

      // Refresh the experiments list
      if (onRefresh) {
        onRefresh()
      }
    } catch (error: any) {
      console.error('Error launching experiment:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to launch experiment',
        variant: 'destructive'
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteExperiment = async (experimentId: string, experimentName: string) => {
    if (!confirm(`Are you sure you want to delete "${experimentName}"? This action cannot be undone.`)) {
      return
    }

    setActionLoading(experimentId)
    try {
      const response = await fetch(`/api/experiments/${experimentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete experiment')
      }

      toast({
        title: 'Success',
        description: 'Experiment deleted successfully',
      })

      // Refresh the experiments list
      if (onRefresh) {
        onRefresh()
      }
    } catch (error: any) {
      console.error('Error deleting experiment:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete experiment',
        variant: 'destructive'
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleArchiveExperiment = async (experimentId: string) => {
    setActionLoading(experimentId)
    try {
      const response = await fetch(`/api/experiments/${experimentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ archived: true }),
      })

      if (!response.ok) {
        throw new Error('Failed to archive experiment')
      }

      toast({
        title: 'Success',
        description: 'Experiment archived successfully',
      })

      // Refresh the experiments list
      if (onRefresh) {
        onRefresh()
      }
    } catch (error) {
      console.error('Error archiving experiment:', error)
      toast({
        title: 'Error',
        description: 'Failed to archive experiment',
        variant: 'destructive'
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleUnarchiveExperiment = async (experimentId: string) => {
    setActionLoading(experimentId)
    try {
      const response = await fetch(`/api/experiments/${experimentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ archived: false }),
      })

      if (!response.ok) {
        throw new Error('Failed to unarchive experiment')
      }

      toast({
        title: 'Success',
        description: 'Experiment unarchived successfully',
      })

      // Refresh the experiments list
      if (onRefresh) {
        onRefresh()
      }
    } catch (error) {
      console.error('Error unarchiving experiment:', error)
      toast({
        title: 'Error',
        description: 'Failed to unarchive experiment',
        variant: 'destructive'
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleSyncProlificData = async (experiment: Experiment) => {
    if (!experiment.prolificStudyId) {
      toast({
        title: 'Error',
        description: 'This experiment is not linked to a Prolific study',
        variant: 'destructive'
      })
      return
    }

    setActionLoading(experiment.id)
    try {
      const response = await fetch('/api/prolific/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studyId: experiment.prolificStudyId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to sync Prolific data')
      }

      const result = await response.json()

      toast({
        title: 'Sync Complete',
        description: `Synced ${result.syncedParticipants} participants with demographic data`,
      })

      // Refresh the experiments list to show updated counts
      if (onRefresh) {
        onRefresh()
      }
    } catch (error: any) {
      console.error('Error syncing Prolific data:', error)
      toast({
        title: 'Sync Failed',
        description: error.message || 'Failed to sync Prolific data',
        variant: 'destructive'
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleProlificAction = async (experiment: Experiment, action: 'publish' | 'pause' | 'stop') => {
    if (!experiment.prolificStudyId) {
      toast({
        title: 'Error',
        description: 'This experiment is not linked to a Prolific study',
        variant: 'destructive'
      })
      return
    }

    setActionLoading(experiment.id)
    try {
      const response = await fetch(`/api/prolific/studies/${experiment.prolificStudyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed to ${action} Prolific study`)
      }

      const actionPastTense = action === 'publish' ? 'published' : action === 'pause' ? 'paused' : 'stopped'
      toast({
        title: 'Success',
        description: `Prolific study ${actionPastTense} successfully`,
      })

      // Refresh the experiments list to show updated status
      if (onRefresh) {
        onRefresh()
      }
    } catch (error: any) {
      console.error(`Error ${action}ing Prolific study:`, error)
      toast({
        title: 'Error',
        description: error.message || `Failed to ${action} Prolific study`,
        variant: 'destructive'
      })
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 bg-muted rounded w-1/4 animate-pulse"></div>
          <div className="h-4 bg-muted rounded w-1/2 animate-pulse"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-muted/50 rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Experiments
              <Badge variant="secondary" className="ml-2">
                {experiments.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Manage and monitor all evaluation experiments
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh}>
                Refresh
              </Button>
            )}
            <Button size="sm" onClick={onCreateNew} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Experiment
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search experiments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="sm:w-auto w-full">
                Group: {groupFilter === 'all' ? 'All' : groupFilter === 'ungrouped' ? 'Ungrouped' : groupFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setGroupFilter('all')}>
                All Groups
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setGroupFilter('ungrouped')}>
                Ungrouped
              </DropdownMenuItem>
              {uniqueGroups.map((group) => (
                <DropdownMenuItem key={group} onClick={() => setGroupFilter(group!)}>
                  {group}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="sm:w-auto w-full">
                Status: {statusFilter === 'all' ? 'All' : statusFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setStatusFilter('all')}>
                All Status
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter(ExperimentStatus.READY)}>
                Ready
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter(ExperimentStatus.ACTIVE)}>
                Active
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter(ExperimentStatus.DRAFT)}>
                Draft
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter(ExperimentStatus.COMPLETED)}>
                Completed
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter(ExperimentStatus.PAUSED)}>
                Paused
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter('archived')}>
                Archived
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Table */}
        {filteredExperiments.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Experiment</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Participants</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExperiments.map((exp) => (
                  <TableRow key={exp.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{exp.name}</div>
                        <div className="text-sm text-muted-foreground">
                          <code className="bg-muted px-1 rounded text-xs">
                            {exp.slug}
                          </code>
                        </div>
                        {exp.description && (
                          <div className="text-xs text-muted-foreground max-w-md truncate">
                            {exp.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {exp.group ? (
                        <Badge variant="outline" className="text-xs">
                          {exp.group}
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge className={getStatusColor(exp.status, exp.archived)}>
                          {exp.archived ? 'archived' : exp.status}
                        </Badge>
                        {exp.prolificStudyId && (
                          <a
                            href={`https://app.prolific.co/researcher/studies/${exp.prolificStudyId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-1"
                          >
                            <UserPlus className="h-3 w-3" />
                            Prolific Study
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2 min-w-[120px]">
                        <div className="flex justify-between text-xs">
                          <span>
                            {exp._count.participants} participants
                          </span>
                          <span>{Math.round(getProgressPercentage(exp))}%</span>
                        </div>
                        <Progress value={getProgressPercentage(exp)} className="h-2" />
                        <div className="text-xs text-gray-500">
                          {getTargetParticipants(exp) ? 
                            `${exp._count.participants}/${getTargetParticipants(exp)} requested` :
                            `${exp._count.participants} participants (target not set)`
                          }
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3 text-gray-400" />
                        <span className="text-sm font-medium">
                          {exp._count.participants}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Calendar className="h-3 w-3" />
                        {formatDate(exp.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            disabled={actionLoading === exp.id}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={async () => {
                              try {
                                console.log('Opening evaluation for experiment:', { id: exp.id, slug: exp.slug, name: exp.name, evaluationMode: exp.evaluationMode, status: exp.status })
                                
                                // Get the first available task for this experiment
                                if (exp.evaluationMode === 'single_video') {
                                  console.log('Fetching video tasks for experiment:', exp.id)
                                  const response = await fetch(`/api/single-video-evaluation-tasks?experimentId=${exp.id}`)
                                  console.log('Video tasks response:', response.status, response.ok)
                                  
                                  if (response.ok) {
                                    const videoTasks = await response.json()
                                    console.log('Video tasks found:', videoTasks.length, videoTasks)
                                    
                                    if (videoTasks.length > 0) {
                                      const url = `/evaluate/${videoTasks[0].id}?admin=true`
                                      console.log('Opening URL:', url)
                                      // Create a temporary link element to ensure new tab (not popup)
                                      const link = document.createElement('a')
                                      link.href = url
                                      link.target = '_blank'
                                      link.rel = 'noopener noreferrer'
                                      document.body.appendChild(link)
                                      link.click()
                                      document.body.removeChild(link)
                                      return
                                    }
                                  } else {
                                    const errorText = await response.text()
                                    console.error('Video tasks API error:', errorText)
                                  }
                                } else {
                                  console.log('Fetching comparisons for experiment:', exp.id)
                                  const response = await fetch(`/api/two-video-comparison-tasks?experimentId=${exp.id}`)
                                  console.log('Comparisons response:', response.status, response.ok)
                                  
                                  if (response.ok) {
                                    const comparisons = await response.json()
                                    console.log('Comparisons found:', comparisons.length, comparisons)
                                    
                                    if (comparisons.length > 0) {
                                      const url = `/evaluate/${comparisons[0].comparison_id}?admin=true`
                                      console.log('Opening URL:', url)
                                      // Create a temporary link element to ensure new tab (not popup)
                                      const link = document.createElement('a')
                                      link.href = url
                                      link.target = '_blank'
                                      link.rel = 'noopener noreferrer'
                                      document.body.appendChild(link)
                                      link.click()
                                      document.body.removeChild(link)
                                      return
                                    }
                                  } else {
                                    const errorText = await response.text()
                                    console.error('Comparisons API error:', errorText)
                                  }
                                }
                                
                                // Fallback: no tasks available
                                console.log('No tasks found, showing error toast')
                                toast({
                                  title: 'No Evaluations Available',
                                  description: 'No evaluation tasks are currently available for this experiment',
                                  variant: 'destructive'
                                })
                              } catch (error) {
                                console.error('Error opening evaluation:', error)
                                toast({
                                  title: 'Error',
                                  description: 'Failed to open evaluation',
                                  variant: 'destructive'
                                })
                              }
                            }}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open Evaluation
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Details
                          </DropdownMenuItem>
                          {exp.prolificStudyId && (
                            <DropdownMenuItem
                              onClick={() => handleSyncProlificData(exp)}
                              disabled={actionLoading === exp.id}
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Sync Prolific Data
                            </DropdownMenuItem>
                          )}
                          
                          {/* DRAFT Status: Ready or Ready+Publish options */}
                          {exp.status === ExperimentStatus.DRAFT && !exp.archived && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleUpdateStatus(exp.id, ExperimentStatus.READY)}
                                disabled={actionLoading === exp.id}
                              >
                                <Play className="h-4 w-4 mr-2" />
                                Ready
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  setActionLoading(exp.id)
                                  try {
                                    // First make experiment ready
                                    const response = await fetch(`/api/experiments/${exp.id}`, {
                                      method: 'PUT',
                                      headers: {
                                        'Content-Type': 'application/json',
                                      },
                                      body: JSON.stringify({ status: ExperimentStatus.READY }),
                                    })

                                    if (!response.ok) {
                                      throw new Error('Failed to update experiment status')
                                    }

                                    // Then upload to Prolific
                                    if (onCreateProlificStudy) {
                                      onCreateProlificStudy(exp.id)
                                    }

                                    // Refresh the experiments list
                                    if (onRefresh) {
                                      onRefresh()
                                    }
                                  } catch (error) {
                                    console.error('Error in ready+publish flow:', error)
                                    toast({
                                      title: 'Error',
                                      description: 'Failed to update experiment and publish to Prolific',
                                      variant: 'destructive'
                                    })
                                  } finally {
                                    setActionLoading(null)
                                  }
                                }}
                                disabled={actionLoading === exp.id || !onCreateProlificStudy}
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                Ready and Publish to Prolific
                              </DropdownMenuItem>
                            </>
                          )}

                          {/* READY/UNPUBLISHED: Show Publish button */}
                          {exp.status === ExperimentStatus.READY && !exp.prolificStudyId && !exp.archived && (
                            <DropdownMenuItem
                              onClick={() => onCreateProlificStudy?.(exp.id)}
                              disabled={!onCreateProlificStudy}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Publish to Prolific
                            </DropdownMenuItem>
                          )}

                          {/* READY/PUBLISHED: Show Launch button */}
                          {exp.status === ExperimentStatus.READY && exp.prolificStudyId && (exp.config?.prolificStatus === 'UNPUBLISHED' || exp.config?.prolificStatus === 'DRAFT') && !exp.archived && (
                            <DropdownMenuItem
                              onClick={() => handleProlificAction(exp, 'publish')}
                              disabled={actionLoading === exp.id}
                            >
                              <DollarSign className="h-4 w-4 mr-2" />
                              Launch
                            </DropdownMenuItem>
                          )}

                          {/* Step 3: Active, Published -> Pause/Resume Experiment */}
                          {exp.prolificStudyId && exp.status === 'active' && (
                            <DropdownMenuItem
                              onClick={() => handleUpdateStatus(exp.id, 'paused')}
                              disabled={actionLoading === exp.id}
                            >
                              <Pause className="h-4 w-4 mr-2" />
                              Pause Experiment
                            </DropdownMenuItem>
                          )}
                          {exp.prolificStudyId && exp.status === 'paused' && (
                            <DropdownMenuItem
                              onClick={() => handleUpdateStatus(exp.id, 'active')}
                              disabled={actionLoading === exp.id}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Resume Experiment
                            </DropdownMenuItem>
                          )}

                          {/* Prolific Management Actions */}
                          {exp.prolificStudyId && (exp.config?.prolificStatus === 'ACTIVE' || exp.config?.prolificStatus === 'RUNNING') && (
                            <DropdownMenuItem
                              onClick={() => handleProlificAction(exp, 'pause')}
                              disabled={actionLoading === exp.id}
                            >
                              <Pause className="h-4 w-4 mr-2" />
                              Pause Prolific Study
                            </DropdownMenuItem>
                          )}
                          {exp.prolificStudyId && exp.config?.prolificStatus === 'PAUSED' && (
                            <DropdownMenuItem
                              onClick={() => handleProlificAction(exp, 'publish')}
                              disabled={actionLoading === exp.id}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Resume Prolific Study
                            </DropdownMenuItem>
                          )}
                          {exp.prolificStudyId && (exp.config?.prolificStatus === 'ACTIVE' || exp.config?.prolificStatus === 'RUNNING' || exp.config?.prolificStatus === 'PAUSED') && (
                            <DropdownMenuItem
                              onClick={() => handleProlificAction(exp, 'stop')}
                              disabled={actionLoading === exp.id}
                              className="text-red-600"
                            >
                              <StopCircle className="h-4 w-4 mr-2" />
                              Stop Prolific Study
                            </DropdownMenuItem>
                          )}
                          {exp.archived ? (
                            <DropdownMenuItem
                              onClick={() => handleUnarchiveExperiment(exp.id)}
                              disabled={actionLoading === exp.id}
                            >
                              <ArchiveRestore className="h-4 w-4 mr-2" />
                              Unarchive
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleArchiveExperiment(exp.id)}
                              disabled={actionLoading === exp.id}
                            >
                              <Archive className="h-4 w-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => handleDeleteExperiment(exp.id, exp.name)}
                            disabled={actionLoading === exp.id}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-12 border border-dashed rounded-lg">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {searchTerm || statusFilter !== 'all' ? 'No matching experiments' : 'No experiments yet'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your search or filters'
                : 'Create your first experiment to get started with evaluations'
              }
            </p>
            {(!searchTerm && statusFilter === 'all') && (
              <Button onClick={onCreateNew}>
                <Plus className="h-4 w-4 mr-2" />
                Create Experiment
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}