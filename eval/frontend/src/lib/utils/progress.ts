// Utility functions for calculating experiment progress

export interface ExperimentWithCounts {
  id: string;
  evaluationMode?: 'comparison' | 'single_video';
  config?: {
    evaluationsPerComparison?: number;
  };
  _count: {
    twoVideoComparisonTasks: number;
    singleVideoEvaluationTasks: number;
    twoVideoComparisonSubmissions: number;
    singleVideoEvaluationSubmissions: number;
  };
}

export function getProgressPercentage(experiment: ExperimentWithCounts): number {
  const totalTasks = experiment._count.twoVideoComparisonTasks + experiment._count.singleVideoEvaluationTasks;
  const totalSubmissions = experiment._count.twoVideoComparisonSubmissions + experiment._count.singleVideoEvaluationSubmissions;
  
  if (totalTasks === 0) return 0;
  const evaluationsPerTask = experiment.config?.evaluationsPerComparison || -1;
  
  // Handle -1 as "not set" - return 0% progress (no target defined)
  if (evaluationsPerTask <= 0) {
    return 0;
  }
  
  const targetEvaluations = totalTasks * evaluationsPerTask;
  return Math.min((totalSubmissions / targetEvaluations) * 100, 100);
}

export function getTargetEvaluations(experiment: ExperimentWithCounts): number {
  const totalTasks = experiment._count.twoVideoComparisonTasks + experiment._count.singleVideoEvaluationTasks;
  const evaluationsPerTask = experiment.config?.evaluationsPerComparison || -1;
  
  // Handle -1 as "not set" - return 0 to avoid negative target evaluations
  if (evaluationsPerTask <= 0) {
    return 0;
  }
  
  return totalTasks * evaluationsPerTask;
}

export function getOverallProgress(experiments: ExperimentWithCounts[]): {
  totalEvaluations: number;
  totalTargetEvaluations: number;
  progressPercentage: number;
} {
  const totalEvaluations = experiments.reduce((sum, exp) => {
    return sum + exp._count.twoVideoComparisonSubmissions + exp._count.singleVideoEvaluationSubmissions;
  }, 0);
  
  const totalTargetEvaluations = experiments.reduce((sum, exp) => sum + getTargetEvaluations(exp), 0);
  
  const progressPercentage = totalTargetEvaluations > 0 
    ? Math.min((totalEvaluations / totalTargetEvaluations) * 100, 100)
    : 0;
  
  return {
    totalEvaluations,
    totalTargetEvaluations,
    progressPercentage
  };
}