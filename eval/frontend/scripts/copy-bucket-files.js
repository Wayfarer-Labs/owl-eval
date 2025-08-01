const { S3Client, ListObjectsV2Command, CopyObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env files
function loadEnvFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const envContent = fs.readFileSync(filePath, 'utf8')
      envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=')
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim()
          if (!process.env[key]) { // Don't override existing env vars
            process.env[key] = value
          }
        }
      })
      console.log(`✅ Loaded environment from: ${filePath}`)
    }
  } catch (error) {
    console.log(`⚠️  Could not load ${filePath}: ${error.message}`)
  }
}

// Load .env files in order of preference
loadEnvFile(path.join(__dirname, '../.env.local'))
loadEnvFile(path.join(__dirname, '../.env.development'))
loadEnvFile(path.join(__dirname, '../.env'))

const client = new S3Client({
  endpoint: process.env.AWS_ENDPOINT_URL_S3 || 'https://t3.storage.dev',
  region: process.env.AWS_REGION || 'auto',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
})

const sourceBucket = 'gary-owl-eval' // Production bucket
const targetBucket = process.env.TIGRIS_BUCKET_NAME || 'gary-owl-eval-dev' // Dev bucket

async function checkObjectExists(bucket, key) {
  try {
    await client.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: key
    }))
    return true
  } catch (error) {
    if (error.name === 'NotFound') {
      return false
    }
    throw error
  }
}

async function copyFiles(prefix = '', skipExisting = true) {
  try {
    console.log(`\nCopying files from ${sourceBucket} to ${targetBucket}`)
    console.log(`Prefix filter: ${prefix || '(all files)'}`)
    console.log(`Skip existing: ${skipExisting}`)
    console.log(`Endpoint: ${process.env.AWS_ENDPOINT_URL_S3}`)
    
    // Check required environment variables
    const requiredVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
    const missingVars = requiredVars.filter(varName => !process.env[varName])
    
    if (missingVars.length > 0) {
      console.error(`\n❌ Missing required environment variables: ${missingVars.join(', ')}`)
      process.exit(1)
    }
    
    let continuationToken
    let totalFiles = 0
    let copiedFiles = 0
    let skippedFiles = 0
    
    do {
      // List objects in source bucket
      const listCommand = new ListObjectsV2Command({
        Bucket: sourceBucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 100
      })
      
      const listResponse = await client.send(listCommand)
      
      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        console.log('No files found to copy')
        break
      }
      
      console.log(`\nProcessing ${listResponse.Contents.length} files...`)
      
      for (const object of listResponse.Contents) {
        const key = object.Key
        totalFiles++
        
        // Check if file already exists in target bucket
        if (skipExisting) {
          const exists = await checkObjectExists(targetBucket, key)
          if (exists) {
            console.log(`⏭️  Skipping existing file: ${key}`)
            skippedFiles++
            continue
          }
        }
        
        try {
          // Copy object to target bucket
          const copyCommand = new CopyObjectCommand({
            Bucket: targetBucket,
            Key: key,
            CopySource: `${sourceBucket}/${key}`,
            MetadataDirective: 'COPY'
          })
          
          await client.send(copyCommand)
          console.log(`✅ Copied: ${key}`)
          copiedFiles++
          
        } catch (copyError) {
          console.error(`❌ Failed to copy ${key}:`, copyError.message)
        }
      }
      
      continuationToken = listResponse.NextContinuationToken
      
    } while (continuationToken)
    
    console.log(`\n📊 Copy Summary:`)
    console.log(`   Total files processed: ${totalFiles}`)
    console.log(`   Files copied: ${copiedFiles}`)
    console.log(`   Files skipped: ${skippedFiles}`)
    console.log(`   Source bucket: ${sourceBucket}`)
    console.log(`   Target bucket: ${targetBucket}`)
    
    if (copiedFiles > 0) {
      console.log(`\n✅ Successfully copied ${copiedFiles} files!`)
    } else {
      console.log(`\n📝 No new files to copy.`)
    }
    
  } catch (error) {
    console.error('❌ Failed to copy files:', error)
    
    if (error.name === 'NoSuchBucket') {
      console.log(`\n💡 One of the buckets doesn't exist:`)
      console.log(`   Source: ${sourceBucket}`)
      console.log(`   Target: ${targetBucket}`)
    } else if (error.name === 'InvalidAccessKeyId') {
      console.log('\n💡 Check your AWS_ACCESS_KEY_ID in .env file')
    } else if (error.name === 'SignatureDoesNotMatch') {
      console.log('\n💡 Check your AWS_SECRET_ACCESS_KEY in .env file')
    } else if (error.name === 'AccessDenied') {
      console.log('\n💡 Check bucket permissions - you may need read access to source bucket')
    }
    
    process.exit(1)
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const prefix = args.find(arg => arg.startsWith('--prefix='))?.split('=')[1] || ''
const forceOverwrite = args.includes('--force')

console.log(`🚀 Starting bucket copy operation...`)
console.log(`📁 Source: ${sourceBucket}`)
console.log(`📁 Target: ${targetBucket}`)

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node copy-bucket-files.js [options]

Options:
  --prefix=PATH     Only copy files with this prefix (e.g. --prefix=video-library/)
  --force          Overwrite existing files (default: skip existing)
  --help, -h       Show this help message

Examples:
  node copy-bucket-files.js                           # Copy all files, skip existing
  node copy-bucket-files.js --force                   # Copy all files, overwrite existing
  node copy-bucket-files.js --prefix=video-library/   # Copy only video-library files
`)
  process.exit(0)
}

copyFiles(prefix, !forceOverwrite)