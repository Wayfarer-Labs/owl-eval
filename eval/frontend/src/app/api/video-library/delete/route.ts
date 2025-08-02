import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3'

// Configure S3 client for Tigris
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'auto',
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true
})

export async function DELETE(request: NextRequest) {
  // Check authentication
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { keys } = await request.json()

    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json(
        { error: 'No video keys provided' },
        { status: 400 }
      )
    }

    // Get video records from database to get their keys
    const videos = await prisma.video.findMany({
      where: {
        key: {
          in: keys
        }
      }
    })

    if (videos.length === 0) {
      return NextResponse.json(
        { error: 'No matching videos found' },
        { status: 404 }
      )
    }

    // Validate that all keys are in the video-library prefix for security
    const validKeys = videos.map(v => v.key).filter(key => key.startsWith('video-library/'))
    
    if (validKeys.length === 0) {
      return NextResponse.json(
        { error: 'No valid video library keys found' },
        { status: 400 }
      )
    }

    // Delete from S3 first
    const s3Command = new DeleteObjectsCommand({
      Bucket: require('@/lib/storage').getBucketName(),
      Delete: {
        Objects: validKeys.map(key => ({ Key: key })),
        Quiet: false
      }
    })

    const s3Response = await s3Client.send(s3Command)

    // Delete from database
    const dbResult = await prisma.video.deleteMany({
      where: {
        key: {
          in: validKeys
        }
      }
    })

    return NextResponse.json({ 
      success: true,
      deleted: dbResult.count,
      s3Deleted: s3Response.Deleted?.length || 0,
      s3Errors: s3Response.Errors || []
    })
  } catch (error) {
    console.error('Error deleting videos:', error)
    return NextResponse.json(
      { error: 'Failed to delete videos' },
      { status: 500 }
    )
  }
}