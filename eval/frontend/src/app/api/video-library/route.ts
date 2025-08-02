import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  // Check authentication
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const videos = await prisma.video.findMany({
      orderBy: {
        uploadedAt: 'desc'
      }
    })
    
    return NextResponse.json(videos)
  } catch (error) {
    console.error('Error fetching video library:', error)
    return NextResponse.json(
      { error: 'Failed to fetch video library' },
      { status: 500 }
    )
  }
}