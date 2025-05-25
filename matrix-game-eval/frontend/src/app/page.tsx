'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'

interface Comparison {
  comparison_id: string
  scenario_id: string
  created_at: string
  num_evaluations: number
  evaluation_url: string
}

export default function Home() {
  const [comparisons, setComparisons] = useState<Comparison[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchComparisons()
  }, [])

  const fetchComparisons = async () => {
    try {
      const response = await fetch('/api/comparisons')
      const data = await response.json()
      setComparisons(data)
    } catch (error) {
      console.error('Error fetching comparisons:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Welcome to the Matrix-Game Evaluation Study</CardTitle>
          <CardDescription>
            Evaluate AI-generated Minecraft gameplay videos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            You will be evaluating AI-generated Minecraft gameplay videos. Each evaluation involves
            comparing two videos side-by-side and determining which one performs better across
            several quality dimensions.
          </p>
          
          <div className="bg-secondary p-4 rounded-lg">
            <h3 className="font-semibold mb-2">What You&apos;ll Be Doing:</h3>
            <ol className="list-decimal list-inside space-y-1">
              <li>Watch two short videos (approximately 4 seconds each) side by side</li>
              <li>Compare them across four dimensions:
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li><strong>Overall Quality</strong> - General realism and believability</li>
                  <li><strong>Controllability</strong> - How well the character follows commands</li>
                  <li><strong>Visual Quality</strong> - Clarity and aesthetic appeal</li>
                  <li><strong>Temporal Consistency</strong> - Smoothness and stability over time</li>
                </ul>
              </li>
              <li>Select which video performs better for each dimension</li>
            </ol>
          </div>

          <div className="bg-muted p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Important Notes:</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Each evaluation takes approximately 2-3 minutes</li>
              <li>Please watch both videos completely before making your judgments</li>
              <li>There are no right or wrong answers - we want your honest opinion</li>
              <li>Use a modern browser (Chrome, Firefox, Safari) for best experience</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available Evaluations</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : comparisons.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No evaluations available at the moment.
            </p>
          ) : (
            <div className="space-y-2">
              {comparisons.map((comparison) => (
                <Link
                  key={comparison.comparison_id}
                  href={`/evaluate/${comparison.comparison_id}`}
                >
                  <Card className="cursor-pointer hover:bg-accent transition-colors">
                    <CardContent className="flex items-center justify-between py-4">
                      <div>
                        <p className="font-medium">Scenario: {comparison.scenario_id}</p>
                        <p className="text-sm text-muted-foreground">
                          Created: {new Date(comparison.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="secondary">
                          {comparison.num_evaluations} evaluations
                        </Badge>
                        <Button size="sm">Evaluate</Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}