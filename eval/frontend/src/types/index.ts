// Type definitions for the application

export interface Comparison {
  comparison_id: string
  scenario_id: string
  model_a_name: string
  model_b_name: string
  model_a_video_path: string
  model_b_video_path: string
  action_sequence: any[]
  scenario_metadata: {
    name: string
    description: string
    biome?: string
  }
  randomized_labels: { A: string; B: string }
  created_at: string
}

export interface VideoTask {
  video_task_id: string
  scenario_id: string
  modelName: string
  video_path: string
  scenario_metadata: {
    name: string
    description: string
    biome?: string
  }
  created_at: string
}

export interface EvaluationResult {
  result_id: string
  comparison_id: string
  evaluator_id: string
  dimension_scores: Record<string, string>
  detailed_ratings: Record<string, any>
  completion_time_seconds: number
  submitted_at: string
}

export interface SingleVideoEvaluationResult {
  result_id: string
  video_task_id: string
  evaluator_id: string
  dimension_scores: Record<string, number> // 1-5 scale scores
  completion_time_seconds: number
  submitted_at: string
}

export interface DimensionInfo {
  name: string
  prompt: string
  description: string
  sub_questions?: string[]
}

export interface EvaluationStats {
  total_tasks: number
  total_submissions: number
  total_comparison_tasks: number
  total_single_video_tasks: number
  total_comparison_submissions: number
  total_single_video_submissions: number
  evaluations_by_scenario: Record<string, number>
  target_evaluations_per_comparison: number
}

export interface ModelPerformance {
  model: string
  dimension: string
  win_rate: number
  num_evaluations: number
  std_error?: number
}