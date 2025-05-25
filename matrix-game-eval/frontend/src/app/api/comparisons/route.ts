import { NextResponse } from 'next/server'
import { ABTestingFramework } from '@/lib/evaluation/ab-testing'
import { getConfig } from '@/lib/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const config = getConfig()
    const framework = new ABTestingFramework(config.outputDir)
    
    const comparisons = await framework.getAllComparisons()
    
    const comparisonList = await Promise.all(
      comparisons.map(async (comparison) => {
        const results = await framework.getResultsForComparison(comparison.comparison_id)
        return {
          comparison_id: comparison.comparison_id,
          scenario_id: comparison.scenario_id,
          created_at: comparison.created_at,
          num_evaluations: results.length,
          evaluation_url: `/evaluate/${comparison.comparison_id}`
        }
      })
    )
    
    return NextResponse.json(comparisonList)
  } catch (error) {
    console.error('Error fetching comparisons:', error)
    return NextResponse.json({ error: 'Failed to fetch comparisons' }, { status: 500 })
  }
}