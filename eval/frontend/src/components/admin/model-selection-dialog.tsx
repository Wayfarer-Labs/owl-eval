'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Upload, Plus, Video } from 'lucide-react'

interface ModelSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  files: File[]
  existingModels: string[]
  onConfirm: (modelName: string) => void
  loading?: boolean
}

export function ModelSelectionDialog({
  open,
  onOpenChange,
  files,
  existingModels,
  onConfirm,
  loading = false
}: ModelSelectionDialogProps) {
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [newModelName, setNewModelName] = useState<string>('')
  const [isCreatingNew, setIsCreatingNew] = useState(false)

  const handleConfirm = () => {
    const modelName = isCreatingNew ? newModelName.trim() : selectedModel
    if (modelName) {
      onConfirm(modelName)
    }
  }

  const handleClose = () => {
    setSelectedModel('')
    setNewModelName('')
    setIsCreatingNew(false)
    onOpenChange(false)
  }

  const canConfirm = isCreatingNew ? newModelName.trim().length > 0 : selectedModel.length > 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Confirm Model Assignment
          </DialogTitle>
          <DialogDescription>
            These videos will be associated with a model. Select an existing model or create a new one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Preview */}
          <div className="border rounded-lg p-3 bg-slate-50">
            <div className="flex items-center gap-2 mb-2">
              <Video className="h-4 w-4 text-slate-600" />
              <span className="text-sm font-medium text-slate-700">
                Files to upload ({files.length})
              </span>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between text-xs text-slate-600">
                  <span className="truncate flex-1">{file.name}</span>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {(file.size / (1024 * 1024)).toFixed(1)}MB
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Model Assignment</Label>
            
            {!isCreatingNew ? (
              <div className="space-y-2">
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select existing model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {existingModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {existingModels.length === 0 && (
                  <p className="text-xs text-slate-500">No existing models found</p>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreatingNew(true)}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Model
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Enter new model name..."
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canConfirm && !loading) {
                      handleConfirm()
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsCreatingNew(false)
                    setNewModelName('')
                  }}
                  className="w-full"
                >
                  Back to Existing Models
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!canConfirm || loading}
            className="min-w-[100px]"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Uploading...
              </div>
            ) : (
              `Upload ${files.length} Video${files.length > 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}