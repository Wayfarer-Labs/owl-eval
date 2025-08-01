// Import centralized configuration
import { getConfig as getCentralizedConfig } from '../../../../config'

interface EvaluationConfig {
  outputDir: string
  targetEvaluationsPerComparison: number
  scenarios: string[]
  dimensions: {
    name: string
    description: string
    weight: number
  }[]
  videoSettings: {
    fps: number
    duration: number
    resolution: [number, number]
  }
  maxVideoSizeMB: number
  supportedVideoFormats: string[]
}

export function getConfig(): EvaluationConfig {
  const centralConfig = getCentralizedConfig()
  
  return {
    outputDir: centralConfig.storage.dataDir,
    targetEvaluationsPerComparison: centralConfig.evaluation.targetEvaluationsPerComparison,
    scenarios: ['beach', 'desert', 'forest', 'hills', 'icy', 'mushroom', 'plains', 'river'],
    dimensions: [
      {
        name: 'overall_quality',
        description: 'Overall impression of generated videos including realism, coherence, and completeness',
        weight: 1.0
      },
      {
        name: 'controllability',
        description: 'Ability to accurately translate keyboard and mouse inputs into desired behaviors',
        weight: 1.0
      },
      {
        name: 'visual_quality',
        description: 'Perceptual fidelity, texture clarity, and aesthetic appeal of individual frames',
        weight: 1.0
      },
      {
        name: 'temporal_consistency',
        description: 'Motion stability and physical plausibility across frames',
        weight: 1.0
      }
    ],
    videoSettings: {
      fps: 16,
      duration: 65,
      resolution: [1280, 720]
    },
    maxVideoSizeMB: centralConfig.evaluation.maxVideoSizeMB,
    supportedVideoFormats: centralConfig.evaluation.supportedVideoFormats
  }
}