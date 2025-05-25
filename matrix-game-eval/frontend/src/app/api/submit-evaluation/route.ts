import { NextResponse } from 'next/server'
import { ABTestingFramework } from '@/lib/evaluation/ab-testing'
import { getConfig } from '@/lib/config'

export async function POST(request: Request) {
  try {
    const data = await request.json()
    
    if (!data.comparison_id) {
      return NextResponse.json({ error: 'Missing comparison_id' }, { status: 400 })
    }
    
    const config = getConfig()
    const framework = new ABTestingFramework(config.outputDir)
    
    const result = await framework.recordEvaluationResult({
      comparison_id: data.comparison_id,
      evaluator_id: data.evaluator_id || 'anonymous',
      dimension_scores: data.dimension_scores || {},
      detailed_ratings: data.detailed_ratings || {},
      completion_time_seconds: data.completion_time_seconds || 0
    })
    
    return NextResponse.json({
      success: true,
      result_id: result.result_id
    })
  } catch (error) {
    console.error('Error submitting evaluation:', error)
    return NextResponse.json({ error: 'Failed to submit evaluation' }, { status: 500 })
  }
}