'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ScenarioSelector } from '@/components/scenario-selector'
import { toast } from '@/components/ui/use-toast'
import { showCreateSuccess, showOperationError } from '@/lib/utils/toast-utils'
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  X, 
  Play,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react'

interface CreateExperimentWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  uploadedVideos: Array<{
    url: string
    name: string
    uploadedAt: Date
    key: string
    size: number
    modelName?: string
  }>
  onRefresh?: () => void
}

interface Comparison {
  id: string
  scenarioId: string
  modelA?: string
  modelB?: string
  videoAUrl: string
  videoBUrl: string
  metadata: any
}

interface DemographicFilters {
  ageMin?: number
  ageMax?: number
  gender?: string[]
  country?: string[]
  language?: string[]
  approvalRate?: number
}

interface ExperimentData {
  name: string
  description: string
  slug: string
  group: string
  evaluationMode: 'comparison' | 'single_video'
  comparisons: Comparison[]
  demographics?: DemographicFilters
}

const getSteps = (evaluationMode: 'comparison' | 'single_video') => [
  { id: 'details', title: 'Experiment Details', description: 'Basic information about your experiment' },
  { 
    id: 'tasks', 
    title: evaluationMode === 'comparison' ? 'Add Comparisons' : 'Add Video Tasks', 
    description: evaluationMode === 'comparison' 
      ? 'Define model comparisons and scenarios' 
      : 'Define individual video evaluation tasks'
  },
  { id: 'demographics', title: 'Demographics', description: 'Target specific participant demographics for Prolific' },
  { id: 'review', title: 'Review & Create', description: 'Review your experiment before creation' }
]

export function CreateExperimentWizard({ 
  open, 
  onOpenChange, 
  uploadedVideos,
  onRefresh 
}: CreateExperimentWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isCreating, setIsCreating] = useState(false)
  const [experiment, setExperiment] = useState<ExperimentData>({
    name: '',
    description: '',
    slug: '',
    group: '',
    evaluationMode: 'comparison',
    comparisons: [],
    demographics: {
      ageMin: 18,
      ageMax: 65,
      gender: [],
      country: [],
      language: [],
      approvalRate: 95
    }
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      .substring(0, 50)
  }

  const validateStep = (step: number) => {
    const newErrors: Record<string, string> = {}
    
    switch (step) {
      case 0: // Details
        if (!experiment.name.trim()) {
          newErrors.name = 'Experiment name is required'
        }
        if (!experiment.slug.trim()) {
          newErrors.slug = 'Slug is required'
        }
        break
      case 1: // Comparisons or Video Tasks
        if (experiment.comparisons.length === 0) {
          newErrors.comparisons = experiment.evaluationMode === 'comparison' 
            ? 'At least one comparison is required'
            : 'At least one video task is required'
        }
        experiment.comparisons.forEach((comp, index) => {
          if (!comp.scenarioId) {
            newErrors[`comp-${index}-scenario`] = 'Scenario is required'
          }
          if (!comp.videoAUrl) {
            newErrors[`comp-${index}-videoA`] = 'Video is required'
          }
          
          // Only validate Model B and Video B for comparison mode
          if (experiment.evaluationMode === 'comparison') {
            if (!comp.videoBUrl) {
              newErrors[`comp-${index}-videoB`] = 'Video B is required'
            }
          }
        })
        break
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const nextStep = () => {
    if (validateStep(currentStep)) {
      const steps = getSteps(experiment.evaluationMode)
      setCurrentStep(prev => Math.min(prev + 1, steps.length - 1))
    }
  }

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0))
  }

  const addComparison = () => {
    const newComparison: Comparison = {
      id: `comp-${Date.now()}`,
      scenarioId: '',
      modelA: undefined,
      modelB: undefined,
      videoAUrl: '',
      videoBUrl: '',
      metadata: {}
    }
    setExperiment(prev => ({
      ...prev,
      comparisons: [...prev.comparisons, newComparison]
    }))
  }

  const findVideoByUrl = (url: string) => {
    return uploadedVideos.find(video => video.url === url)
  }

  const updateComparison = (id: string, field: keyof Comparison, value: string) => {
    setExperiment(prev => ({
      ...prev,
      comparisons: prev.comparisons.map(comp => {
        if (comp.id === id) {
          const updatedComp = { ...comp, [field]: value }
          
          // Auto-populate model name when video is selected
          if (field === 'videoAUrl' && value) {
            const video = findVideoByUrl(value)
            if (video?.modelName) {
              updatedComp.modelA = video.modelName
            }
          } else if (field === 'videoBUrl' && value) {
            const video = findVideoByUrl(value)
            if (video?.modelName) {
              updatedComp.modelB = video.modelName
            }
          }
          
          return updatedComp
        }
        return comp
      })
    }))
  }

  const removeComparison = (id: string) => {
    setExperiment(prev => ({
      ...prev,
      comparisons: prev.comparisons.filter(comp => comp.id !== id)
    }))
  }

  const createExperiment = async () => {
    if (!validateStep(currentStep)) return

    setIsCreating(true)
    
    try {
      const response = await fetch('/api/experiments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(experiment)
      })

      if (!response.ok) {
        throw new Error('Failed to create experiment')
      }

      const result = await response.json()
      
      showCreateSuccess('Experiment', experiment.name)

      // Reset form and close dialog
      setExperiment({
        name: '',
        description: '',
        slug: '',
        group: '',
        evaluationMode: 'comparison',
        comparisons: [],
        demographics: {
          ageMin: 18,
          ageMax: 65,
          gender: [],
          country: [],
          language: [],
          approvalRate: 95
        }
      })
      setCurrentStep(0)
      setErrors({})
      onOpenChange(false)
      
      if (onRefresh) {
        onRefresh()
      }
      
    } catch (error) {
      console.error('Create experiment error:', error)
      showOperationError('Create', 'experiment')
    } finally {
      setIsCreating(false)
    }
  }

  const getStepProgress = () => {
    const steps = getSteps(experiment.evaluationMode)
    return ((currentStep + 1) / steps.length) * 100
  }

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return experiment.name.trim() && experiment.slug.trim()
      case 1:
        return experiment.comparisons.length > 0 && 
               experiment.comparisons.every(comp => {
                 const baseFields = comp.scenarioId && comp.videoAUrl
                 if (experiment.evaluationMode === 'comparison') {
                   return baseFields && comp.videoBUrl
                 } else {
                   return baseFields
                 }
               })
      case 2:
        return true // Demographics step is optional
      case 3:
        return true
      default:
        return false
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Create New Experiment
            <Badge variant="outline" className="ml-2">
              Step {currentStep + 1} of {getSteps(experiment.evaluationMode).length}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {getSteps(experiment.evaluationMode)[currentStep].description}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            {getSteps(experiment.evaluationMode).map((step, index) => (
              <span 
                key={step.id}
                className={`font-medium ${
                  index <= currentStep ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {step.title}
              </span>
            ))}
          </div>
          <Progress value={getStepProgress()} className="h-2" />
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto py-6 px-1">
          {currentStep === 0 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="exp-name">
                    Experiment Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="exp-name"
                    placeholder="e.g., Winter 2025 Model Comparison"
                    value={experiment.name}
                    onChange={(e) => {
                      const name = e.target.value
                      setExperiment(prev => ({
                        ...prev,
                        name,
                        slug: prev.slug === generateSlug(prev.name) ? generateSlug(name) : prev.slug
                      }))
                    }}
                    className={errors.name ? 'border-red-500' : ''}
                  />
                  {errors.name && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.name}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exp-slug">
                    URL Slug <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="exp-slug"
                    placeholder="auto-generated from name"
                    value={experiment.slug}
                    onChange={(e) => setExperiment(prev => ({ ...prev, slug: e.target.value }))}
                    className={errors.slug ? 'border-red-500' : ''}
                  />
                  {errors.slug && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.slug}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    Used in URLs: /evaluate/{experiment.slug}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-group">Group (optional)</Label>
                <Input
                  id="exp-group"
                  placeholder="e.g., research-phase-1, pilot-study"
                  value={experiment.group}
                  onChange={(e) => setExperiment(prev => ({ ...prev, group: e.target.value }))}
                />
                <p className="text-xs text-gray-500">
                  Group experiments together for organization and filtering
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="evaluation-mode">
                  Evaluation Mode <span className="text-red-500">*</span>
                </Label>
                <select
                  id="evaluation-mode"
                  value={experiment.evaluationMode}
                  onChange={(e) => setExperiment(prev => ({ 
                    ...prev, 
                    evaluationMode: e.target.value as 'comparison' | 'single_video' 
                  }))}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="comparison">Comparison Mode (A vs B)</option>
                  <option value="single_video">Single Video Mode (Absolute Rating)</option>
                </select>
                <p className="text-xs text-gray-500">
                  {experiment.evaluationMode === 'comparison' 
                    ? 'Participants compare two videos side-by-side and choose which is better'
                    : 'Participants evaluate individual videos on absolute rating scales (1-5)'
                  }
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-description">Description</Label>
                <Textarea
                  id="exp-description"
                  placeholder="Describe what this experiment is testing..."
                  value={experiment.description}
                  onChange={(e) => setExperiment(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                />
              </div>
            </div>
          )}

          {currentStep === 1 && experiment.evaluationMode === 'comparison' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">
                  Comparisons ({experiment.comparisons.length})
                </h3>
                <Button onClick={addComparison} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Comparison
                </Button>
              </div>

              {errors.comparisons && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.comparisons}
                </p>
              )}

              {experiment.comparisons.length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                  <p className="text-muted-foreground mb-4">No comparisons yet</p>
                  <Button onClick={addComparison} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Comparison
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {experiment.comparisons.map((comparison, index) => (
                    <div key={comparison.id} className="border rounded-lg p-4 space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="font-medium">Comparison {index + 1}</h4>
                        <Button 
                          onClick={() => removeComparison(comparison.id)}
                          size="sm"
                          variant="outline"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Scenario <span className="text-red-500">*</span></Label>
                          <ScenarioSelector
                            value={comparison.scenarioId}
                            onChange={(value) => updateComparison(comparison.id, 'scenarioId', value)}
                            placeholder="Select or create scenario"
                          />
                          {errors[`comp-${index}-scenario`] && (
                            <p className="text-xs text-red-500">{errors[`comp-${index}-scenario`]}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Video A <span className="text-destructive">*</span></Label>
                          <select
                            value={comparison.videoAUrl}
                            onChange={(e) => updateComparison(comparison.id, 'videoAUrl', e.target.value)}
                            className={`w-full px-3 py-2 border rounded-md text-sm bg-background text-foreground ${
                              errors[`comp-${index}-videoA`] ? 'border-destructive' : 'border-border'
                            }`}
                          >
                            <option value="">Select Video A</option>
                            {uploadedVideos.map((video) => (
                              <option key={video.key} value={video.url}>
                                {video.name}
                              </option>
                            ))}
                          </select>
                          {errors[`comp-${index}-videoA`] && (
                            <p className="text-xs text-destructive">{errors[`comp-${index}-videoA`]}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Video B <span className="text-destructive">*</span></Label>
                          <select
                            value={comparison.videoBUrl}
                            onChange={(e) => updateComparison(comparison.id, 'videoBUrl', e.target.value)}
                            className={`w-full px-3 py-2 border rounded-md text-sm bg-background text-foreground ${
                              errors[`comp-${index}-videoB`] ? 'border-destructive' : 'border-border'
                            }`}
                          >
                            <option value="">Select Video B</option>
                            {uploadedVideos.map((video) => (
                              <option key={video.key} value={video.url}>
                                {video.name}
                              </option>
                            ))}
                          </select>
                          {errors[`comp-${index}-videoB`] && (
                            <p className="text-xs text-red-500">{errors[`comp-${index}-videoB`]}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentStep === 1 && experiment.evaluationMode === 'single_video' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">
                  Video Tasks ({experiment.comparisons.length})
                </h3>
                <Button onClick={addComparison} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Video Task
                </Button>
              </div>

              {errors.comparisons && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.comparisons}
                </p>
              )}

              {experiment.comparisons.length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                  <p className="text-muted-foreground mb-4">No video tasks yet</p>
                  <Button onClick={addComparison} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Video Task
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {experiment.comparisons.map((task, index) => (
                    <div key={task.id} className="border rounded-lg p-4 space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="font-medium">Video Task {index + 1}</h4>
                        <Button 
                          onClick={() => removeComparison(task.id)}
                          size="sm"
                          variant="outline"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Scenario <span className="text-red-500">*</span></Label>
                          <ScenarioSelector
                            value={task.scenarioId}
                            onChange={(value) => updateComparison(task.id, 'scenarioId', value)}
                            placeholder="Select or create scenario"
                          />
                          {errors[`comp-${index}-scenario`] && (
                            <p className="text-xs text-red-500">{errors[`comp-${index}-scenario`]}</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Video <span className="text-destructive">*</span></Label>
                        <select
                          value={task.videoAUrl}
                          onChange={(e) => updateComparison(task.id, 'videoAUrl', e.target.value)}
                          className={`w-full px-3 py-2 border rounded-md text-sm bg-background text-foreground ${
                            errors[`comp-${index}-videoA`] ? 'border-destructive' : 'border-border'
                          }`}
                        >
                          <option value="">Select video to evaluate</option>
                          {uploadedVideos.map((video) => (
                            <option key={video.key} value={video.url}>
                              {video.name}
                            </option>
                          ))}
                        </select>
                        {errors[`comp-${index}-videoA`] && (
                          <p className="text-xs text-destructive">{errors[`comp-${index}-videoA`]}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}


          {/* Demographics Step */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-4">Target Demographics</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Define demographic filters for Prolific participant recruitment. Leave fields empty to not filter on that demographic.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Age Range */}
                  <div className="space-y-4">
                    <Label>Age Range</Label>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <Label htmlFor="age-min" className="text-xs text-muted-foreground">Min Age</Label>
                        <Input
                          id="age-min"
                          type="number"
                          placeholder="18"
                          min="18"
                          max="100"
                          value={experiment.demographics?.ageMin || ''}
                          onChange={(e) => setExperiment(prev => ({
                            ...prev,
                            demographics: {
                              ...prev.demographics,
                              ageMin: e.target.value ? parseInt(e.target.value) : undefined
                            }
                          }))}
                        />
                      </div>
                      <span className="text-muted-foreground">to</span>
                      <div className="flex-1">
                        <Label htmlFor="age-max" className="text-xs text-muted-foreground">Max Age</Label>
                        <Input
                          id="age-max"
                          type="number"
                          placeholder="65"
                          min="18"
                          max="100"
                          value={experiment.demographics?.ageMax || ''}
                          onChange={(e) => setExperiment(prev => ({
                            ...prev,
                            demographics: {
                              ...prev.demographics,
                              ageMax: e.target.value ? parseInt(e.target.value) : undefined
                            }
                          }))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Gender */}
                  <div className="space-y-4">
                    <Label>Gender</Label>
                    <div className="space-y-2">
                      {['Male', 'Female', 'Non-binary'].map((gender) => (
                        <div key={gender} className="flex items-center space-x-2">
                          <Checkbox
                            id={`gender-${gender.toLowerCase()}`}
                            checked={experiment.demographics?.gender?.includes(gender) || false}
                            onCheckedChange={(checked) => {
                              const currentGenders = experiment.demographics?.gender || []
                              const newGenders = checked
                                ? [...currentGenders, gender]
                                : currentGenders.filter(g => g !== gender)
                              setExperiment(prev => ({
                                ...prev,
                                demographics: {
                                  ...prev.demographics,
                                  gender: newGenders
                                }
                              }))
                            }}
                          />
                          <Label htmlFor={`gender-${gender.toLowerCase()}`} className="text-sm">
                            {gender}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Countries */}
                  <div className="space-y-4">
                    <Label>Countries</Label>
                    <div className="space-y-2">
                      {['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Netherlands', 'Spain'].map((country) => (
                        <div key={country} className="flex items-center space-x-2">
                          <Checkbox
                            id={`country-${country.toLowerCase().replace(/\s+/g, '-')}`}
                            checked={experiment.demographics?.country?.includes(country) || false}
                            onCheckedChange={(checked) => {
                              const currentCountries = experiment.demographics?.country || []
                              const newCountries = checked
                                ? [...currentCountries, country]
                                : currentCountries.filter(c => c !== country)
                              setExperiment(prev => ({
                                ...prev,
                                demographics: {
                                  ...prev.demographics,
                                  country: newCountries
                                }
                              }))
                            }}
                          />
                          <Label htmlFor={`country-${country.toLowerCase().replace(/\s+/g, '-')}`} className="text-sm">
                            {country}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Approval Rate */}
                  <div className="space-y-4">
                    <Label htmlFor="approval-rate">Minimum Approval Rate</Label>
                    <Input
                      id="approval-rate"
                      type="number"
                      placeholder="95"
                      min="0"
                      max="100"
                      value={experiment.demographics?.approvalRate || ''}
                      onChange={(e) => setExperiment(prev => ({
                        ...prev,
                        demographics: {
                          ...prev.demographics,
                          approvalRate: e.target.value ? parseInt(e.target.value) : undefined
                        }
                      }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Participants must have this approval rate or higher (0-100%)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Review Step */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-4">Review & Create</h3>
                <div className="space-y-4">
                  <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                    <h4 className="font-medium">Experiment Details</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Name:</span>
                        <p className="font-medium">{experiment.name}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Mode:</span>
                        <p className="font-medium">
                          {experiment.evaluationMode === 'comparison' ? 'Comparison' : 'Single Video'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Group:</span>
                        <p className="font-medium">{experiment.group || 'None'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tasks:</span>
                        <p className="font-medium">{experiment.comparisons.length}</p>
                      </div>
                    </div>
                  </div>

                  {/* Demographics Summary */}
                  {experiment.demographics && (
                    <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                      <h4 className="font-medium">Demographics Targeting</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Age Range:</span>
                          <p className="font-medium">
                            {experiment.demographics.ageMin || 'Any'} - {experiment.demographics.ageMax || 'Any'}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Gender:</span>
                          <p className="font-medium">
                            {experiment.demographics.gender?.length ? experiment.demographics.gender.join(', ') : 'Any'}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Countries:</span>
                          <p className="font-medium">
                            {experiment.demographics.country?.length ? experiment.demographics.country.join(', ') : 'Any'}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Min Approval Rate:</span>
                          <p className="font-medium">{experiment.demographics.approvalRate || 95}%</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {experiment.comparisons.map((comp, index) => (
                      <div key={comp.id} className="bg-muted/30 rounded-lg p-3">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              {experiment.evaluationMode === 'comparison' 
                                ? `${comp.modelA || 'Video A'} vs ${comp.modelB || 'Video B'}`
                                : `${comp.modelA || 'Video'} - Single Video Task`
                              }
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Scenario: {comp.scenarioId}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            #{index + 1}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={currentStep === 0 ? () => onOpenChange(false) : prevStep}
          >
            {currentStep === 0 ? (
              'Cancel'
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Previous
              </>
            )}
          </Button>
          
          {currentStep < getSteps(experiment.evaluationMode).length - 1 ? (
            <Button 
              onClick={nextStep}
              disabled={!canProceed()}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button 
              onClick={createExperiment}
              disabled={isCreating || !canProceed()}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Create Experiment
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}