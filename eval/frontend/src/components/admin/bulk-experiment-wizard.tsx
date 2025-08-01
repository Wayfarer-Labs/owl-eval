'use client'

import React, { useState } from 'react'
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
import { ScenarioSelector } from '@/components/scenario-selector'
import { toast } from '@/components/ui/use-toast'
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  X, 
  Play,
  CheckCircle,
  AlertCircle,
  Loader2,
  Grid3X3,
  Shuffle,
  Target,
  Zap
} from 'lucide-react'

interface Video {
  id: string
  key: string
  name: string
  url: string
  size: number
  tags: string[]
  groups: string[]
  modelName?: string
  scenarioId?: string
  uploadedAt: Date
}

interface BulkExperimentWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  uploadedVideos: Video[]
  onRefresh?: () => void
}

interface ModelSet {
  id: string
  name: string
  models: string[]
}

interface ComparisonMatrix {
  scenarios: string[]
  models: string[]
  videoAssignment: 'auto' | 'manual' | 'random'
  randomization: {
    orderRandomization: boolean
    modelPositionRandomization: boolean
    seed?: number
  }
}

interface ExperimentData {
  name: string
  description: string
  slug: string
  group: string
  mode: 'matrix' | 'manual' | 'template'
  matrix?: ComparisonMatrix
  totalComparisons: number
}

const STEPS = [
  { id: 'details', title: 'Experiment Details', description: 'Basic information and creation mode' },
  { id: 'matrix', title: 'Comparison Matrix', description: 'Define models, scenarios, and assignment rules' },
  { id: 'randomization', title: 'Randomization', description: 'Configure randomization and presentation options' },
  { id: 'review', title: 'Review & Create', description: 'Review your experiment before creation' }
]

const PREDEFINED_MODEL_SETS: ModelSet[] = [
  {
    id: 'basic-comparison',
    name: 'Basic Model Comparison',
    models: ['diamond-1b', 'genie-2b', 'baseline']
  },
  {
    id: 'size-comparison',
    name: 'Model Size Comparison', 
    models: ['model-1b', 'model-2b', 'model-4b', 'model-8b']
  },
  {
    id: 'generation-comparison',
    name: 'Generation Comparison',
    models: ['gen-1', 'gen-2', 'gen-3']
  }
]

export function BulkExperimentWizard({ 
  open, 
  onOpenChange, 
  uploadedVideos,
  onRefresh 
}: BulkExperimentWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isCreating, setIsCreating] = useState(false)
  const [experiment, setExperiment] = useState<ExperimentData>({
    name: '',
    description: '',
    slug: '',
    group: '',
    mode: 'matrix',
    totalComparisons: 0
  })
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([])
  const [videoAssignment, setVideoAssignment] = useState<'auto' | 'manual' | 'random'>('auto')
  const [randomizationOptions, setRandomizationOptions] = useState({
    orderRandomization: true,
    modelPositionRandomization: true,
    seed: undefined as number | undefined
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Auto-discover unique models and scenarios from video library
  const availableModels = Array.from(new Set(
    uploadedVideos
      .filter(v => v.modelName)
      .map(v => v.modelName!)
  ))
  
  // Auto-select all available models when they change
  React.useEffect(() => {
    if (availableModels.length > 0 && selectedModels.length === 0) {
      setSelectedModels(availableModels)
    }
  }, [availableModels.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  
  const availableScenarios = Array.from(new Set(
    uploadedVideos
      .filter(v => v.scenarioId)
      .map(v => v.scenarioId!)
  ))

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      .substring(0, 50)
  }

  const calculateTotalComparisons = () => {
    if (experiment.mode === 'matrix') {
      // For each scenario, create comparisons between all model pairs
      const modelPairs = selectedModels.length >= 2 ? 
        (selectedModels.length * (selectedModels.length - 1)) / 2 : 0
      return selectedScenarios.length * modelPairs
    }
    return 0
  }

  const updateTotalComparisons = () => {
    const total = calculateTotalComparisons()
    setExperiment(prev => ({ ...prev, totalComparisons: total }))
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
      case 1: // Matrix
        if (selectedModels.length < 2) {
          newErrors.models = 'At least 2 models are required for comparisons'
        }
        if (selectedScenarios.length === 0) {
          newErrors.scenarios = 'At least 1 scenario is required'
        }
        // Check if we have videos for all model-scenario combinations
        if (videoAssignment === 'auto') {
          const missingCombinations = []
          for (const model of selectedModels) {
            for (const scenario of selectedScenarios) {
              const hasVideo = uploadedVideos.some(v => 
                v.modelName === model && v.scenarioId === scenario
              )
              if (!hasVideo) {
                missingCombinations.push(`${model} + ${scenario}`)
              }
            }
          }
          if (missingCombinations.length > 0) {
            newErrors.videoAssignment = `Missing videos for: ${missingCombinations.slice(0, 3).join(', ')}${missingCombinations.length > 3 ? ` and ${missingCombinations.length - 3} more` : ''}`
          }
        }
        break
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const nextStep = () => {
    if (validateStep(currentStep)) {
      updateTotalComparisons()
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1))
    }
  }

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0))
  }

  const addModel = (model: string) => {
    if (!selectedModels.includes(model)) {
      setSelectedModels(prev => [...prev, model])
    }
  }

  const removeModel = (model: string) => {
    setSelectedModels(prev => prev.filter(m => m !== model))
  }

  const addScenario = (scenario: string) => {
    if (!selectedScenarios.includes(scenario)) {
      setSelectedScenarios(prev => [...prev, scenario])
    }
  }

  const removeScenario = (scenario: string) => {
    setSelectedScenarios(prev => prev.filter(s => s !== scenario))
  }

  const loadModelSet = (modelSet: ModelSet) => {
    setSelectedModels(modelSet.models)
  }

  const createExperiment = async () => {
    if (!validateStep(currentStep)) return

    setIsCreating(true)
    
    try {
      const matrixConfig: ComparisonMatrix = {
        scenarios: selectedScenarios,
        models: selectedModels,
        videoAssignment,
        randomization: randomizationOptions
      }

      const experimentData = {
        ...experiment,
        matrix: matrixConfig
      }

      const response = await fetch('/api/experiments/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(experimentData)
      })

      if (!response.ok) {
        throw new Error('Failed to create experiment')
      }

      const result = await response.json()
      
      toast({
        title: 'Experiment created',
        description: `Experiment "${experiment.name}" created with ${experiment.totalComparisons} comparisons`,
      })

      // Reset form and close dialog
      setExperiment({
        name: '',
        description: '',
        slug: '',
        group: '',
        mode: 'matrix',
        totalComparisons: 0
      })
      setSelectedModels([])
      setSelectedScenarios([])
      setCurrentStep(0)
      setErrors({})
      onOpenChange(false)
      
      if (onRefresh) {
        onRefresh()
      }
      
    } catch (error) {
      console.error('Create experiment error:', error)
      toast({
        title: 'Creation failed',
        description: 'Failed to create experiment',
        variant: 'destructive'
      })
    } finally {
      setIsCreating(false)
    }
  }

  const getStepProgress = () => {
    return ((currentStep + 1) / STEPS.length) * 100
  }

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return experiment.name.trim() && experiment.slug.trim()
      case 1:
        return selectedModels.length >= 2 && selectedScenarios.length > 0
      case 2:
        return true
      case 3:
        return true
      default:
        return false
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Bulk Experiment Creation
            <Badge variant="outline" className="ml-2">
              Step {currentStep + 1} of {STEPS.length}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {STEPS[currentStep].description}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            {STEPS.map((step, index) => (
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

              {/* Creation Mode */}
              <div className="space-y-3">
                <Label>Creation Mode</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div 
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                      experiment.mode === 'matrix' ? 'border-primary bg-primary/10' : 'border-border'
                    }`}
                    onClick={() => setExperiment(prev => ({ ...prev, mode: 'matrix' }))}
                  >
                    <Grid3X3 className="h-6 w-6 mb-2 text-primary" />
                    <h3 className="font-medium">Matrix Mode</h3>
                    <p className="text-sm text-muted-foreground">
                      Generate all possible comparisons between selected models and scenarios
                    </p>
                  </div>
                  <div className="border-2 border-border rounded-lg p-4 opacity-50">
                    <Target className="h-6 w-6 mb-2 text-muted-foreground" />
                    <h3 className="font-medium text-muted-foreground">Template Mode</h3>
                    <p className="text-sm text-muted-foreground">
                      Use predefined experiment templates (Coming Soon)
                    </p>
                  </div>
                  <div className="border-2 border-border rounded-lg p-4 opacity-50">
                    <Plus className="h-6 w-6 mb-2 text-muted-foreground" />
                    <h3 className="font-medium text-muted-foreground">Manual Mode</h3>
                    <p className="text-sm text-muted-foreground">
                      Add comparisons one by one (use original wizard)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-6">
              {/* Model Selection */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">Models (Auto-Discovered)</h3>
                  <Badge variant="outline">
                    {selectedModels.length} selected
                  </Badge>
                </div>
                {availableModels.length === 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm text-yellow-800">
                      No videos with model names found. Upload videos with model names first.
                    </p>
                  </div>
                )}
                {availableModels.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm text-green-800">
                      ✓ Auto-discovered {availableModels.length} models from uploaded videos. All models are pre-selected.
                    </p>
                  </div>
                )}

                {errors.models && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.models}
                  </p>
                )}

                {/* Predefined Model Sets */}
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">Quick Start:</Label>
                  <div className="flex flex-wrap gap-2">
                    {PREDEFINED_MODEL_SETS.map(modelSet => (
                      <Button
                        key={modelSet.id}
                        variant="outline"
                        size="sm"
                        onClick={() => loadModelSet(modelSet)}
                        className="text-xs"
                      >
                        {modelSet.name}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Available Models from Video Library */}
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">Available Models (from video library):</Label>
                  <div className="flex flex-wrap gap-2">
                    {availableModels.map(model => (
                      <Button
                        key={model}
                        variant={selectedModels.includes(model) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          if (selectedModels.includes(model)) {
                            removeModel(model)
                          } else {
                            addModel(model)
                          }
                        }}
                        className="text-sm"
                      >
                        {model}
                        {selectedModels.includes(model) && (
                          <X className="h-3 w-3 ml-1" />
                        )}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Custom Model Input */}
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">Add Custom Model:</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter model name..."
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          const value = (e.target as HTMLInputElement).value.trim()
                          if (value) {
                            addModel(value);
                            (e.target as HTMLInputElement).value = ''
                          }
                        }
                      }}
                      className="flex-1"
                    />
                  </div>
                </div>

                {/* Selected Models */}
                {selectedModels.length > 0 && (
                  <div>
                    <Label className="text-sm text-muted-foreground mb-2 block">Selected Models:</Label>
                    <div className="flex flex-wrap gap-2">
                      {selectedModels.map(model => (
                        <Badge key={model} variant="secondary" className="pr-1">
                          {model}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-0 ml-1 hover:bg-transparent"
                            onClick={() => removeModel(model)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Scenario Selection */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">Select Scenarios</h3>
                  <Badge variant="outline">
                    {selectedScenarios.length} selected
                  </Badge>
                </div>

                {errors.scenarios && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.scenarios}
                  </p>
                )}

                {/* Available Scenarios from Video Library */}
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">Available Scenarios (from video library):</Label>
                  <div className="flex flex-wrap gap-2">
                    {availableScenarios.map(scenario => (
                      <Button
                        key={scenario}
                        variant={selectedScenarios.includes(scenario) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          if (selectedScenarios.includes(scenario)) {
                            removeScenario(scenario)
                          } else {
                            addScenario(scenario)
                          }
                        }}
                        className="text-sm"
                      >
                        {scenario}
                        {selectedScenarios.includes(scenario) && (
                          <X className="h-3 w-3 ml-1" />
                        )}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Scenario Selector for Custom Scenarios */}
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">Add Custom Scenario:</Label>
                  <ScenarioSelector
                    value=""
                    onChange={(scenarioId) => {
                      if (scenarioId) {
                        addScenario(scenarioId)
                      }
                    }}
                    placeholder="Select or create scenario"
                  />
                </div>

                {/* Selected Scenarios */}
                {selectedScenarios.length > 0 && (
                  <div>
                    <Label className="text-sm text-muted-foreground mb-2 block">Selected Scenarios:</Label>
                    <div className="flex flex-wrap gap-2">
                      {selectedScenarios.map(scenario => (
                        <Badge key={scenario} variant="secondary" className="pr-1">
                          {scenario}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-0 ml-1 hover:bg-transparent"
                            onClick={() => removeScenario(scenario)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Video Assignment Strategy */}
              <div className="space-y-3">
                <h3 className="font-semibold">Video Assignment Strategy</h3>
                
                {errors.videoAssignment && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.videoAssignment}
                  </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div 
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                      videoAssignment === 'auto' ? 'border-primary bg-primary/10' : 'border-border'
                    }`}
                    onClick={() => setVideoAssignment('auto')}
                  >
                    <Target className="h-5 w-5 mb-2 text-primary" />
                    <h4 className="font-medium">Auto Assignment</h4>
                    <p className="text-sm text-muted-foreground">
                      Automatically match videos based on model name and scenario tags
                    </p>
                  </div>
                  <div 
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                      videoAssignment === 'random' ? 'border-primary bg-primary/10' : 'border-border'
                    }`}
                    onClick={() => setVideoAssignment('random')}
                  >
                    <Shuffle className="h-5 w-5 mb-2 text-primary" />
                    <h4 className="font-medium">Random Assignment</h4>
                    <p className="text-sm text-muted-foreground">
                      Randomly assign videos from tagged groups
                    </p>
                  </div>
                  <div className="border-2 border-border rounded-lg p-4 opacity-50">
                    <Plus className="h-5 w-5 mb-2 text-muted-foreground" />
                    <h4 className="font-medium text-muted-foreground">Manual Assignment</h4>
                    <p className="text-sm text-muted-foreground">
                      Manually select videos for each comparison (Coming Soon)
                    </p>
                  </div>
                </div>
              </div>

              {/* Matrix Preview */}
              {selectedModels.length >= 2 && selectedScenarios.length > 0 && (
                <div className="bg-muted/30 rounded-lg p-4">
                  <h4 className="font-medium mb-2">Comparison Matrix Preview</h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Models:</strong> {selectedModels.length} ({selectedModels.join(', ')})</p>
                    <p><strong>Scenarios:</strong> {selectedScenarios.length} ({selectedScenarios.join(', ')})</p>
                    <p><strong>Total Comparisons:</strong> {calculateTotalComparisons()}</p>
                    <p className="text-xs mt-2">
                      Each scenario will have {selectedModels.length >= 2 ? (selectedModels.length * (selectedModels.length - 1)) / 2 : 0} model-vs-model comparisons
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <h3 className="font-semibold">Randomization Options</h3>
              
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    id="order-randomization"
                    checked={randomizationOptions.orderRandomization}
                    onChange={(e) => setRandomizationOptions(prev => ({
                      ...prev,
                      orderRandomization: e.target.checked
                    }))}
                    className="mt-1"
                  />
                  <div>
                    <Label htmlFor="order-randomization" className="font-medium">
                      Randomize Comparison Order
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Present comparisons in random order to each participant
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    id="position-randomization"
                    checked={randomizationOptions.modelPositionRandomization}
                    onChange={(e) => setRandomizationOptions(prev => ({
                      ...prev,
                      modelPositionRandomization: e.target.checked
                    }))}
                    className="mt-1"
                  />
                  <div>
                    <Label htmlFor="position-randomization" className="font-medium">
                      Randomize Model Positions
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Randomly assign which model appears as &ldquo;A&rdquo; vs &ldquo;B&rdquo; in each comparison
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="random-seed">Random Seed (optional)</Label>
                  <Input
                    id="random-seed"
                    type="number"
                    placeholder="Leave empty for random seed"
                    value={randomizationOptions.seed || ''}
                    onChange={(e) => setRandomizationOptions(prev => ({
                      ...prev,
                      seed: e.target.value ? parseInt(e.target.value) : undefined
                    }))}
                    className="max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use a fixed seed for reproducible randomization
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Randomization Impact</h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <p>✓ Reduces bias from order effects and position preferences</p>
                  <p>✓ Ensures balanced evaluation across all model pairs</p>
                  <p>✓ Improves statistical validity of results</p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h3 className="font-semibold text-green-900">Ready to Create</h3>
                </div>
                <p className="text-sm text-green-800">
                  Your bulk experiment is configured and ready to be created.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Experiment Details</h4>
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Name:</span>
                      <span className="text-sm font-medium">{experiment.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Slug:</span>
                      <code className="text-sm bg-muted px-1 rounded">{experiment.slug}</code>
                    </div>
                    {experiment.group && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Group:</span>
                        <span className="text-sm font-medium">{experiment.group}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Comparison Matrix</h4>
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Models:</span>
                      <span className="text-sm font-medium">{selectedModels.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Scenarios:</span>
                      <span className="text-sm font-medium">{selectedScenarios.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Total Comparisons:</span>
                      <span className="text-sm font-medium text-primary">{calculateTotalComparisons()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Video Assignment:</span>
                      <span className="text-sm font-medium capitalize">{videoAssignment}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Randomization</h4>
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Order Randomization:</span>
                      <span className="text-sm font-medium">
                        {randomizationOptions.orderRandomization ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Position Randomization:</span>
                      <span className="text-sm font-medium">
                        {randomizationOptions.modelPositionRandomization ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    {randomizationOptions.seed && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Seed:</span>
                        <span className="text-sm font-medium">{randomizationOptions.seed}</span>
                      </div>
                    )}
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
          
          {currentStep < STEPS.length - 1 ? (
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
                  Create Experiment ({calculateTotalComparisons()} comparisons)
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}