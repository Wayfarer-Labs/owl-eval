// Centralized Environment Configuration for OWL Evaluation Framework

interface AppConfig {
  // Database
  database: {
    url: string;
  };
  
  // Authentication
  auth: {
    stackProjectId: string;
    stackClientKey: string;
    stackServerSecret: string;
  };
  
  // Application
  app: {
    url: string;
    nodeEnv: string;
  };
  
  // Prolific - organization-specific only, no global token
  prolific?: {
    // Reserved for future use
  };
  
  // Storage
  storage: {
    dataDir: string;
    videoUploadDir: string;
    aws?: {
      accessKeyId: string;
      secretAccessKey: string;
      region: string;
      s3Bucket: string;
    };
  };
  
  // Evaluation
  evaluation: {
    targetEvaluationsPerComparison: number;
    maxVideoSizeMB: number;
    supportedVideoFormats: string[];
  };
  
  // Development
  dev: {
    debugMode: boolean;
    logLevel: string;
  };
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && !defaultValue) {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value || defaultValue!;
}

function getOptionalEnvVar(key: string): string | undefined {
  return process.env[key];
}

function getBooleanEnvVar(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

function getNumberEnvVar(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
}

export function getConfig(): AppConfig {
  return {
    database: {
      url: getEnvVar('DATABASE_URL'),
    },
    
    auth: {
      stackProjectId: getEnvVar('NEXT_PUBLIC_STACK_PROJECT_ID'),
      stackClientKey: getEnvVar('NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY'),
      stackServerSecret: getEnvVar('STACK_SECRET_SERVER_KEY'),
    },
    
    app: {
      url: getEnvVar('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
      nodeEnv: getEnvVar('NODE_ENV', 'development'),
    },
    
    // Prolific configuration removed - now organization-specific only
    
    storage: {
      dataDir: getEnvVar('DATA_DIR', './data'),
      videoUploadDir: getEnvVar('VIDEO_UPLOAD_DIR', './uploads/videos'),
      aws: process.env.AWS_ACCESS_KEY_ID ? {
        accessKeyId: getEnvVar('AWS_ACCESS_KEY_ID'),
        secretAccessKey: getEnvVar('AWS_SECRET_ACCESS_KEY'),
        region: getEnvVar('AWS_REGION', 'us-east-1'),
        s3Bucket: getEnvVar('AWS_S3_BUCKET'),
      } : undefined,
    },
    
    evaluation: {
      targetEvaluationsPerComparison: getNumberEnvVar('TARGET_EVALUATIONS_PER_COMPARISON', -1),
      maxVideoSizeMB: getNumberEnvVar('MAX_VIDEO_SIZE_MB', 100),
      supportedVideoFormats: getEnvVar('SUPPORTED_VIDEO_FORMATS', 'mp4,webm,mov').split(','),
    },
    
    dev: {
      debugMode: getBooleanEnvVar('DEBUG_MODE', false),
      logLevel: getEnvVar('LOG_LEVEL', 'info'),
    },
  };
}

// Validation function
export function validateConfig(): void {
  try {
    getConfig();
  } catch (error) {
    console.error('Configuration validation failed:', error);
    process.exit(1);
  }
}