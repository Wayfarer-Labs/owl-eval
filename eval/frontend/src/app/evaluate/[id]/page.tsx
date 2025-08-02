'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  SkipBack,
  SkipForward,
  Maximize2,
  Minimize2,
  Link,
  Unlink,
  Settings,
  Save,
  CheckCircle,
  Star
} from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import ReactPlayer from 'react-player'
import { normalizeVideoUrl } from '@/lib/storage'

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

interface VideoTask {
  id: string
  scenarioId: string
  modelName: string
  videoPath: string
  metadata?: any
  experiment: {
    id: string
    name: string
    config: any
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
  const [videoTask, setVideoTask] = useState<VideoTask | null>(null)
  const [evaluationMode, setEvaluationMode] = useState<'comparison' | 'single_video'>('comparison')
  const [actualComparisonId, setActualComparisonId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [responses, setResponses] = useState<Record<string, string | number>>({})
  const [startTime] = useState(Date.now())
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [saving, setSaving] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Generate or retrieve session ID for anonymous users  
  const getSessionId = useCallback(() => {
    let sessionId = sessionStorage.getItem('anon_session_id')
    if (!sessionId) {
      sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
      sessionStorage.setItem('anon_session_id', sessionId)
    }
    return sessionId
  }, [])

  const playerARef = useRef<ReactPlayer>(null)
  const playerBRef = useRef<ReactPlayer>(null)
  const [playingA, setPlayingA] = useState(false)
  const [playingB, setPlayingB] = useState(false)
  const [currentTimeA, setCurrentTimeA] = useState(0)
  const [currentTimeB, setCurrentTimeB] = useState(0)
  const [durationA, setDurationA] = useState(0)
  const [durationB, setDurationB] = useState(0)
  const [volumeA, setVolumeA] = useState(1)
  const [volumeB, setVolumeB] = useState(1)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [videoSize, setVideoSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [syncMode, setSyncMode] = useState(true)
  const [videoLoadedA, setVideoLoadedA] = useState(false)
  const [videoLoadedB, setVideoLoadedB] = useState(false)

  const fetchComparison = useCallback(async () => {
    try {
      // Use unified task endpoint to determine task type
      let response = await fetch(`/api/tasks/${params.id}`)

      if (!response.ok) {
        if (response.status === 404) {
          console.error('Task not found:', params.id)
          toast({
            title: 'Evaluation Not Found',
            description: 'The requested evaluation could not be found',
            variant: 'destructive'
          })
          router.push('/thank-you')
          return
        }
        throw new Error(`Failed to fetch task: ${response.status}`)
      }

      const taskData = await response.json()

      if (taskData.type === 'single_video') {
        // Handle single video evaluation
        const videoData = taskData.task

        // Validate critical video task data
        if (!videoData.id || !videoData.videoPath) {
          console.error('Invalid video task data:', videoData)
          toast({
            title: 'Session Initialization Failed',
            description: 'Failed to initialize your session, please contact support',
            variant: 'destructive'
          })
          router.push('/thank-you')
          return
        }

        setVideoTask(videoData)
        setEvaluationMode('single_video')

        // Load any existing draft for single video
        const participantId = sessionStorage.getItem('participant_id') || 'anonymous'
        const sessionId = getSessionId()

        // Validate session ID generation
        if (!sessionId) {
          console.error('Failed to generate session ID')
          toast({
            title: 'Session Initialization Failed',
            description: 'Failed to initialize your session, please contact support',
            variant: 'destructive'
          })
          router.push('/thank-you')
          return
        }

        const draftResponse = await fetch(`/api/single-video-evaluation-submissions/draft?singleVideoEvaluationTaskId=${videoData.id}&participantId=${participantId}&sessionId=${sessionId}`)

        if (draftResponse.ok) {
          const draftData = await draftResponse.json()
          if (draftData.draft) {
            if (draftData.draft.status === 'completed') {
              toast({
                title: 'Already Completed',
                description: 'You have already submitted an evaluation for this video',
                variant: 'destructive'
              })
              router.push('/thank-you')
              return
            }

            if (draftData.draft.status === 'draft') {
              const savedResponses = draftData.draft.dimensionScores || {}
              setResponses(savedResponses)
              setLastSaved(new Date(draftData.draft.lastSavedAt))

              toast({
                title: 'Draft Loaded',
                description: 'Your previous progress has been restored',
              })
            }
          }
        } else if (draftResponse.status >= 500) {
          // Server error loading draft - could indicate session issues
          console.error('Server error loading draft:', draftResponse.status)
          toast({
            title: 'Session Initialization Failed',
            description: 'Failed to initialize your session, please contact support',
            variant: 'destructive'
          })
          router.push('/thank-you')
          return
        }
        setLoading(false)
        return
      } else if (taskData.type === 'comparison') {
        // Handle comparison evaluation
        let comparisonData = taskData.task

        // Normalize comparison object if needed
        if (!comparisonData.comparison_id) {
          comparisonData = {
            comparison_id: comparisonData.id,
            scenario_id: comparisonData.scenarioId,
            scenario_metadata: {
              name: comparisonData.metadata?.scenario?.name || comparisonData.scenarioId || '',
              description: comparisonData.metadata?.scenario?.description || '',
            },
            model_a_video_path: comparisonData.videoAPath,
            model_b_video_path: comparisonData.videoBPath,
            randomized_labels: {
              A: comparisonData.modelA || 'A',
              B: comparisonData.modelB || 'B',
            },
            // Optionally spread the rest of the object if you need other fields
            ...comparisonData,
          }
        }

        setComparison(comparisonData)
        setEvaluationMode('comparison')

        if (!comparisonData.scenario_metadata) {
          console.warn('scenario_metadata is missing for comparison:', comparisonData.comparison_id)
        }

        // Set the actual comparison ID if not already set
        const comparisonId = actualComparisonId || comparisonData.comparison_id
        if (!actualComparisonId) {
          setActualComparisonId(comparisonId)
        }

        // Load any existing draft
        const participantId = sessionStorage.getItem('participant_id') || 'anonymous'
        const sessionId = getSessionId()
        const draftResponse = await fetch(`/api/two-video-comparison-submissions/draft?twoVideoComparisonTaskId=${comparisonId}&participantId=${participantId}&sessionId=${sessionId}`)

        if (draftResponse.ok) {
          const draftData = await draftResponse.json()
          if (draftData.draft) {
            // Check if evaluation is already completed
            if (draftData.draft.status === 'completed') {
              toast({
                title: 'Already Completed',
                description: 'You have already submitted an evaluation for this comparison',
                variant: 'destructive'
              })
              router.push('/thank-you')
              return
            }

            if (draftData.draft.status === 'draft') {
              // Check if we have the full responses saved in clientMetadata
              const savedResponses = draftData.draft.clientMetadata?.responses
              if (savedResponses) {
                setResponses(savedResponses)
              } else {
                // Fallback to dimension scores if no full responses available
                const dimensionScores = draftData.draft.dimensionScores || {}
                const uiResponses: Record<string, string> = {}
                Object.entries(dimensionScores).forEach(([dimension, score]) => {
                  if (score === 'A') {
                    uiResponses[dimension] = 'A_slightly_better'
                  } else if (score === 'B') {
                    uiResponses[dimension] = 'B_slightly_better'
                  } else {
                    uiResponses[dimension] = 'Equal'
                  }
                })
                setResponses(uiResponses)
              }
              setLastSaved(new Date(draftData.draft.lastSavedAt))

              toast({
                title: 'Draft Loaded',
                description: 'Your previous progress has been restored',
              })
            }
          }
        }
        setLoading(false)
      } else {
        // Unknown task type
        console.error('Unknown task type:', taskData.type)
        toast({
          title: 'Evaluation Not Found',
          description: 'The requested evaluation could not be found',
          variant: 'destructive'
        })
        router.push('/thank-you')
        return
      }
    } catch (error) {
      console.error('Error fetching task:', error)
      toast({
        title: 'Error',
        description: 'Failed to load evaluation task',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }, [params.id, toast, getSessionId, actualComparisonId, router])

  // Auto-save functionality
  const saveDraft = useCallback(async () => {
    if ((!comparison && !videoTask) || Object.keys(responses).length === 0 || submitting) {
      console.log('Skipping save: no content, responses, or currently submitting', {
        comparison: !!comparison,
        videoTask: !!videoTask,
        responsesCount: Object.keys(responses).length,
        submitting
      })
      return
    }

    console.log('Starting draft save...', { responses, evaluationMode })
    setSaving(true)
    try {
      const participantId = sessionStorage.getItem('participant_id') || 'anonymous'
      const experimentId = sessionStorage.getItem('experiment_id')
      const prolificPid = sessionStorage.getItem('prolific_pid')
      const sessionId = getSessionId()

      if (evaluationMode === 'single_video') {
        // Save single video evaluation draft
        const response = await fetch('/api/single-video-evaluation-submissions/draft', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            singleVideoEvaluationTaskId: videoTask?.id,
            participantId,
            experimentId,
            prolificPid,
            dimensionScores: responses,
            completionTimeSeconds: (Date.now() - startTime) / 1000,
            clientMetadata: {
              userAgent: navigator.userAgent,
              sessionId,
            },
          }),
        })

        if (response.ok) {
          const data = await response.json()
          setLastSaved(new Date(data.lastSavedAt))
          console.log('✓ Single video draft saved successfully')
        }
        return
      }

      // Handle comparison evaluation draft save
      const dimensionScores: Record<string, string> = {}
      Object.entries(responses).forEach(([dimension, value]) => {
        if (typeof value === 'string') {
          if (value.includes('A')) {
            dimensionScores[dimension] = 'A'
          } else if (value.includes('B')) {
            dimensionScores[dimension] = 'B'
          } else {
            dimensionScores[dimension] = 'Equal'
          }
        }
      })

      console.log('Saving comparison draft with data:', {
        comparisonId: params.id,
        participantId,
        sessionId,
        dimensionScores
      })

      const response = await fetch('/api/two-video-comparison-submissions/draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          twoVideoComparisonTaskId: actualComparisonId || params.id,
          participantId,
          experimentId,
          prolificPid,
          dimensionScores,
          completionTimeSeconds: (Date.now() - startTime) / 1000,
          clientMetadata: {
            responses,
            userAgent: navigator.userAgent,
            sessionId,
          },
        }),
      })

      console.log('Draft save response:', response.status, response.statusText)

      if (response.ok) {
        const data = await response.json()
        console.log('Draft saved successfully:', data)
        setLastSaved(new Date(data.lastSavedAt))
        toast({
          title: 'Progress Saved',
          description: 'Your evaluation progress has been saved',
        })
      } else if (response.status === 409) {
        // Evaluation already completed
        toast({
          title: 'Already Completed',
          description: 'You have already submitted this evaluation',
          variant: 'destructive'
        })
        router.push('/thank-you')
        return
      } else {
        const errorData = await response.text()
        console.error('Draft save failed:', response.status, errorData)
        toast({
          title: 'Save Failed',
          description: 'Failed to save progress',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Error saving draft:', error)
      toast({
        title: 'Save Error',
        description: 'Network error while saving',
        variant: 'destructive'
      })
    } finally {
      setSaving(false)
    }
  }, [comparison, videoTask, evaluationMode, responses, actualComparisonId, params.id, startTime, getSessionId, toast, router, submitting])

  // Debounced auto-save when responses change
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveDraft()
    }, 2000) // Save after 2 seconds of inactivity

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [responses, saveDraft])

  useEffect(() => {
    // Check if screening has been completed before allowing evaluation
    // Skip screening check if coming from admin (referrer contains 'admin' or URL has admin=true)
    const screeningCompleted = sessionStorage.getItem('screening_completed')
    const urlParams = new URLSearchParams(window.location.search)
    const isFromAdmin = document.referrer.includes('/admin') || urlParams.get('admin') === 'true'

    if (!screeningCompleted && !isFromAdmin) {
      // Redirect to screening page if not completed
      router.push('/screening')
      return
    }

    fetchComparison()
  }, [fetchComparison, router])

  // Force loading state to false after videos should have loaded
  useEffect(() => {
    if (comparison || videoTask) {
      const timer = setTimeout(() => {
        setVideoLoadedA(true)
        if (comparison) setVideoLoadedB(true) // Only set B for comparison mode
      }, 3000) // 3 seconds should be enough for videos to load

      return () => clearTimeout(timer)
    }
  }, [comparison, videoTask])

  // Set up video event listeners for ReactPlayer A
  const handlePlayerAReady = () => {
    setVideoLoadedA(true)
    if (playerARef.current) {
      const player = playerARef.current.getInternalPlayer()
      if (player) {
        player.playbackRate = playbackSpeed
        player.volume = volumeA
        setDurationA(player.duration || 0)
      }
    }
  }

  const handlePlayerAProgress = (state: any) => {
    setCurrentTimeA(state.playedSeconds)
  }

  const handlePlayerAPlay = () => {
    setPlayingA(true)
  }

  const handlePlayerAPause = () => {
    setPlayingA(false)
  }

  const handlePlayerADuration = (duration: number) => {
    setDurationA(duration)
  }

  const handlePlayerAError = (error: any) => {
    console.error('Player A error:', error)
  }

  // Set up video event listeners for ReactPlayer B
  const handlePlayerBReady = () => {
    setVideoLoadedB(true)
    if (playerBRef.current) {
      const player = playerBRef.current.getInternalPlayer()
      if (player) {
        player.playbackRate = playbackSpeed
        player.volume = volumeB
        setDurationB(player.duration || 0)
      }
    }
  }

  const handlePlayerBProgress = (state: any) => {
    setCurrentTimeB(state.playedSeconds)
  }

  const handlePlayerBPlay = () => {
    setPlayingB(true)
  }

  const handlePlayerBPause = () => {
    setPlayingB(false)
  }

  const handlePlayerBDuration = (duration: number) => {
    setDurationB(duration)
  }

  const handlePlayerBError = (error: any) => {
    console.error('Player B error:', error)
  }

  // Video control functions
  const handlePlayA = async () => {
    if (playerARef.current) {
      const player = playerARef.current.getInternalPlayer()
      if (player) {
        try {
          if (playingA) {
            player.pause()
          } else {
            await player.play()
            if (syncMode && playerBRef.current && !playingB) {
              const playerB = playerBRef.current.getInternalPlayer()
              if (playerB) {
                try {
                  await playerB.play()
                } catch (e) {
                  console.error('Error playing player B in sync:', e)
                }
              }
            }
          }
        } catch (error) {
          console.error('Error playing player A:', error)
        }
      }
    }
  }

  const handlePlayB = async () => {
    if (playerBRef.current) {
      const player = playerBRef.current.getInternalPlayer()
      if (player) {
        try {
          if (playingB) {
            player.pause()
          } else {
            await player.play()
            if (syncMode && playerARef.current && !playingA) {
              const playerA = playerARef.current.getInternalPlayer()
              if (playerA) {
                try {
                  await playerA.play()
                } catch (e) {
                  console.error('Error playing player A in sync:', e)
                }
              }
            }
          }
        } catch (error) {
          console.error('Error playing player B:', error)
        }
      }
    }
  }

  // Wrap handlePlayBoth in useCallback
  const handlePlayBoth = useCallback(async () => {
    if (playerARef.current && playerBRef.current) {
      const playerA = playerARef.current.getInternalPlayer()
      const playerB = playerBRef.current.getInternalPlayer()

      if (playerA && playerB) {
        const bothPlaying = playingA && playingB;
        if (bothPlaying) {
          playerA.pause();
          playerB.pause();
        } else {
          try {
            if (syncMode) {
              const avgTime = (currentTimeA + currentTimeB) / 2;
              playerA.currentTime = avgTime;
              playerB.currentTime = avgTime;
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            await Promise.all([playerA.play(), playerB.play()]);
          } catch (error) {
            console.error('Error playing videos:', error);
            try {
              await playerA.play();
            } catch (e) {
              console.error('Error playing player A:', e);
            }
            try {
              await playerB.play();
            } catch (e) {
              console.error('Error playing player B:', e);
            }
          }
        }
      }
    }
  }, [playerARef, playerBRef, playingA, playingB, syncMode, currentTimeA, currentTimeB]);

  // Wrap handleSeek in useCallback
  const handleSeek = useCallback((video: 'A' | 'B', time: number) => {
    const playerRef = video === 'A' ? playerARef : playerBRef;
    if (playerRef.current) {
      const player = playerRef.current.getInternalPlayer()
      if (player) {
        const clampedTime = Math.max(0, Math.min(time, player.duration || 0));
        player.currentTime = clampedTime;

        // Immediately update the state to sync the progress bar
        if (video === 'A') {
          setCurrentTimeA(clampedTime);
        } else {
          setCurrentTimeB(clampedTime);
        }

        // Handle sync mode for comparison videos
        if (syncMode && comparison) {
          const otherRef = video === 'A' ? playerBRef : playerARef;
          if (otherRef.current) {
            const otherPlayer = otherRef.current.getInternalPlayer()
            if (otherPlayer) {
              otherPlayer.currentTime = clampedTime;
              if (video === 'A') {
                setCurrentTimeB(clampedTime);
              } else {
                setCurrentTimeA(clampedTime);
              }
            }
          }
        }
      }
    }
  }, [playerARef, playerBRef, syncMode, comparison]);

  const handleVolumeChange = (video: 'A' | 'B', volume: number) => {
    const playerRef = video === 'A' ? playerARef : playerBRef
    const setVolume = video === 'A' ? setVolumeA : setVolumeB
    if (playerRef.current) {
      const player = playerRef.current.getInternalPlayer()
      if (player) {
        player.volume = volume
        setVolume(volume)
      }
    }
  }

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed)

    // Apply to both players
    if (playerARef.current) {
      const playerA = playerARef.current.getInternalPlayer()
      if (playerA) {
        playerA.playbackRate = speed
        console.log(`Set Player A playback rate to ${speed}`)
      }
    }
    if (playerBRef.current) {
      const playerB = playerBRef.current.getInternalPlayer()
      if (playerB) {
        playerB.playbackRate = speed
        console.log(`Set Player B playback rate to ${speed}`)
      }
    }
  }

  // Wrap handleRestart in useCallback
  const handleRestart = useCallback(() => {
    if (playerARef.current) {
      const playerA = playerARef.current.getInternalPlayer()
      if (playerA) {
        playerA.currentTime = 0
        setCurrentTimeA(0)
      }
    }
    if (playerBRef.current) {
      const playerB = playerBRef.current.getInternalPlayer()
      if (playerB) {
        playerB.currentTime = 0
        setCurrentTimeB(0)
      }
    }
  }, [playerARef, playerBRef]);

  // Wrap toggleSync in useCallback
  const toggleSync = useCallback(() => {
    setSyncMode((prev) => !prev)
  }, []);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getProgress = (current: number, duration: number) => {
    if (!duration || duration === 0) return 0
    return Math.round((current / duration) * 100)
  }

  const getVideoSizeClass = () => {
    switch (videoSize) {
      case 'small': return 'w-full max-w-sm'
      case 'large': return 'w-full max-w-3xl'
      default: return 'w-full max-w-xl'
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

    // For single video mode, validate that all ratings are valid integers between 1-5
    if (evaluationMode === 'single_video') {
      const invalidRatings = dimensions.filter(dim => {
        const rating = responses[dim]
        return !rating || typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)
      })
      if (invalidRatings.length > 0) {
        toast({
          title: 'Invalid Ratings',
          description: 'All ratings must be between 1 and 5',
          variant: 'destructive'
        })
        return
      }
    }

    // Clear any pending auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    setSubmitting(true)

    try {
      // Get participant info if this is a Prolific session
      const participantId = sessionStorage.getItem('participant_id') || 'anonymous'
      const experimentId = sessionStorage.getItem('experiment_id')
      const prolificPid = sessionStorage.getItem('prolific_pid')
      const sessionId = getSessionId()

      let submitResponse, submitResult

      if (evaluationMode === 'single_video') {
        // Debug the payload before sending
        const payload = {
          video_task_id: videoTask?.id,
          dimension_scores: responses,
          completion_time_seconds: (Date.now() - startTime) / 1000,
          participant_id: participantId,
          experiment_id: experimentId,
          evaluator_id: prolificPid || 'anonymous',
          session_id: sessionId
        };


        // Handle single video evaluation submission
        submitResponse = await fetch('/api/submit-single-video-evaluation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        })

        submitResult = await submitResponse.json()

        if (!submitResponse.ok) {
          console.error('Single video submission failed:', submitResult);
          toast({
            title: 'Session Initialization Failed',
            description: 'Failed to initialize your session, please contact support',
            variant: 'destructive'
          });
          return;
        }

        toast({
          title: 'Success',
          description: 'Your evaluation has been submitted'
        })

        // Check if there's a next video task to evaluate
        if (submitResult.next_video_task_id) {
          toast({
            title: 'Next Video',
            description: 'Loading the next video for evaluation...'
          })
          router.push(`/evaluate/${submitResult.next_video_task_id}`)
        } else {
          // Check if this is a Prolific session
          const isProlific = sessionStorage.getItem('is_prolific')
          if (isProlific) {
            router.push('/prolific/complete')
          } else {
            router.push('/thank-you')
          }
        }
      } else {
        // Handle comparison evaluation submission
        const dimensionScores: Record<string, string> = {}
        const detailedRatings: Record<string, string> = {}

        Object.entries(responses).forEach(([dimension, value]) => {
          if (typeof value === 'string') {
            if (value.includes('A')) {
              dimensionScores[dimension] = 'A'
            } else if (value.includes('B')) {
              dimensionScores[dimension] = 'B'
            } else {
              dimensionScores[dimension] = 'Equal'
            }
            detailedRatings[dimension] = value
          }
        })

        submitResponse = await fetch('/api/submit-two-video-comparison', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            comparison_id: actualComparisonId || params.id,
            dimension_scores: dimensionScores,
            detailed_ratings: detailedRatings,
            completion_time_seconds: (Date.now() - startTime) / 1000,
            participant_id: participantId,
            experiment_id: experimentId,
            evaluator_id: prolificPid || 'anonymous',
            session_id: sessionId
          })
        })

        submitResult = await submitResponse.json()

        toast({
          title: 'Success',
          description: 'Your evaluation has been submitted'
        })

        // Check if there's a next comparison to evaluate
        if (submitResult.next_comparison_id) {
          toast({
            title: 'Next Comparison',
            description: 'Loading the next comparison for evaluation...'
          })
          router.push(`/evaluate/${submitResult.next_comparison_id}`)
        } else {
          // Check if this is a Prolific session
          const isProlific = sessionStorage.getItem('is_prolific')
          if (isProlific) {
            router.push('/prolific/complete')
          } else {
            router.push('/thank-you')
          }
        }
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is on input, textarea, or select
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (['input', 'textarea', 'select', 'button'].includes(tag)) return;

      // Space: Play/Pause
      if (e.code === 'Space') {
        e.preventDefault();
        if (evaluationMode === 'comparison') {
          handlePlayBoth();
        } else {
          if (playerARef.current) {
            const player = playerARef.current.getInternalPlayer();
            if (player) {
              if (player.paused) {
                player.play();
                setPlayingA(true);
              } else {
                player.pause();
                setPlayingA(false);
              }
            }
          }
        }
      }

      // Left Arrow: Seek -5s
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (evaluationMode === 'comparison') {
          handleSeek('A', Math.max(0, currentTimeA - 5));
          handleSeek('B', Math.max(0, currentTimeB - 5));
        } else {
          handleSeek('A', Math.max(0, currentTimeA - 5));
        }
      }

      // Right Arrow: Seek +5s
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (evaluationMode === 'comparison') {
          handleSeek('A', Math.min(durationA, currentTimeA + 5));
          handleSeek('B', Math.min(durationB, currentTimeB + 5));
        } else {
          handleSeek('A', Math.min(durationA, currentTimeA + 5));
        }
      }

      // R: Restart
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRestart();
      }

      // S: Toggle Sync (comparison only)
      if ((e.key === 's' || e.key === 'S') && evaluationMode === 'comparison') {
        e.preventDefault();
        toggleSync();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    evaluationMode,
    currentTimeA,
    currentTimeB,
    durationA,
    durationB,
    handleRestart,
    handleSeek,
    handlePlayBoth,
    toggleSync,
    playerARef,
    playerBRef,
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!comparison && !videoTask) {
    return (
      <div className="text-center">
        <p>{evaluationMode === 'single_video' ? 'Video task not found' : 'Comparison not found'}</p>
        <Button onClick={() => router.push('/')} className="mt-4">
          Go Back
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl text-slate-100">
              {evaluationMode === 'single_video' ? 'Single Video Evaluation' : 'Video Comparison Evaluation'}
            </CardTitle>
            {lastSaved && (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                {saving ? (
                  <>
                    <Save className="h-4 w-4 animate-pulse text-cyan-400" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span>Saved {lastSaved.toLocaleTimeString()}</span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-sm bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
                {evaluationMode === 'single_video'
                  ? (
                    videoTask?.metadata?.scenario?.name
                      ? videoTask.metadata.scenario.name
                      : videoTask?.scenarioId
                  )
                  : (
                    comparison?.scenario_metadata?.name
                      ? comparison.scenario_metadata.name
                      : comparison?.scenario_id
                  )
                }
              </Badge>
              {evaluationMode === 'single_video' && (
                <>
                  <Badge variant="outline" className="text-sm">
                    {videoTask?.modelName}
                  </Badge>
                  <span className="text-sm text-slate-400">Model</span>
                </>
              )}
              {evaluationMode === 'comparison' && (
                <span className="text-sm text-slate-400">Scenario</span>
              )}
            </div>
            {evaluationMode === 'single_video' && videoTask?.metadata?.scenario?.description && (
              <p className="text-sm text-slate-300 mt-2">
                {videoTask?.metadata?.scenario?.description}
              </p>
            )}
            {evaluationMode === 'comparison' && comparison?.scenario_metadata?.description && (
              <p className="text-sm text-slate-300 mt-2">
                {comparison?.scenario_metadata?.description}
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>

          {/* Keyboard Shortcuts */}
          <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-3 mb-4">
            <details className="cursor-pointer">
              <summary className="text-sm font-medium text-slate-200 flex items-center gap-2">
                <Settings className="h-4 w-4 text-cyan-400" />
                Keyboard Shortcuts & Tips
              </summary>
              <div className="mt-2 text-xs text-slate-300 grid grid-cols-2 md:grid-cols-4 gap-2">
                <div><kbd className="bg-slate-700 text-slate-200 px-2 py-0.5 rounded border border-slate-600">Space</kbd> Play/Pause Both</div>
                <div><kbd className="bg-slate-700 text-slate-200 px-2 py-0.5 rounded border border-slate-600">←/→</kbd> Seek ±5s</div>
                <div><kbd className="bg-slate-700 text-slate-200 px-2 py-0.5 rounded border border-slate-600">R</kbd> Restart Videos</div>
                <div><kbd className="bg-slate-700 text-slate-200 px-2 py-0.5 rounded border border-slate-600">S</kbd> Toggle Sync</div>
              </div>
            </details>
          </div>

          {/* Video Controls Header */}
          <div className="bg-gradient-to-r from-slate-800/60 to-slate-700/60 border border-slate-600/50 rounded-lg p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {evaluationMode === 'single_video' ? (
                  // Single video controls
                  <>
                    <Button
                      onClick={async () => {
                        if (playerARef.current) {
                          const player = playerARef.current.getInternalPlayer();
                          if (player) {
                            try {
                              if (player.paused) {
                                await player.play();
                                setPlayingA(true);
                              } else {
                                player.pause();
                                setPlayingA(false);
                              }
                            } catch (error) {
                              console.error('Error controlling video:', error);
                            }
                          }
                        }
                      }}
                      size="lg"
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      {playingA ? (
                        <>
                          <Pause className="mr-2 h-5 w-5" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-5 w-5" />
                          Play
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={() => handleSeek('A', 0)}
                      variant="outline"
                      size="sm"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restart
                    </Button>
                  </>
                ) : (
                  // Comparison mode controls
                  <>
                    <Button
                      onClick={handlePlayBoth}
                      size="lg"
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {playingA && playingB ? (
                        <>
                          <Pause className="mr-2 h-5 w-5" />
                          Pause Both
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-5 w-5" />
                          Play Both
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={toggleSync}
                      variant={syncMode ? "default" : "outline"}
                      size="sm"
                    >
                      {syncMode ? (
                        <>
                          <Link className="mr-2 h-4 w-4" />
                          Synced
                        </>
                      ) : (
                        <>
                          <Unlink className="mr-2 h-4 w-4" />
                          Independent
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={handleRestart}
                      variant="outline"
                      size="sm"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restart
                    </Button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-slate-200">Speed:</Label>
                  <select
                    value={playbackSpeed}
                    onChange={(e) => handleSpeedChange(Number(e.target.value))}
                    className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                  >
                    <option value={0.25}>0.25x</option>
                    <option value={0.5}>0.5x</option>
                    <option value={0.75}>0.75x</option>
                    <option value={1}>1x</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2}>2x</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-slate-200">Size:</Label>
                  <select
                    value={videoSize}
                    onChange={(e) => setVideoSize(e.target.value as 'small' | 'medium' | 'large')}
                    className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Video Display */}
          {evaluationMode === 'comparison' ? (
            // Comparison mode: Two videos side by side
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Model A */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-blue-600">Model A</h3>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handlePlayA}
                      size="sm"
                      variant={playingA ? "default" : "outline"}
                    >
                      {playingA ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className={`relative bg-black rounded-lg overflow-hidden mx-auto ${getVideoSizeClass()}`}>
                  <div className="relative pt-[56.25%]">
                    <ReactPlayer
                      ref={playerARef}
                      url={comparison?.model_a_video_path ? 
                        normalizeVideoUrl(comparison.model_a_video_path) : 
                        undefined}
                      width="100%"
                      height="100%"
                      loop
                      muted={volumeA === 0}
                      volume={volumeA}
                      playbackRate={playbackSpeed}
                      playing={playingA}
                      onReady={handlePlayerAReady}
                      onProgress={handlePlayerAProgress}
                      onPlay={handlePlayerAPlay}
                      onPause={handlePlayerAPause}
                      onDuration={handlePlayerADuration}
                      onError={handlePlayerAError}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                      }}
                      config={{
                        file: {
                          attributes: {
                            crossOrigin: 'anonymous',
                            preload: 'metadata'
                          }
                        }
                      }}
                    />

                    {/* Loading indicator */}
                    {!videoLoadedA && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                        <div className="flex items-center gap-2 text-white">
                          <Loader2 className="h-6 w-6 animate-spin" />
                          <span className="text-sm">Loading Video A...</span>
                        </div>
                      </div>
                    )}

                    {/* Video overlay with time */}
                    <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-mono z-10">
                      {formatTime(currentTimeA)} / {formatTime(durationA)}
                    </div>
                  </div>
                </div>

                {/* Model A Controls */}
                <div className="space-y-3 bg-slate-800/50 border border-slate-600/50 rounded-lg p-4">
                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Progress</span>
                      <span className="flex items-center gap-2">
                        {syncMode && (
                          <span className="text-cyan-400 font-medium">🔗 SYNC</span>
                        )}
                        <span>{getProgress(currentTimeA, durationA)}%</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={durationA || 100}
                      value={currentTimeA}
                      onChange={(e) => handleSeek('A', Number(e.target.value))}
                      className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer 
                              focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-50
                              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-lg"
                    />
                  </div>

                  {/* Volume control */}
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-slate-400" />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={volumeA}
                      onChange={(e) => handleVolumeChange('A', Number(e.target.value))}
                      className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer
                              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
                              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
                    />
                    <span className="text-xs text-slate-300 w-8">{Math.round(volumeA * 100)}%</span>
                  </div>

                  {/* Quick seek buttons */}
                  <div className="flex justify-center gap-2">
                    <Button
                      onClick={() => handleSeek('A', Math.max(0, currentTimeA - 5))}
                      size="sm"
                      variant="outline"
                    >
                      <SkipBack className="h-3 w-3 mr-1" />
                      -5s
                    </Button>
                    <Button
                      onClick={() => handleSeek('A', Math.min(durationA, currentTimeA + 5))}
                      size="sm"
                      variant="outline"
                    >
                      +5s
                      <SkipForward className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Model B */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-purple-600">Model B</h3>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handlePlayB}
                      size="sm"
                      variant={playingB ? "default" : "outline"}
                    >
                      {playingB ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className={`relative bg-black rounded-lg overflow-hidden mx-auto ${getVideoSizeClass()}`}>
                  <div className="relative pt-[56.25%]">
                    <ReactPlayer
                      ref={playerBRef}
                      url={comparison?.model_b_video_path ? 
                        normalizeVideoUrl(comparison.model_b_video_path) : 
                        undefined}
                      width="100%"
                      height="100%"
                      loop
                      muted={volumeB === 0}
                      volume={volumeB}
                      playbackRate={playbackSpeed}
                      playing={playingB}
                      onReady={handlePlayerBReady}
                      onProgress={handlePlayerBProgress}
                      onPlay={handlePlayerBPlay}
                      onPause={handlePlayerBPause}
                      onDuration={handlePlayerBDuration}
                      onError={handlePlayerBError}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                      }}
                      config={{
                        file: {
                          attributes: {
                            crossOrigin: 'anonymous',
                            preload: 'metadata'
                          }
                        }
                      }}
                    />

                    {/* Loading indicator */}
                    {!videoLoadedB && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                        <div className="flex items-center gap-2 text-white">
                          <Loader2 className="h-6 w-6 animate-spin" />
                          <span className="text-sm">Loading Video B...</span>
                        </div>
                      </div>
                    )}

                    {/* Video overlay with time */}
                    <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-mono z-10">
                      {formatTime(currentTimeB)} / {formatTime(durationB)}
                    </div>
                  </div>
                </div>

                {/* Model B Controls */}
                <div className="space-y-3 bg-slate-800/50 border border-slate-600/50 rounded-lg p-4">
                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Progress</span>
                      <span className="flex items-center gap-2">
                        {syncMode && (
                          <span className="text-green-400 font-medium">🔗 SYNC</span>
                        )}
                        <span>{getProgress(currentTimeB, durationB)}%</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={durationB || 100}
                      value={currentTimeB}
                      onChange={(e) => handleSeek('B', Number(e.target.value))}
                      className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer 
                              focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-50
                              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-400 [&::-webkit-slider-thumb]:shadow-lg"
                    />
                  </div>

                  {/* Volume control */}
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-slate-400" />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={volumeB}
                      onChange={(e) => handleVolumeChange('B', Number(e.target.value))}
                      className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer
                              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
                              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-400"
                    />
                    <span className="text-xs text-slate-300 w-8">{Math.round(volumeB * 100)}%</span>
                  </div>

                  {/* Quick seek buttons */}
                  <div className="flex justify-center gap-2">
                    <Button
                      onClick={() => handleSeek('B', Math.max(0, currentTimeB - 5))}
                      size="sm"
                      variant="outline"
                    >
                      <SkipBack className="h-3 w-3 mr-1" />
                      -5s
                    </Button>
                    <Button
                      onClick={() => handleSeek('B', Math.min(durationB, currentTimeB + 5))}
                      size="sm"
                      variant="outline"
                    >
                      +5s
                      <SkipForward className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Single video mode: One centered video
            <div className="flex justify-center mb-6">
              <div className={`relative bg-black rounded-lg overflow-hidden ${videoSize === 'large' ? 'w-full max-w-6xl' : videoSize === 'medium' ? 'w-full max-w-4xl' : 'w-full max-w-2xl'}`}>
                <div className="relative pt-[56.25%]">
                  <ReactPlayer
                    ref={playerARef}
                    url={videoTask?.videoPath ? 
                      normalizeVideoUrl(videoTask.videoPath) : 
                      undefined}
                    width="100%"
                    height="100%"
                    loop
                    muted={volumeA === 0}
                    volume={volumeA}
                    playbackRate={playbackSpeed}
                    playing={playingA}
                    onReady={handlePlayerAReady}
                    onProgress={handlePlayerAProgress}
                    onPlay={handlePlayerAPlay}
                    onPause={handlePlayerAPause}
                    onDuration={handlePlayerADuration}
                    onError={handlePlayerAError}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                    }}
                    config={{
                      file: {
                        attributes: {
                          preload: 'metadata'
                        }
                      }
                    }}
                  />

                  {/* Video overlay with time */}
                  <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs z-10">
                    {Math.floor(currentTimeA)}s / {Math.floor(durationA)}s
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Single Video Controls (only for single video mode) */}
          {evaluationMode === 'single_video' && (
            <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-4 mb-6">
              {/* Progress bar */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Progress</span>
                    <span>{Math.round((currentTimeA / durationA) * 100) || 0}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={durationA || 100}
                    value={currentTimeA}
                    onChange={(e) => handleSeek('A', Number(e.target.value))}
                    className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer 
                              focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-opacity-50
                              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:shadow-lg"
                  />
                </div>

                {/* Volume control */}
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-slate-400" />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={volumeA}
                    onChange={(e) => handleVolumeChange('A', Number(e.target.value))}
                    className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer
                              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
                              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400"
                  />
                  <span className="text-xs text-slate-300 w-8">{Math.round(volumeA * 100)}%</span>
                </div>

                {/* Quick seek buttons */}
                <div className="flex justify-center gap-2">
                  <Button
                    onClick={() => handleSeek('A', Math.max(0, currentTimeA - 5))}
                    size="sm"
                    variant="outline"
                  >
                    <SkipBack className="h-3 w-3 mr-1" />
                    -5s
                  </Button>
                  <Button
                    onClick={() => handleSeek('A', Math.min(durationA, currentTimeA + 5))}
                    size="sm"
                    variant="outline"
                  >
                    +5s
                    <SkipForward className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          )}
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
            <p className="text-sm text-slate-300 leading-relaxed">
              {dimensionInfo[dimension].description}
            </p>

            {dimensionInfo[dimension].sub_questions && (
              <div className="bg-slate-800/50 border border-slate-600/50 p-4 rounded-lg">
                <p className="text-sm font-medium mb-2 text-slate-200">Consider these aspects:</p>
                <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
                  {dimensionInfo[dimension].sub_questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {evaluationMode === 'single_video' ? (
              // Star Rating Interface for single video
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-200">Rating:</span>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        onClick={() => setResponses({ ...responses, [dimension]: rating })}
                        className={`p-1 rounded-full transition-colors ${responses[dimension] && typeof responses[dimension] === 'number' && responses[dimension] >= rating
                          ? 'text-yellow-400 hover:text-yellow-300'
                          : 'text-slate-500 hover:text-slate-400'
                          }`}
                      >
                        <Star
                          className={`h-8 w-8 ${responses[dimension] && typeof responses[dimension] === 'number' && responses[dimension] >= rating
                            ? 'fill-current'
                            : ''
                            }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rating Labels */}
                <div className="flex justify-between text-xs text-slate-400 px-1">
                  <span>Poor</span>
                  <span>Fair</span>
                  <span>Good</span>
                  <span>Very Good</span>
                  <span>Excellent</span>
                </div>

                {/* Current Rating Display */}
                {responses[dimension] && (
                  <div className="text-center">
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-300 border-yellow-500/30">
                      {responses[dimension]} - {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][responses[dimension] as number]}
                    </Badge>
                  </div>
                )}
              </div>
            ) : (
              // Radio buttons for comparison
              <RadioGroup
                value={responses[dimension] as string || ''}
                onValueChange={(value) => setResponses({ ...responses, [dimension]: value })}
              >
                <div className="space-y-3">
                  <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-slate-700/30 transition-colors">
                    <RadioGroupItem
                      value="A_much_better"
                      id={`${dimension}_A_much`}
                      className="border-2 border-cyan-400 data-[state=checked]:bg-cyan-400 data-[state=checked]:border-cyan-400"
                    />
                    <Label htmlFor={`${dimension}_A_much`} className="text-slate-200 font-medium cursor-pointer">Model A is much better</Label>
                  </div>
                  <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-slate-700/30 transition-colors">
                    <RadioGroupItem
                      value="A_slightly_better"
                      id={`${dimension}_A_slight`}
                      className="border-2 border-cyan-400 data-[state=checked]:bg-cyan-400 data-[state=checked]:border-cyan-400"
                    />
                    <Label htmlFor={`${dimension}_A_slight`} className="text-slate-200 font-medium cursor-pointer">Model A is slightly better</Label>
                  </div>
                  <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-slate-700/30 transition-colors">
                    <RadioGroupItem
                      value="Equal"
                      id={`${dimension}_equal`}
                      className="border-2 border-cyan-400 data-[state=checked]:bg-cyan-400 data-[state=checked]:border-cyan-400"
                    />
                    <Label htmlFor={`${dimension}_equal`} className="text-slate-200 font-medium cursor-pointer">Both are equally good</Label>
                  </div>
                  <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-slate-700/30 transition-colors">
                    <RadioGroupItem
                      value="B_slightly_better"
                      id={`${dimension}_B_slight`}
                      className="border-2 border-cyan-400 data-[state=checked]:bg-cyan-400 data-[state=checked]:border-cyan-400"
                    />
                    <Label htmlFor={`${dimension}_B_slight`} className="text-slate-200 font-medium cursor-pointer">Model B is slightly better</Label>
                  </div>
                  <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-slate-700/30 transition-colors">
                    <RadioGroupItem
                      value="B_much_better"
                      id={`${dimension}_B_much`}
                      className="border-2 border-cyan-400 data-[state=checked]:bg-cyan-400 data-[state=checked]:border-cyan-400"
                    />
                    <Label htmlFor={`${dimension}_B_much`} className="text-slate-200 font-medium cursor-pointer">Model B is much better</Label>
                  </div>
                </div>
              </RadioGroup>
            )}
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