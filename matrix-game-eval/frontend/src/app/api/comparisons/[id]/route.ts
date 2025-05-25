import { NextResponse } from 'next/server'
import { ABTestingFramework } from '@/lib/evaluation/ab-testing'
import { getConfig } from '@/lib/config'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const config = getConfig()
    const framework = new ABTestingFramework(config.outputDir)
    
    const comparison = await framework.getComparison(params.id)
    
    if (!comparison) {
      return NextResponse.json({ error: 'Comparison not found' }, { status: 404 })
    }
    
    return NextResponse.json(comparison.toJSON())
  } catch (error) {
    console.error('Error fetching comparison:', error)
    return NextResponse.json({ error: 'Failed to fetch comparison' }, { status: 500 })
  }
}