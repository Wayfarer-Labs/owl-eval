import { NextResponse } from 'next/server'
import { EvaluationAnalyzer } from '@/lib/analysis/analyzer'
import { ABTestingFramework } from '@/lib/evaluation/ab-testing'
import { getConfig } from '@/lib/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const config = getConfig()
    const framework = new ABTestingFramework(config.outputDir)
    const analyzer = new EvaluationAnalyzer(framework)
    
    const performance = await analyzer.calculateModelPerformance()
    
    return NextResponse.json(performance)
  } catch (error) {
    console.error('Error calculating performance:', error)
    return NextResponse.json([])
  }
}