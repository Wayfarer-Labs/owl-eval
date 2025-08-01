import * as readline from 'readline';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { exec } from 'child_process';
import * as dotenv from 'dotenv';

// Load environment variables from frontend/.env.local
dotenv.config({ path: path.join(__dirname, '../frontend/.env.local') });
dotenv.config({ path: path.join(__dirname, '../frontend/.env') });

const execAsync = promisify(exec);

interface AuthData {
  refreshToken: string;
  userId: string;
  email: string;
  isAdmin: boolean;
  timestamp: number;
}

// Check if Stack Auth is configured
export function isStackAuthConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_STACK_PROJECT_ID &&
    process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY &&
    process.env.STACK_SECRET_SERVER_KEY
  );
}

// Get auth token file path
function getAuthTokenPath(): string {
  return path.join(os.homedir(), '.eval', 'auth.json');
}

// Save auth data
async function saveAuthData(data: AuthData): Promise<void> {
  const authDir = path.dirname(getAuthTokenPath());
  await fs.mkdir(authDir, { recursive: true });
  await fs.writeFile(getAuthTokenPath(), JSON.stringify(data), 'utf-8');
}

// Load auth data
async function loadAuthData(): Promise<AuthData | null> {
  try {
    const data = await fs.readFile(getAuthTokenPath(), 'utf-8');
    const auth = JSON.parse(data) as AuthData;
    
    // Check if token is older than 7 days
    const tokenAge = Date.now() - auth.timestamp;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    
    if (tokenAge > sevenDays) {
      return null;
    }
    
    return auth;
  } catch (error) {
    return null;
  }
}

// Open browser for authentication
async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  let command: string;
  
  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }
  
  try {
    await execAsync(command);
  } catch (error) {
    console.log(chalk.yellow('\nCould not open browser automatically.'));
    console.log(chalk.cyan('Please open this URL manually:'));
    console.log(chalk.blue.underline(url));
  }
}

// Authenticate user using Stack Auth CLI flow
export async function authenticateUser(): Promise<AuthData | null> {
  // Check if already authenticated
  const existingAuth = await loadAuthData();
  if (existingAuth) {
    console.log(chalk.green('✓ Using existing authentication'));
    return existingAuth;
  }
  
  console.log(chalk.blue('\n🔐 Authentication required\n'));
  
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  try {
    // Initialize CLI authentication
    const initResponse = await fetch(`${baseUrl}/api/cli-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'init' }),
    });
    
    if (!initResponse.ok) {
      throw new Error('Failed to initialize authentication');
    }
    
    const { devMode, polling_code, login_code, expires_at } = await initResponse.json();
    
    // Handle dev mode
    if (devMode) {
      return null; // Will be handled by requireAuth
    }
    
    // Open browser with login code
    const authUrl = `${baseUrl}/cli-auth?code=${login_code}`;
    console.log(chalk.cyan('Opening browser for authentication...'));
    await openBrowser(authUrl);
    
    console.log(chalk.gray('\nWaiting for authentication...'));
    console.log(chalk.gray('(Press Ctrl+C to cancel)\n'));
    
    // Poll for authentication completion
    let attempts = 0;
    const maxAttempts = 36; // 3 minutes with 5-second intervals
    
    while (attempts < maxAttempts) {
      // Wait before polling (except on first attempt)
      if (attempts > 0) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      attempts++;
      
      try {
        const pollResponse = await fetch(`${baseUrl}/api/cli-auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'poll',
            pollingCode: polling_code,
          }),
        });
        
        if (!pollResponse.ok) {
          console.error('Poll request failed:', pollResponse.status);
          continue; // Try again instead of throwing
        }
        
        const pollData = await pollResponse.json();
        
        if (pollData.status === 'completed' && pollData.refresh_token) {
          // Decode the refresh token to get user info
          const tokenData = JSON.parse(Buffer.from(pollData.refresh_token, 'base64').toString());
          
          // Save authentication data
          const authData: AuthData = {
            refreshToken: pollData.refresh_token,
            userId: tokenData.userId,
            email: tokenData.email,
            isAdmin: tokenData.isAdmin,
            timestamp: Date.now(),
          };
          
          await saveAuthData(authData);
          console.log(chalk.green('\n✓ Authentication successful!'));
          return authData;
        } else if (pollData.status === 'expired') {
          throw new Error('Authentication code expired');
        }
      } catch (pollError) {
        // Only throw if it's not a network error
        if (pollError instanceof Error && pollError.message !== 'Failed to fetch') {
          throw pollError;
        }
        // Otherwise continue polling
      }
    }
    
    throw new Error('Authentication timeout');
  } catch (error) {
    console.error(chalk.red('\n❌ Authentication failed:'), error);
    return null;
  }
}

// Wrapper for authenticated operations
export async function requireAuth<T>(
  operation: string,
  callback: (auth: AuthData) => Promise<T>,
  requireAdmin: boolean = false
): Promise<T | null> {
  // Check if Stack Auth is configured
  if (!isStackAuthConfigured()) {
    console.log(chalk.yellow.bold('\n⚠️  Development Mode'));
    console.log(chalk.yellow('Stack Auth is not configured - skipping authentication'));
    console.log(chalk.gray('Configure NEXT_PUBLIC_STACK_PROJECT_ID, NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,'));
    console.log(chalk.gray('and STACK_SECRET_SERVER_KEY environment variables for production.\n'));
    
    // Run operation without auth in dev mode
    const devAuth: AuthData = {
      refreshToken: 'dev-token',
      userId: 'dev-user',
      email: 'dev@example.com',
      isAdmin: true,
      timestamp: Date.now(),
    };
    return callback(devAuth);
  }
  
  // Authenticate user
  const auth = await authenticateUser();
  if (!auth) {
    console.log(chalk.red(`\n❌ Authentication required to ${operation}`));
    return null;
  }
  
  console.log(chalk.green(`\n✓ Authenticated as: ${auth.email}`));
  
  // Run the operation with authentication
  return callback(auth);
}

// Clear stored authentication
export async function clearAuth(): Promise<void> {
  try {
    await fs.unlink(getAuthTokenPath());
    console.log(chalk.green('✓ Authentication cleared'));
  } catch (error) {
    // File doesn't exist, that's fine
  }
}
