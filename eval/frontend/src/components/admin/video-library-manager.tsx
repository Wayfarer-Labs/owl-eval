'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { VideoEditModal } from './video-edit-modal'
import { 
  Upload, 
  Search, 
  Grid3X3, 
  List, 
  Eye,
  Copy,
  Trash2,
  RefreshCw,
  Tag,
  Edit3,
  Filter,
  X,
  Plus,
  Wand2,
  Tags
} from 'lucide-react'

interface Video {
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

interface VideoLibraryManagerProps {
  uploadedVideos: Video[]
  selectedVideos: Set<string>
  onVideoSelect: (videoKey: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onCopyUrls: () => void
  onDeleteSelected: () => void
  onRefresh: () => void
  onUpdateVideo?: (videoId: string, updates: Partial<Video>) => void
  loading?: boolean
}

export function VideoLibraryManager({
  uploadedVideos,
  selectedVideos,
  onVideoSelect,
  onSelectAll,
  onClearSelection,
  onUpload,
  onCopyUrls,
  onDeleteSelected,
  onRefresh,
  onUpdateVideo,
  loading
}: VideoLibraryManagerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [editingVideo, setEditingVideo] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showBulkOperations, setShowBulkOperations] = useState(false)
  const [bulkTags, setBulkTags] = useState('')
  const [bulkGroups, setBulkGroups] = useState('')
  const [bulkModelName, setBulkModelName] = useState('')
  const [bulkScenarioId, setBulkScenarioId] = useState('')
  const [bulkOperation, setBulkOperation] = useState<'add' | 'replace' | 'remove'>('add')

  // Get all unique tags, groups, and models for filtering and suggestions
  const allTags = Array.from(new Set(uploadedVideos.flatMap(v => v.tags || [])))
  const allGroups = Array.from(new Set(uploadedVideos.flatMap(v => v.groups || [])))
  const availableModels = Array.from(new Set(uploadedVideos.filter(v => v.modelName).map(v => v.modelName!)))

  const filteredVideos = uploadedVideos
    .filter(video => {
      // Text search
      const matchesSearch = searchTerm === '' || 
        video.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        video.modelName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        video.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      
      // Tag filter
      const matchesTags = selectedTags.length === 0 || 
        selectedTags.some(tag => video.tags?.includes(tag))
      
      // Group filter
      const matchesGroups = selectedGroups.length === 0 || 
        selectedGroups.some(group => video.groups?.includes(group))
      
      return matchesSearch && matchesTags && matchesGroups
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'size':
          return b.size - a.size
        case 'date':
        default:
          return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      }
    })

  const copyVideoUrl = async (url: string, name: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast({
        title: 'Copied',
        description: `URL for ${name} copied to clipboard`,
      })
    } catch (err) {
      console.error('Failed to copy:', err)
      toast({
        title: 'Copy failed',
        description: 'Failed to copy URL to clipboard',
        variant: 'destructive'
      })
    }
  }

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const toggleGroup = (group: string) => {
    setSelectedGroups(prev => 
      prev.includes(group) 
        ? prev.filter(g => g !== group)
        : [...prev, group]
    )
  }

  const updateVideoTags = async (videoId: string, newTags: string[]) => {
    if (onUpdateVideo) {
      await onUpdateVideo(videoId, { tags: newTags })
    }
  }

  const updateVideoGroups = async (videoId: string, newGroups: string[]) => {
    if (onUpdateVideo) {
      await onUpdateVideo(videoId, { groups: newGroups })
    }
  }

  const handleBulkOperation = async () => {
    if (selectedVideos.size === 0) {
      toast({
        title: 'No videos selected',
        description: 'Please select videos to apply bulk operations',
        variant: 'destructive'
      })
      return
    }

    const selectedVideosList = uploadedVideos.filter(v => selectedVideos.has(v.key))
    const updates: Partial<Video> = {}

    // Process tags
    if (bulkTags.trim()) {
      const newTags = bulkTags.split(',').map(tag => tag.trim()).filter(Boolean)
      updates.tags = newTags
    }

    // Process groups
    if (bulkGroups.trim()) {
      const newGroups = bulkGroups.split(',').map(group => group.trim()).filter(Boolean)
      updates.groups = newGroups
    }

    // Process model name
    if (bulkModelName.trim()) {
      updates.modelName = bulkModelName.trim()
    }

    // Process scenario ID
    if (bulkScenarioId.trim()) {
      updates.scenarioId = bulkScenarioId.trim()
    }

    if (Object.keys(updates).length === 0) {
      toast({
        title: 'No changes specified',
        description: 'Please specify tags, groups, model name, or scenario to apply',
        variant: 'destructive'
      })
      return
    }

    try {
      // Apply updates to each selected video
      for (const video of selectedVideosList) {
        const finalUpdates: Partial<Video> = {}

        // Handle different operation types for tags and groups
        if (updates.tags) {
          switch (bulkOperation) {
            case 'add':
              finalUpdates.tags = Array.from(new Set([...(video.tags || []), ...updates.tags]))
              break
            case 'replace':
              finalUpdates.tags = updates.tags
              break
            case 'remove':
              finalUpdates.tags = (video.tags || []).filter(tag => !updates.tags!.includes(tag))
              break
          }
        }

        if (updates.groups) {
          switch (bulkOperation) {
            case 'add':
              finalUpdates.groups = Array.from(new Set([...(video.groups || []), ...updates.groups]))
              break
            case 'replace':
              finalUpdates.groups = updates.groups
              break
            case 'remove':
              finalUpdates.groups = (video.groups || []).filter(group => !updates.groups!.includes(group))
              break
          }
        }

        // Model name and scenario always replace
        if (updates.modelName) finalUpdates.modelName = updates.modelName
        if (updates.scenarioId) finalUpdates.scenarioId = updates.scenarioId

        if (onUpdateVideo) {
          await onUpdateVideo(video.id, finalUpdates)
        }
      }

      toast({
        title: 'Bulk operation completed',
        description: `Updated ${selectedVideos.size} video(s) successfully`,
      })

      // Clear form
      setBulkTags('')
      setBulkGroups('')
      setBulkModelName('')
      setBulkScenarioId('')
      setShowBulkOperations(false)

    } catch (error) {
      console.error('Bulk operation error:', error)
      toast({
        title: 'Bulk operation failed',
        description: 'Failed to update videos',
        variant: 'destructive'
      })
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-video bg-muted rounded animate-pulse"></div>
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
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Upload className="h-5 w-5" />
              Video Library
              <Badge variant="secondary" className="ml-2 bg-slate-700 text-slate-300 border-slate-600">
                {uploadedVideos.length}
              </Badge>
            </CardTitle>
            <CardDescription className="text-slate-300">
              Upload and manage videos for experiments
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} className="border-slate-600 text-slate-200 hover:bg-slate-700">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Section */}
        <div className="border-2 border-dashed border-slate-600/50 rounded-lg p-8 bg-slate-800/20 hover:bg-slate-800/30 transition-colors">
          <input
            type="file"
            accept="video/*"
            multiple
            onChange={onUpload}
            className="hidden"
            id="video-library-upload"
          />
          <label
            htmlFor="video-library-upload"
            className="cursor-pointer flex flex-col items-center"
          >
            <Upload className="h-12 w-12 text-slate-400 mb-4" />
            <p className="text-lg font-medium text-slate-200">Upload Videos</p>
            <p className="text-sm text-slate-300 mt-1">
              Click or drag videos here to upload to the library
            </p>
            <p className="text-xs text-slate-400 mt-2">
              Supports MP4, WebM, MOV and other video formats
            </p>
          </label>
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-2 flex-1">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search videos, models, tags..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date' | 'name' | 'size')}
                className="px-3 py-2 border border-slate-600 rounded-md text-sm bg-slate-700 text-slate-200 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
              >
                <option value="date">Sort by Date</option>
                <option value="name">Sort by Name</option>
                <option value="size">Sort by Size</option>
              </select>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="border-slate-600 text-slate-200 hover:bg-slate-700"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {(selectedTags.length > 0 || selectedGroups.length > 0) && (
                  <Badge variant="secondary" className="ml-2 px-1 py-0 text-xs">
                    {selectedTags.length + selectedGroups.length}
                  </Badge>
                )}
              </Button>
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="rounded-r-none"
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="rounded-l-none"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="bg-slate-800/30 border border-slate-600/50 rounded-lg p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tags Filter */}
                {allTags.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-200 mb-2 flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Filter by Tags
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {allTags.map(tag => (
                        <Button
                          key={tag}
                          variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => toggleTag(tag)}
                          className="text-xs"
                        >
                          {tag}
                          {selectedTags.includes(tag) && (
                            <X className="h-3 w-3 ml-1" />
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Groups Filter */}
                {allGroups.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-200 mb-2">Filter by Groups</h4>
                    <div className="flex flex-wrap gap-2">
                      {allGroups.map(group => (
                        <Button
                          key={group}
                          variant={selectedGroups.includes(group) ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => toggleGroup(group)}
                          className="text-xs"
                        >
                          {group}
                          {selectedGroups.includes(group) && (
                            <X className="h-3 w-3 ml-1" />
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {(selectedTags.length > 0 || selectedGroups.length > 0) && (
                <div className="pt-2 border-t border-slate-600/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedTags([])
                      setSelectedGroups([])
                    }}
                    className="text-slate-300 hover:text-slate-100"
                  >
                    Clear all filters
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selection Actions */}
        {uploadedVideos.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center justify-between p-3 bg-slate-800/30 border border-slate-600/50 rounded-lg">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={selectedVideos.size === uploadedVideos.length ? onClearSelection : onSelectAll}
                  className="border-slate-600 text-slate-200 hover:bg-slate-700"
                >
                  {selectedVideos.size === uploadedVideos.length ? 'Clear All' : 'Select All'}
                </Button>
                {selectedVideos.size > 0 && (
                  <Badge variant="secondary" className="px-2 py-1 bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
                    {selectedVideos.size} selected
                  </Badge>
                )}
              </div>
              {selectedVideos.size > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Button 
                    size="sm" 
                    onClick={() => setShowBulkOperations(!showBulkOperations)}
                    variant="outline"
                    className="border-blue-600 text-blue-300 hover:bg-blue-700"
                  >
                    <Wand2 className="h-4 w-4 mr-2" />
                    Bulk Edit ({selectedVideos.size})
                  </Button>
                  <Button size="sm" onClick={onCopyUrls} className="bg-slate-700 hover:bg-slate-600 text-slate-200">
                    <Copy className="h-4 w-4 mr-2" />
                    Copy URLs ({selectedVideos.size})
                  </Button>
                  <Button size="sm" variant="destructive" onClick={onDeleteSelected} className="bg-red-600 hover:bg-red-700 text-white">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete ({selectedVideos.size})
                  </Button>
                </div>
              )}
            </div>

            {/* Bulk Operations Panel */}
            {showBulkOperations && selectedVideos.size > 0 && (
              <div className="bg-blue-900/20 border border-blue-600/50 rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <Tags className="h-5 w-5 text-blue-400" />
                  <h4 className="font-medium text-blue-300">Bulk Edit {selectedVideos.size} Video(s)</h4>
                </div>

                {/* Operation Type */}
                <div className="space-y-2">
                  <Label className="text-sm text-blue-200">Operation Type (for tags and groups)</Label>
                  <div className="flex gap-2">
                    {[{id: 'add', label: 'Add'}, {id: 'replace', label: 'Replace'}, {id: 'remove', label: 'Remove'}].map(op => (
                      <Button
                        key={op.id}
                        variant={bulkOperation === op.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setBulkOperation(op.id as 'add' | 'replace' | 'remove')}
                        className="text-xs"
                      >
                        {op.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Tags */}
                  <div className="space-y-2">
                    <Label htmlFor="bulk-tags" className="text-sm text-blue-200">Tags (comma-separated)</Label>
                    <Input
                      id="bulk-tags"
                      placeholder="e.g., high-quality, demo, test"
                      value={bulkTags}
                      onChange={(e) => setBulkTags(e.target.value)}
                      className="bg-slate-800 border-slate-600 text-slate-200"
                    />
                  </div>

                  {/* Groups */}
                  <div className="space-y-2">
                    <Label htmlFor="bulk-groups" className="text-sm text-blue-200">Groups (comma-separated)</Label>
                    <Input
                      id="bulk-groups"
                      placeholder="e.g., batch-1, pilot-study"
                      value={bulkGroups}
                      onChange={(e) => setBulkGroups(e.target.value)}
                      className="bg-slate-800 border-slate-600 text-slate-200"
                    />
                  </div>

                  {/* Model Name */}
                  <div className="space-y-2">
                    <Label htmlFor="bulk-model" className="text-sm text-blue-200">Model Name (replace)</Label>
                    <Input
                      id="bulk-model"
                      placeholder="e.g., diamond-1b, genie-2b"
                      value={bulkModelName}
                      onChange={(e) => setBulkModelName(e.target.value)}
                      className="bg-slate-800 border-slate-600 text-slate-200"
                    />
                  </div>

                  {/* Scenario ID */}
                  <div className="space-y-2">
                    <Label htmlFor="bulk-scenario" className="text-sm text-blue-200">Scenario ID (replace)</Label>
                    <Input
                      id="bulk-scenario"
                      placeholder="e.g., simple_task, complex_reasoning"
                      value={bulkScenarioId}
                      onChange={(e) => setBulkScenarioId(e.target.value)}
                      className="bg-slate-800 border-slate-600 text-slate-200"
                    />
                  </div>
                </div>

                {/* Suggested Values */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Suggested Tags */}
                  {allTags.length > 0 && (
                    <div>
                      <Label className="text-xs text-blue-300 mb-1 block">Quick add tags:</Label>
                      <div className="flex flex-wrap gap-1">
                        {allTags.slice(0, 6).map(tag => (
                          <Button
                            key={tag}
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const currentTags = bulkTags ? bulkTags.split(',').map(t => t.trim()) : []
                              if (!currentTags.includes(tag)) {
                                setBulkTags(currentTags.length > 0 ? `${bulkTags}, ${tag}` : tag)
                              }
                            }}
                            className="text-xs h-6 px-2 text-blue-300 hover:bg-blue-800"
                          >
                            + {tag}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggested Models */}
                  {availableModels.length > 0 && (
                    <div>
                      <Label className="text-xs text-blue-300 mb-1 block">Available models:</Label>
                      <div className="flex flex-wrap gap-1">
                        {availableModels.slice(0, 6).map(model => (
                          <Button
                            key={model}
                            variant="ghost"
                            size="sm"
                            onClick={() => setBulkModelName(model)}
                            className="text-xs h-6 px-2 text-blue-300 hover:bg-blue-800"
                          >
                            {model}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2 border-t border-blue-600/30">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowBulkOperations(false)
                      setBulkTags('')
                      setBulkGroups('')
                      setBulkModelName('')
                      setBulkScenarioId('')
                    }}
                    className="border-slate-600 text-slate-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBulkOperation}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Apply to {selectedVideos.size} Video(s)
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Video Grid/List */}
        {filteredVideos.length > 0 ? (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVideos.map((video) => (
                <div
                  key={video.key}
                  className={`border rounded-lg overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                    selectedVideos.has(video.key) 
                      ? 'border-primary bg-primary/10 shadow-md' 
                      : 'border-border hover:border-muted-foreground'
                  }`}
                  onClick={() => onVideoSelect(video.key)}
                >
                  <div className="relative aspect-video bg-muted/30">
                    <video
                      ref={(el) => {
                        if (el) {
                          el.addEventListener('loadedmetadata', () => {
                            // Seek to 10% of the video duration, or 0.5 seconds, whichever is less
                            const seekTime = Math.min(el.duration * 0.1, 0.5);
                            if (!isNaN(seekTime) && seekTime > 0) {
                              el.currentTime = seekTime;
                            }
                          }, { once: true });
                        }
                      }}
                      src={`/api/video/${video.key}`}
                      className="w-full h-full object-cover"
                      preload="metadata"
                      crossOrigin="anonymous"
                      muted
                    />
                    <div className="absolute top-2 left-2">
                      <input
                        type="checkbox"
                        checked={selectedVideos.has(video.key)}
                        onChange={() => onVideoSelect(video.key)}
                        className="w-4 h-4"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                      {formatFileSize(video.size)}
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="font-medium truncate" title={video.name}>
                      {video.name}
                    </p>
                    {video.modelName && (
                      <p className="text-xs text-blue-400 mt-1">
                        Model: {video.modelName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(video.uploadedAt)}
                    </p>
                    
                    {/* Tags */}
                    {video.tags && video.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {video.tags.slice(0, 3).map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs px-1 py-0">
                            {tag}
                          </Badge>
                        ))}
                        {video.tags.length > 3 && (
                          <Badge variant="outline" className="text-xs px-1 py-0">
                            +{video.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                    
                    <div className="flex gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyVideoUrl(video.url, video.name)}
                        className="flex-1 text-xs"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(video.url, '_blank')}
                        className="flex-1 text-xs"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingVideo(video.id)}
                        className="px-2"
                      >
                        <Edit3 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredVideos.map((video) => (
                <div
                  key={video.key}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    selectedVideos.has(video.key) 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'hover:border-gray-400'
                  }`}
                  onClick={() => onVideoSelect(video.key)}
                >
                  <div className="flex items-center gap-4">
                    <input
                      type="checkbox"
                      checked={selectedVideos.has(video.key)}
                      onChange={() => onVideoSelect(video.key)}
                      className="w-4 h-4"
                      onClick={(e) => e.stopPropagation()}
                    />
                    
                    <div className="relative flex-shrink-0">
                      <video
                        ref={(el) => {
                          if (el) {
                            el.addEventListener('loadedmetadata', () => {
                              // Seek to 10% of the video duration, or 0.5 seconds, whichever is less
                              const seekTime = Math.min(el.duration * 0.1, 0.5);
                              if (!isNaN(seekTime) && seekTime > 0) {
                                el.currentTime = seekTime;
                              }
                            }, { once: true });
                          }
                        }}
                        src={`/api/video/${video.key}`}
                        className="w-24 h-16 object-cover rounded"
                        preload="metadata"
                        crossOrigin="anonymous"
                        muted
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" title={video.name}>
                        {video.name}
                      </p>
                      {video.modelName && (
                        <p className="text-sm text-blue-400">
                          Model: {video.modelName}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                        <span>{formatDate(video.uploadedAt)}</span>
                        <span>{formatFileSize(video.size)}</span>
                      </div>
                      
                      {/* Tags and Groups */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {video.tags?.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {video.groups?.map(group => (
                          <Badge key={group} variant="outline" className="text-xs">
                            {group}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyVideoUrl(video.url, video.name)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(video.url, '_blank')}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="text-center py-12 border border-dashed rounded-lg">
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No matching videos' : 'No videos uploaded yet'}
            </h3>
            <p className="text-gray-500 mb-4">
              {searchTerm 
                ? 'Try adjusting your search term'
                : 'Upload videos to build your library for experiments'
              }
            </p>
            {!searchTerm && (
              <label
                htmlFor="video-library-upload"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Videos
              </label>
            )}
          </div>
        )}
        
        {/* Video Edit Modal */}
        <VideoEditModal
          video={editingVideo ? uploadedVideos.find(v => v.id === editingVideo) || null : null}
          open={editingVideo !== null}
          onOpenChange={(open) => setEditingVideo(open ? editingVideo : null)}
          onSave={async (videoId, updates) => {
            if (onUpdateVideo) {
              await onUpdateVideo(videoId, updates)
            }
          }}
          allTags={allTags}
          allGroups={allGroups}
        />
      </CardContent>
    </Card>
  )
}