'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts'
import { Loader2 } from 'lucide-react'

interface EvaluationStats {
  total_comparisons: number
  total_evaluations: number
  evaluations_by_scenario: Record<string, number>
  target_evaluations_per_comparison: number
}

interface ModelPerformance {
  model: string
  dimension: string
  win_rate: number
  num_evaluations: number
}

export default function AdminPage() {
  const [stats, setStats] = useState<EvaluationStats | null>(null)
  const [performance, setPerformance] = useState<ModelPerformance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    try {
      const [statsRes, perfRes] = await Promise.all([
        fetch('/api/evaluation-stats'),
        fetch('/api/model-performance')
      ])
      const statsData = await statsRes.json()
      const perfData = await perfRes.json()
      setStats(statsData)
      setPerformance(perfData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  const scenarioData = stats ? Object.entries(stats.evaluations_by_scenario).map(([scenario, count]) => ({
    scenario,
    evaluations: count
  })) : []

  const modelData = performance.reduce((acc, item) => {
    const model = acc.find(m => m.model === item.model)
    if (model) {
      model[item.dimension] = item.win_rate * 100
    } else {
      acc.push({
        model: item.model,
        [item.dimension]: item.win_rate * 100
      })
    }
    return acc
  }, [] as any[])

  const radarData = ['overall_quality', 'controllability', 'visual_quality', 'temporal_consistency'].map(dimension => {
    const dimensionData: any = { dimension }
    performance.filter(p => p.dimension === dimension).forEach(p => {
      dimensionData[p.model] = p.win_rate * 100
    })
    return dimensionData
  })

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Evaluation Progress Dashboard</h1>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Total Comparisons</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{stats?.total_comparisons || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Total Evaluations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{stats?.total_evaluations || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Target per Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{stats?.target_evaluations_per_comparison || 5}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="scenarios" className="space-y-4">
        <TabsList>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          <TabsTrigger value="models">Model Performance</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
        </TabsList>

        <TabsContent value="scenarios">
          <Card>
            <CardHeader>
              <CardTitle>Evaluations by Scenario</CardTitle>
              <CardDescription>Distribution of evaluations across different scenarios</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scenarioData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="scenario" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="evaluations" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="models">
          <Card>
            <CardHeader>
              <CardTitle>Model Performance Comparison</CardTitle>
              <CardDescription>Win rates across evaluation dimensions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="dimension" />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} />
                    {modelData.map((model, index) => (
                      <Radar
                        key={model.model}
                        name={model.model}
                        dataKey={model.model}
                        stroke={index === 0 ? '#3b82f6' : '#ef4444'}
                        fill={index === 0 ? '#3b82f6' : '#ef4444'}
                        fillOpacity={0.6}
                      />
                    ))}
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress">
          <Card>
            <CardHeader>
              <CardTitle>Comparison Progress</CardTitle>
              <CardDescription>Evaluation completion status for each comparison</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* This would be populated with actual comparison progress data */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Forest Navigation</span>
                    <Badge>3/5</Badge>
                  </div>
                  <Progress value={60} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Desert Mining</span>
                    <Badge variant="success">5/5</Badge>
                  </div>
                  <Progress value={100} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Ocean Exploration</span>
                    <Badge variant="secondary">1/5</Badge>
                  </div>
                  <Progress value={20} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}