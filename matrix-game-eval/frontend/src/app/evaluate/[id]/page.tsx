'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Loader2, Play, Pause } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

interface Comparison {
  comparison_id: string
  scenario_id: string
  scenario_metadata: {
    name: string
    description: string
  }
  model_a_video_path: string
  model_b_video_path: string
  randomized_labels: {
    A: string
    B: string
  }
}

interface DimensionInfo {
  name: string
  prompt: string
  description: string
  sub_questions?: string[]
}

const dimensions = [
  'overall_quality',
  'controllability', 
  'visual_quality',
  'temporal_consistency'
]

const dimensionInfo: Record<string, DimensionInfo> = {
  overall_quality: {
    name: 'Overall Quality',
    prompt: 'Which video has better overall quality?',
    description: 'Consider the overall impression of the generated videos, including: General realism and believability, Coherence of the game world, Completeness of actions and movements, How well it looks like actual Minecraft gameplay',
    sub_questions: [
      'Which video looks more like real Minecraft gameplay?',
      'Which video maintains a more coherent game world?',
      'Which video shows more complete and natural movements?'
    ]
  },
  controllability: {
    name: 'Controllability',
    prompt: 'Which video better follows the control inputs?',
    description: 'Evaluate how accurately the character responds to control inputs: Does the character move in the intended direction? Are jumps and attacks executed when commanded? Does the camera rotate smoothly according to mouse movements? Are the responses timely and accurate?',
    sub_questions: [
      'Which video shows more accurate character movement?',
      'Which video has better camera control?',
      'Which video responds more accurately to action commands?'
    ]
  },
  visual_quality: {
    name: 'Visual Quality',
    prompt: 'Which video has better visual quality?',
    description: 'Focus on the visual aspects of individual frames: Image clarity and sharpness, Texture quality and detail, Lighting and color consistency, Absence of visual artifacts or glitches',
    sub_questions: [
      'Which video has clearer and sharper visuals?',
      'Which video shows better texture quality?',
      'Which video has fewer visual artifacts?'
    ]
  },
  temporal_consistency: {
    name: 'Temporal Consistency',
    prompt: 'Which video has better temporal consistency?',
    description: 'Evaluate the consistency across time: Smooth transitions between frames, Stable object appearance over time, Consistent physics and motion, No flickering or sudden changes',
    sub_questions: [
      'Which video has smoother motion?',
      'Which video maintains more stable object appearance?',
      'Which video shows more consistent physics?'
    ]
  }
}

export default function EvaluatePage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [startTime] = useState(Date.now())
  
  const videoARef = useRef<HTMLVideoElement>(null)
  const videoBRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  const fetchComparison = useCallback(async () => {
    try {
      // In a real app, this would fetch from your API
      // For now, we'll create mock data
      const mockComparison: Comparison = {
        comparison_id: params.id as string,
        scenario_id: 'forest_navigation',
        scenario_metadata: {
          name: 'Forest Navigation',
          description: 'Navigate through a forest environment with obstacles'
        },
        model_a_video_path: '/videos/model_a.mp4',
        model_b_video_path: '/videos/model_b.mp4',
        randomized_labels: {
          A: 'matrix_game',
          B: 'baseline'
        }
      }
      setComparison(mockComparison)
    } catch (error) {
      console.error('Error fetching comparison:', error)
      toast({
        title: 'Error',
        description: 'Failed to load comparison',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }, [params.id, toast])

  useEffect(() => {
    fetchComparison()
  }, [fetchComparison])

  const handlePlayPause = () => {
    if (videoARef.current && videoBRef.current) {
      if (playing) {
        videoARef.current.pause()
        videoBRef.current.pause()
      } else {
        videoARef.current.play()
        videoBRef.current.play()
      }
      setPlaying(!playing)
    }
  }

  const syncVideos = () => {
    if (videoARef.current && videoBRef.current) {
      videoBRef.current.currentTime = videoARef.current.currentTime
    }
  }

  const handleSubmit = async () => {
    // Check if all dimensions are rated
    const missingDimensions = dimensions.filter(dim => !responses[dim])
    if (missingDimensions.length > 0) {
      toast({
        title: 'Incomplete Evaluation',
        description: 'Please rate all dimensions before submitting',
        variant: 'destructive'
      })
      return
    }

    setSubmitting(true)
    
    try {
      const dimensionScores: Record<string, string> = {}
      const detailedRatings: Record<string, string> = {}
      
      Object.entries(responses).forEach(([dimension, value]) => {
        if (value.includes('A')) {
          dimensionScores[dimension] = 'A'
        } else if (value.includes('B')) {
          dimensionScores[dimension] = 'B'
        } else {
          dimensionScores[dimension] = 'Equal'
        }
        detailedRatings[dimension] = value
      })

      await fetch('/api/submit-evaluation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comparison_id: params.id,
          dimension_scores: dimensionScores,
          detailed_ratings: detailedRatings,
          completion_time_seconds: (Date.now() - startTime) / 1000
        })
      })

      toast({
        title: 'Success',
        description: 'Your evaluation has been submitted'
      })

      // Check if this is a Prolific session
      const isProlific = sessionStorage.getItem('is_prolific')
      if (isProlific) {
        router.push('/prolific/next')
      } else {
        router.push('/thank-you')
      }
    } catch (error) {
      console.error('Error submitting evaluation:', error)
      toast({
        title: 'Error',
        description: 'Failed to submit evaluation',
        variant: 'destructive'
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!comparison) {
    return (
      <div className="text-center">
        <p>Comparison not found</p>
        <Button onClick={() => router.push('/')} className="mt-4">
          Go Back
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Video Comparison Evaluation</CardTitle>
          <CardDescription>
            Scenario: {comparison.scenario_metadata.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            {comparison.scenario_metadata.description}
          </p>
          
          {/* Video Display */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <h3 className="text-center font-semibold mb-2">Model A</h3>
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoARef}
                  src={comparison.model_a_video_path}
                  className="w-full h-full"
                  loop
                  onPlay={() => syncVideos()}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={() => syncVideos()}
                />
              </div>
            </div>
            
            <div>
              <h3 className="text-center font-semibold mb-2">Model B</h3>
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoBRef}
                  src={comparison.model_b_video_path}
                  className="w-full h-full"
                  loop
                />
              </div>
            </div>
          </div>

          {/* Video Controls */}
          <div className="flex justify-center mb-8">
            <Button
              onClick={handlePlayPause}
              size="lg"
              variant="outline"
            >
              {playing ? (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Play
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Evaluation Form */}
      {dimensions.map((dimension) => (
        <Card key={dimension}>
          <CardHeader>
            <CardTitle>{dimensionInfo[dimension].name}</CardTitle>
            <CardDescription>
              {dimensionInfo[dimension].prompt}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {dimensionInfo[dimension].description}
            </p>
            
            {dimensionInfo[dimension].sub_questions && (
              <div className="bg-secondary p-3 rounded-lg">
                <p className="text-sm font-medium mb-1">Consider these aspects:</p>
                <ul className="list-disc list-inside text-sm text-muted-foreground">
                  {dimensionInfo[dimension].sub_questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            <RadioGroup
              value={responses[dimension] || ''}
              onValueChange={(value) => setResponses({ ...responses, [dimension]: value })}
            >
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="A_much_better" id={`${dimension}_A_much`} />
                  <Label htmlFor={`${dimension}_A_much`}>Model A is much better</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="A_slightly_better" id={`${dimension}_A_slight`} />
                  <Label htmlFor={`${dimension}_A_slight`}>Model A is slightly better</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Equal" id={`${dimension}_equal`} />
                  <Label htmlFor={`${dimension}_equal`}>Both are equally good</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="B_slightly_better" id={`${dimension}_B_slight`} />
                  <Label htmlFor={`${dimension}_B_slight`}>Model B is slightly better</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="B_much_better" id={`${dimension}_B_much`} />
                  <Label htmlFor={`${dimension}_B_much`}>Model B is much better</Label>
                </div>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>
      ))}

      {/* Submit Button */}
      <div className="flex justify-center py-8">
        <Button
          onClick={handleSubmit}
          size="lg"
          disabled={submitting || Object.keys(responses).length < dimensions.length}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit Evaluation'
          )}
        </Button>
      </div>
    </div>
  )
}