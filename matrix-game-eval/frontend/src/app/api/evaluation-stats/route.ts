import { NextResponse } from 'next/server'
import { ABTestingFramework } from '@/lib/evaluation/ab-testing'
import { getConfig } from '@/lib/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const config = getConfig()
    const framework = new ABTestingFramework(config.outputDir)
    
    const comparisons = await framework.getAllComparisons()
    const evaluationsByScenario: Record<string, number> = {}
    let totalEvaluations = 0
    
    for (const comparison of comparisons) {
      const results = await framework.getResultsForComparison(comparison.comparison_id)
      const scenario = comparison.scenario_id
      
      if (!evaluationsByScenario[scenario]) {
        evaluationsByScenario[scenario] = 0
      }
      
      evaluationsByScenario[scenario] += results.length
      totalEvaluations += results.length
    }
    
    return NextResponse.json({
      total_comparisons: comparisons.length,
      total_evaluations: totalEvaluations,
      evaluations_by_scenario: evaluationsByScenario,
      target_evaluations_per_comparison: config.targetEvaluationsPerComparison || 5
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json({ error: 'Failed to fetch statistics' }, { status: 500 })
  }
}