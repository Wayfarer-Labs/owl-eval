'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRequireOrganization } from '@/lib/organization-context'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { 
  showApiError, 
  showOperationError, 
  showUploadSuccess, 
  showDeleteSuccess, 
  showUpdateSuccess, 
  showCopySuccess, 
  showNoSelectionError 
} from '@/lib/utils/toast-utils'
import { LogOut, RefreshCw } from 'lucide-react'

// Import new admin components
import { StatsDashboard } from '@/components/admin/stats-dashboard'
import { ExperimentTable } from '@/components/admin/experiment-table'
import { VideoLibraryManager } from '@/components/admin/video-library-manager'
import { CLIToolsPanel } from '@/components/admin/cli-tools-panel'
import { CreateExperimentWizard } from '@/components/admin/create-experiment-wizard'
import { BulkExperimentWizard } from '@/components/admin/bulk-experiment-wizard'
import { EnhancedAnalyticsDashboard } from '@/components/admin/enhanced-analytics-dashboard'
import { ProgressTracker } from '@/components/admin/progress-tracker'
import { ProlificDialog } from '@/components/admin/prolific-dialog'
import { DemographicsDashboard } from '@/components/admin/demographics-dashboard'
import { ModelSelectionDialog } from '@/components/admin/model-selection-dialog'
import { Breadcrumbs } from '@/components/navigation'

interface EvaluationStats {
  total_tasks: number
  total_submissions: number
  total_comparison_tasks: number
  total_single_video_tasks: number
  total_comparison_submissions: number
  total_single_video_submissions: number
  evaluations_by_scenario: Record<string, number>
  target_evaluations_per_comparison: number
}

interface ModelPerformance {
  model: string
  dimension: string
  scenario?: string
  win_rate: number
  num_evaluations: number
  detailed_scores?: {
    A_much_better: number
    A_slightly_better: number
    Equal: number
    B_slightly_better: number
    B_much_better: number
  }
}

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
  comparisons?: Array<any>
  _count: {
    twoVideoComparisonTasks: number
    singleVideoEvaluationTasks: number
    participants: number
    twoVideoComparisonSubmissions: number
    singleVideoEvaluationSubmissions: number
  }
}

interface ComparisonProgress {
  id: string
  scenarioId: string
  modelA: string
  modelB: string
  evaluationCount: number
  targetEvaluations: number
  progressPercentage: number
}

interface UploadedVideo {
  id: string
  key: string
  name: string
  url: string
  size: number
  duration?: number
  tags: string[]
  groups: string[]
  modelName?: string
  scenarioId?: string
  uploadedAt: Date
  metadata?: any
}

export default function AdminPage() {
  // Organization context
  const { currentOrganization, loading: orgLoading } = useRequireOrganization()
  
  // Data state
  const [stats, setStats] = useState<EvaluationStats | null>(null)
  const [evaluationStatus, setEvaluationStatus] = useState<any>(null)
  const [performance, setPerformance] = useState<ModelPerformance[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [comparisonProgress, setComparisonProgress] = useState<ComparisonProgress[]>([])
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([])
  
  // UI state
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showCreateWizard, setShowCreateWizard] = useState(false)
  const [showBulkWizard, setShowBulkWizard] = useState(false)
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set())
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [prolificDialogOpen, setProlificDialogOpen] = useState(false)
  const [selectedExperimentForProlific, setSelectedExperimentForProlific] = useState<Experiment | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [selectedExperiment, setSelectedExperiment] = useState<string | null>(null)
  const [includeAnonymous, setIncludeAnonymous] = useState(false)
  
  // Model selection dialog state
  const [showModelDialog, setShowModelDialog] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  // Get existing models from uploaded videos
  const existingModels = Array.from(new Set(
    uploadedVideos.filter(v => v.modelName).map(v => v.modelName!)
  ))

  // Check if Stack Auth is configured (client-side check)
  const isStackAuthConfigured = typeof window !== 'undefined' && 
    process.env.NEXT_PUBLIC_STACK_PROJECT_ID && 
    process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY

  const fetchAllData = useCallback(async () => {
    if (!currentOrganization) {
      return;
    }
    
    try {
      const groupParam = selectedGroup ? `group=${encodeURIComponent(selectedGroup)}&` : ''
      const anonParam = `includeAnonymous=${includeAnonymous}`
      const queryString = `?${groupParam}${anonParam}`
      
      const [statsRes, evalStatusRes, perfRes, expRes, progressRes] = await Promise.all([
        fetch(`/api/organizations/${currentOrganization.id}/submission-stats${queryString}`),
        fetch(`/api/organizations/${currentOrganization.id}/submission-status${queryString}`),
        fetch(`/api/organizations/${currentOrganization.id}/model-performance${queryString}`),
        fetch(`/api/organizations/${currentOrganization.id}/experiments${queryString}`),
        fetch(`/api/organizations/${currentOrganization.id}/two-video-comparison-progress${queryString}`)
      ])
      
      // Check for successful responses and handle errors gracefully
      const [statsData, evalStatusData, perfData, expData, progressData] = await Promise.all([
        statsRes.ok ? statsRes.json() : null,
        evalStatusRes.ok ? evalStatusRes.json() : null,
        perfRes.ok ? perfRes.json() : null,
        expRes.ok ? expRes.json() : [],
        progressRes.ok ? progressRes.json() : []
      ])
      
      setStats(statsData)
      setEvaluationStatus(evalStatusData)
      setPerformance(Array.isArray(perfData) ? perfData : [])
      // Handle organization experiments response structure
      setExperiments(expData?.experiments ? expData.experiments : (Array.isArray(expData) ? expData : []))
      setComparisonProgress(Array.isArray(progressData) ? progressData : [])
      
      // Log any failed requests
      if (!statsRes.ok) console.warn('Failed to fetch stats:', statsRes.status)
      if (!evalStatusRes.ok) console.warn('Failed to fetch evaluation status:', evalStatusRes.status)
      if (!perfRes.ok) console.warn('Failed to fetch performance data:', perfRes.status)
      if (!expRes.ok) console.warn('Failed to fetch experiments:', expRes.status)
      if (!progressRes.ok) console.warn('Failed to fetch progress data:', progressRes.status)
      
    } catch (error) {
      console.error('Error fetching data:', error)
      // Set safe defaults to prevent UI crashes
      setStats(null)
      setEvaluationStatus(null)
      setPerformance([])
      setExperiments([])
      setComparisonProgress([])
      showApiError()
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [currentOrganization, selectedGroup, includeAnonymous])

  useEffect(() => {
    if (currentOrganization) {
      fetchAllData()
    }
  }, [currentOrganization, selectedGroup, includeAnonymous, fetchAllData])
  
  useEffect(() => {
    if (!currentOrganization) return;
    
    const dataInterval = setInterval(() => {
      if (currentOrganization) {
        fetchAllData()
      }
    }, 60000) // Refresh every 60 seconds
    
    return () => {
      clearInterval(dataInterval)
    }
  }, [currentOrganization, fetchAllData])

  const fetchVideoLibrary = useCallback(async () => {
    if (!currentOrganization) return;
    
    try {
      const response = await fetch(`/api/organizations/${currentOrganization.id}/videos`)
      if (response.ok) {
        const data = await response.json()
        const videos = data.videos || []
        const videosWithDates = videos.map((video: any) => ({
          ...video,
          uploadedAt: new Date(video.uploadedAt),
          tags: video.tags || [],
          groups: video.groups || []
        }))
        setUploadedVideos(videosWithDates)
      }
    } catch (error) {
      console.error('Error fetching video library:', error)
    }
  }, [currentOrganization])

  useEffect(() => {
    if (currentOrganization) {
      fetchVideoLibrary()
    }
  }, [currentOrganization, fetchVideoLibrary])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchAllData()
    await fetchVideoLibrary()
  }

  const handleVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    
    // Filter out non-video files and show errors
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('video/')) {
        toast({
          title: 'Invalid file type',
          description: `${file.name} is not a video file`,
          variant: 'destructive'
        })
        return false
      }
      return true
    })

    if (validFiles.length === 0) {
      return
    }

    // Show model selection dialog instead of uploading immediately
    setPendingFiles(validFiles)
    setShowModelDialog(true)
  }

  const handleVideoSelect = (videoKey: string) => {
    setSelectedVideos(prev => {
      const newSet = new Set(prev)
      if (newSet.has(videoKey)) {
        newSet.delete(videoKey)
      } else {
        newSet.add(videoKey)
      }
      return newSet
    })
  }

  const handleSelectAllVideos = () => {
    setSelectedVideos(new Set(uploadedVideos.map(v => v.key)))
  }

  const handleClearSelection = () => {
    setSelectedVideos(new Set())
  }

  const handleCopySelectedUrls = async () => {
    if (selectedVideos.size === 0) {
      showNoSelectionError('copy URLs', 'videos')
      return
    }

    const selectedUrls = uploadedVideos
      .filter(video => selectedVideos.has(video.key))
      .map(video => video.url)
      .join('\n')

    try {
      await navigator.clipboard.writeText(selectedUrls)
      showCopySuccess(selectedVideos.size, 'video URLs')
    } catch (err) {
      console.error('Failed to copy:', err)
      showOperationError('Copy', 'URLs to clipboard')
    }
  }

  const handleDeleteSelectedVideos = async () => {
    if (selectedVideos.size === 0) {
      showNoSelectionError('delete', 'videos')
      return
    }

    const selectedKeys = Array.from(selectedVideos)
    
    try {
      const response = await fetch('/api/video-library/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keys: selectedKeys })
      })

      if (!response.ok) {
        throw new Error('Delete failed')
      }

      const result = await response.json()
      
      setUploadedVideos(prev => prev.filter(video => !selectedVideos.has(video.key)))
      setSelectedVideos(new Set())

      showDeleteSuccess(result.deleted, 'Video')
    } catch (error) {
      console.error('Delete error:', error)
      showOperationError('Delete', 'selected videos')
    }
  }

  const handleCopyCommand = (_command: string, commandId: string) => {
    setCopiedCommand(commandId)
    setTimeout(() => setCopiedCommand(null), 2000)
  }

  const handleCreateProlificStudy = (experimentId: string) => {
    const experiment = experiments.find(exp => exp.id === experimentId)
    if (experiment) {
      setSelectedExperimentForProlific(experiment)
      setProlificDialogOpen(true)
    }
  }

  const handleUpdateVideo = async (videoId: string, updates: Partial<UploadedVideo>) => {
    try {
      const response = await fetch(`/api/videos/${videoId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates)
      })

      if (!response.ok) {
        throw new Error('Update failed')
      }

      const updatedVideo = await response.json()
      
      setUploadedVideos(prev => prev.map(video => 
        video.id === videoId 
          ? { ...video, ...updatedVideo, uploadedAt: new Date(updatedVideo.uploadedAt) }
          : video
      ))

      showUpdateSuccess('Video metadata')
    } catch (error) {
      console.error('Update video error:', error)
      showOperationError('Update', 'video metadata')
    }
  }

  const handleModelConfirm = async (modelName: string) => {
    setUploading(true)
    
    try {
      for (const file of pendingFiles) {
        const formData = new FormData()
        formData.append('video', file)
        formData.append('libraryUpload', 'true')
        formData.append('modelName', modelName)

        const response = await fetch('/api/video-library/upload', {
          method: 'POST',
          body: formData
        })

        if (!response.ok) {
          throw new Error('Upload failed')
        }

        const data = await response.json()
        
        setUploadedVideos(prev => [...prev, {
          id: data.id || data.key,
          url: data.videoUrl,
          name: file.name,
          uploadedAt: new Date(),
          key: data.key,
          size: file.size,
          tags: [],
          groups: [],
          modelName: modelName
        }])

        showUploadSuccess(file.name)
      }
      
      // Close dialog and reset state
      setShowModelDialog(false)
      setPendingFiles([])
      
    } catch (error) {
      console.error('Upload error:', error)
      showOperationError('Upload', 'videos')
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-muted rounded"></div>
              ))}
            </div>
            <div className="h-96 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  // Show loading state while organization is loading
  if (orgLoading || !currentOrganization) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">
            {orgLoading ? 'Loading organization...' : 'No organization selected'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumbs */}
        <Breadcrumbs 
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin Dashboard' }
          ]}
          className="mb-6"
        />
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Manage experiments, monitor progress, and analyze model performance
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {isStackAuthConfigured && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = '/handler/sign-out'}
                className="flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6 mb-8 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center space-x-2">
            <Switch
              id="include-anonymous"
              checked={includeAnonymous}
              onCheckedChange={setIncludeAnonymous}
            />
            <Label htmlFor="include-anonymous" className="text-sm font-medium">
              Include Anonymous Users
              <span className="text-muted-foreground text-xs block">
                {includeAnonymous ? 'Showing all users (Prolific + Anonymous)' : 'Prolific users only'}
              </span>
            </Label>
          </div>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="experiments">Experiments</TabsTrigger>
            <TabsTrigger value="videos">Videos</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="demographics">Demographics</TabsTrigger>
            <TabsTrigger value="tools">CLI Tools</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-6">
            <StatsDashboard 
              stats={stats} 
              experiments={experiments}
              evaluationStatus={evaluationStatus}
              loading={refreshing}
              selectedGroup={selectedGroup}
              onGroupChange={setSelectedGroup}
              includeAnonymous={includeAnonymous}
            />
            <ProgressTracker 
              stats={stats}
              comparisonProgress={comparisonProgress}
              experiments={experiments}
              loading={refreshing}
            />
          </TabsContent>
          
          <TabsContent value="experiments">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  onClick={() => setShowCreateWizard(true)}
                  variant="default"
                >
                  Create Experiment (Manual)
                </Button>
                <Button 
                  onClick={() => setShowBulkWizard(true)}
                  variant="default"
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                  Create Bulk Experiment
                </Button>
              </div>
              <ExperimentTable 
                experiments={experiments}
                loading={refreshing}
                onCreateNew={() => setShowCreateWizard(true)}
                onRefresh={handleRefresh}
                onCreateProlificStudy={handleCreateProlificStudy}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="videos">
            <VideoLibraryManager
              uploadedVideos={uploadedVideos}
              selectedVideos={selectedVideos}
              onVideoSelect={handleVideoSelect}
              onSelectAll={handleSelectAllVideos}
              onClearSelection={handleClearSelection}
              onUpload={handleVideoUpload}
              onCopyUrls={handleCopySelectedUrls}
              onDeleteSelected={handleDeleteSelectedVideos}
              onRefresh={fetchVideoLibrary}
              onUpdateVideo={handleUpdateVideo}
              loading={refreshing}
            />
          </TabsContent>
          
          <TabsContent value="analytics" className="space-y-6">
            <EnhancedAnalyticsDashboard 
              loading={refreshing}
              selectedGroup={selectedGroup}
              onGroupChange={setSelectedGroup}
              experiments={experiments}
              onRefresh={fetchAllData}
              selectedExperiment={selectedExperiment}
              onExperimentChange={setSelectedExperiment}
              currentOrganization={currentOrganization}
            />
          </TabsContent>
          
          <TabsContent value="demographics">
            <DemographicsDashboard currentOrganization={currentOrganization} />
          </TabsContent>
          
          <TabsContent value="tools">
            <CLIToolsPanel 
              onCopyCommand={handleCopyCommand}
              copiedCommand={copiedCommand}
            />
          </TabsContent>
        </Tabs>

        {/* Create Experiment Wizard */}
        <CreateExperimentWizard
          open={showCreateWizard}
          onOpenChange={setShowCreateWizard}
          uploadedVideos={uploadedVideos.map(v => ({
            url: v.url,
            name: v.name,
            uploadedAt: v.uploadedAt,
            key: v.key,
            size: v.size
          }))}
          onRefresh={fetchAllData}
        />
        
        {/* Bulk Experiment Wizard */}
        <BulkExperimentWizard
          open={showBulkWizard}
          onOpenChange={setShowBulkWizard}
          uploadedVideos={uploadedVideos}
          onRefresh={fetchAllData}
        />

        {/* Prolific Dialog */}
        <ProlificDialog
          open={prolificDialogOpen}
          onOpenChange={setProlificDialogOpen}
          experiment={selectedExperimentForProlific}
          onSuccess={fetchAllData}
        />

        {/* Model Selection Dialog */}
        <ModelSelectionDialog
          open={showModelDialog}
          onOpenChange={(open) => {
            setShowModelDialog(open)
            if (!open) {
              setPendingFiles([])
            }
          }}
          files={pendingFiles}
          existingModels={existingModels}
          onConfirm={handleModelConfirm}
          loading={uploading}
        />
      </div>
    </div>
  )
}