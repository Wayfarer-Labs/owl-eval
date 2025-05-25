import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2 } from 'lucide-react'

export default function ThankYouPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardContent className="text-center py-12">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-4">Thank You!</h1>
          <p className="text-lg text-muted-foreground mb-6">
            Your evaluation has been successfully submitted.
          </p>
          <p className="mb-8">
            Thank you for participating in the Matrix-Game evaluation study. 
            Your feedback is invaluable in helping us improve AI-generated game worlds.
          </p>
          <Link href="/">
            <Button size="lg">
              Evaluate Another Video
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}