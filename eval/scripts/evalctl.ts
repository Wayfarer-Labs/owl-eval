#!/usr/bin/env tsx

// Load environment variables FIRST before ANY imports
import * as dotenv from 'dotenv';

const env = process.env.EVALCTL_ENV || 'development';
dotenv.config({ path: `.env.${env}` });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { Command } from 'commander';
import * as readline from 'readline';
import { promisify } from 'util';
import * as path from 'path';
import chalk from 'chalk';

import { generateSlug, isValidSlug, slugify } from '../frontend/src/lib/utils/slug';
import { requireAuth, clearAuth } from './auth';
import { prisma } from './prisma-client';
import { ProlificService } from '../frontend/src/lib/services/prolific';
// Don't import ExperimentService - it uses frontend prisma client
// import { ExperimentService } from '../frontend/src/lib/experiment-service';
import { getUserOrganizations } from './cli-organization';
import { uploadVideoToTigris } from '../frontend/src/lib/storage';

// Show environment info for non-help commands
const isHelpCommand = process.argv.includes('--help') || process.argv.includes('-h');
if (!isHelpCommand && process.argv.length > 2) {
  console.log(chalk.gray(`[${env.toUpperCase()}] Using .env.${env}`));
}

// Ensure DATABASE_URL is available
if (!process.env.DATABASE_URL) {
  console.error(chalk.red('❌ DATABASE_URL not found in environment variables'));
  console.error(chalk.yellow('💡 Make sure .env.development or .env.local contains DATABASE_URL'));
  process.exit(1);
}

// Get base URL for API calls - automatically determined by EVALCTL_ENV
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 
         process.env.NEXT_PUBLIC_BASE_URL || 
         'http://localhost:3000';
}


// Create readline interface lazily to avoid conflicts with auth
let rl: readline.Interface | null = null;
let question: (prompt: string) => Promise<string>;

function getReadline() {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    question = promisify(rl.question).bind(rl);
  }
  return { rl, question };
}

// Helper function to select organization for CLI operations
async function selectOrganization(auth: any): Promise<string> {
  const userOrganizations = await getUserOrganizations(auth.id);
  
  if (userOrganizations.length === 0) {
    console.log(chalk.red('❌ No organizations found. You need to create or join an organization first.'));
    process.exit(1);
  }
  
  if (userOrganizations.length === 1) {
    const org = userOrganizations[0].organization;
    console.log(chalk.gray(`Using organization: ${chalk.cyan(org.name)} (${org.slug})`));
    return org.id;
  }
  
  // Multiple organizations - let user choose
  console.log(chalk.blue('\n📋 Select an organization:\n'));
  userOrganizations.forEach((membership, index) => {
    const org = membership.organization;
    console.log(chalk.white(`${index + 1}. ${org.name} (${org.slug}) - ${membership.role}`));
  });
  
  const { rl: readlineInterface, question } = getReadline();
  const choice = await question(chalk.cyan('\nEnter organization number: '));
  const index = parseInt(choice) - 1;
  
  // Close readline interface and reset global variable
  readlineInterface.close();
  rl = null;
  
  if (index < 0 || index >= userOrganizations.length) {
    console.log(chalk.red('❌ Invalid selection'));
    process.exit(1);
  }
  
  const selectedOrg = userOrganizations[index].organization;
  console.log(chalk.gray(`Selected: ${chalk.cyan(selectedOrg.name)}\n`));
  return selectedOrg.id;
}

const program = new Command();

program
  .name('evalctl')
  .description('CLI for managing evaluation experiments')
  .version('1.0.0');

// Create new experiment command
program
  .command('create')
  .description('Create a new experiment interactively')
  .option('-n, --name <name>', 'Experiment name')
  .option('-s, --slug <slug>', 'URL-friendly slug (auto-generated if not provided)')
  .option('-d, --description <description>', 'Experiment description')
  .option('-g, --group <group>', 'Experiment group for organization')
  .action(async (options) => {
    await requireAuth('create experiments', async (auth) => {
      console.log(chalk.blue.bold('\n🧪 Creating a new experiment\n'));

      let rl: readline.Interface | null = null;
      try {
        // Get organization first
        const organizationId = await selectOrganization(auth);
        
        const { rl: readlineInterface, question } = getReadline();
        rl = readlineInterface;
      
      // Interactive prompts
      const name = options.name || await question(chalk.cyan('Experiment name: '));
      
      let slug = options.slug;
      if (!slug) {
        const suggestedSlug = generateSlug();
        const useGenerated = await question(
          chalk.cyan(`Slug (press Enter for "${chalk.yellow(suggestedSlug)}"): `)
        );
        slug = useGenerated || suggestedSlug;
      }
      
      // Validate slug
      if (!isValidSlug(slug)) {
        console.log(chalk.red('Invalid slug. Converting to valid format...'));
        slug = slugify(slug);
      }
      
      const description = options.description || 
        await question(chalk.cyan('Description (optional): '));
      
      const group = options.group || 
        await question(chalk.cyan('Group (optional): '));
      
      // Evaluation mode selection
      console.log(chalk.blue('\n⚖️  Evaluation Mode'));
      console.log(chalk.gray('1. Comparison Mode (A vs B) - Compare two videos side-by-side'));
      console.log(chalk.gray('2. Single Video Mode (Absolute Rating) - Rate individual videos 1-5 scale'));
      const modeInput = await question(chalk.cyan('Select evaluation mode (1 or 2): '));
      const evaluationMode = modeInput === '2' ? 'single_video' : 'comparison';
      
      // Scenario configuration only - models will be auto-discovered from videos
      console.log(chalk.blue('\n📊 Scenario Configuration'));
      
      let scenarios: string[] = [];
      
      // Scenario configuration
      const scenariosInput = await question(
        chalk.cyan('Scenarios (comma-separated, e.g., "forest,desert,ocean"): ')
      );
      scenarios = scenariosInput.split(',').map((s: string) => s.trim());
      
      // Create experiment
      const experiment = await prisma.experiment.create({
        data: {
          name,
          slug,
          description: description || null,
          group: group || null,
          status: 'draft',
          evaluationMode,
          organizationId,  // Add missing organizationId
          createdBy: auth.userId,
          config: {
            scenarios,
            // Models will be auto-discovered from uploaded videos during task creation
            dimensions: [
              'overall_quality',
              'controllability',
              'visual_quality',
              'temporal_consistency'
            ]
          }
        }
      });
      
      console.log(chalk.green.bold('\n✅ Experiment created successfully!\n'));
      console.log(chalk.white('ID:'), chalk.yellow(experiment.id));
      console.log(chalk.white('Slug:'), chalk.yellow(experiment.slug));
      console.log(chalk.white('Status:'), chalk.yellow(experiment.status));
      console.log(chalk.white('Mode:'), chalk.yellow(experiment.evaluationMode));
      if (experiment.group) {
        console.log(chalk.white('Group:'), chalk.yellow(experiment.group));
      }
      console.log(chalk.white('\nEvaluation URL:'), 
        chalk.blue.underline(`${getBaseUrl().replace('http://', '').replace('https://', '')}/evaluate/${experiment.slug}`));
      
      console.log(chalk.gray('\nNext steps:'));
      console.log(chalk.gray('1. Upload videos using: ./evalctl upload-videos --dir <directory>'));
      if (experiment.evaluationMode === 'single_video') {
        console.log(chalk.gray('2. Create video tasks using: ./evalctl create-video-tasks --experiment <slug>'));
      } else {
        console.log(chalk.gray('2. Assign videos using: ./evalctl assign-videos --experiment <slug>'));
      }
      console.log(chalk.gray('3. Launch experiment using: ./evalctl launch'));
      
      } catch (error) {
        console.error(chalk.red('Error creating experiment:'), error);
      } finally {
        // Clean up readline interface
        if (rl) {
          rl.close();
        }
        await prisma.$disconnect();
      }
    }, true); // Require admin permissions
  });

// List experiments command
program
  .command('list')
  .description('List experiments in your organization')
  .option('-s, --status <status>', 'Filter by status (draft, active, completed, archived)')
  .option('-g, --group <group>', 'Filter by group')
  .option('--include-anonymous', 'Include anonymous participants in counts')
  .action(async (options) => {
    await requireAuth('list experiments', async (auth) => {
      try {
        const organizationId = await selectOrganization(auth);
        
        // Get experiments first to check which have Prolific integration
        const experimentsForFilter = await prisma.experiment.findMany({
          where: {
            organizationId,
            archived: false,
            ...(options.group && { group: options.group }),
          },
          select: {
            id: true,
            prolificStudyId: true
          }
        });
        
        // Build participant filter based on includeAnonymous setting and Prolific integration
        // For Prolific experiments, only count approved participants
        // For non-Prolific experiments, count active/completed/approved participants
        const participantFilter = options.includeAnonymous ? {
          AND: [
            {
              OR: experimentsForFilter.map(exp => ({
                AND: [
                  { experimentId: exp.id },
                  {
                    status: {
                      in: exp.prolificStudyId ? ['approved'] : ['active', 'completed', 'approved']
                    }
                  }
                ]
              }))
            },
            {
              OR: [
                { prolificId: { not: null } },  // Prolific participants
                { sessionId: { startsWith: 'anon-session-' } }  // Anonymous participants
              ]
            }
          ]
        } : {
          AND: [
            {
              id: {
                not: {
                  startsWith: 'anon-session-'
                }
              }
            },
            {
              OR: experimentsForFilter.map(exp => ({
                AND: [
                  { experimentId: exp.id },
                  {
                    status: {
                      in: exp.prolificStudyId ? ['approved'] : ['active', 'completed', 'approved']
                    }
                  }
                ]
              }))
            },
            {
              prolificId: { not: null }  // Only Prolific participants, exclude anonymous
            }
          ]
        };
        
        const experiments = await prisma.experiment.findMany({
          where: {
            organizationId,
            archived: false,
            ...(options.group && { group: options.group }),
          },
          include: {
            _count: {
              select: {
                twoVideoComparisonTasks: true,
                singleVideoEvaluationTasks: true,
                participants: {
                  where: participantFilter
                },
                twoVideoComparisonSubmissions: true,
                singleVideoEvaluationSubmissions: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        });
      
      console.log(chalk.blue.bold('\n📋 Experiments\n'));
      
      if (experiments.length === 0) {
        console.log(chalk.gray('No experiments found.'));
      } else {
        experiments.forEach((exp) => {
          const statusColor = {
            draft: 'gray',
            active: 'green',
            completed: 'blue',
            archived: 'red'
          }[exp.status] || 'white';
          
          console.log(chalk.bold.white(`${exp.name} (${exp.slug})`));
          console.log(chalk[statusColor](`  Status: ${exp.status}`));
          console.log(chalk.blue(`  Mode: ${exp.evaluationMode}`));
          if (exp.group) {
            console.log(chalk.gray(`  Group: ${exp.group}`));
          }
          console.log(chalk.gray(`  Created: ${exp.createdAt.toLocaleDateString()}`));
          
          if (exp.evaluationMode === 'single_video') {
            console.log(chalk.gray(`  Single Video Tasks: ${exp._count.singleVideoEvaluationTasks}`));
            console.log(chalk.gray(`  Single Video Submissions: ${exp._count.singleVideoEvaluationSubmissions}`));
          } else {
            console.log(chalk.gray(`  Two Video Comparison Tasks: ${exp._count.twoVideoComparisonTasks}`));
            console.log(chalk.gray(`  Two Video Comparison Submissions: ${exp._count.twoVideoComparisonSubmissions}`));
          }
          console.log(chalk.gray(`  Participants: ${exp._count.participants}`));
          
          if (exp.prolificStudyId) {
            console.log(chalk.cyan(`  Prolific Study: ${exp.prolificStudyId}`));
          }
          console.log();
        });
      }
      } catch (error) {
        console.error(chalk.red('Error listing experiments:'), error);
      } finally {
        await prisma.$disconnect();
      }
    });
  });

// Launch experiment command
program
  .command('launch <slug>')
  .description('Launch an experiment (change status to active and optionally create Prolific study)')
  .option('-p, --prolific', 'Create a Prolific study')
  .option('--prolific-title <title>', 'Prolific study title')
  .option('--prolific-description <description>', 'Prolific study description')
  .option('--prolific-reward <reward>', 'Reward per participant (USD)', '8.00')
  .option('--prolific-participants <count>', 'Number of participants', '50')
  .action(async (slug, options) => {
    await requireAuth('launch experiments', async (auth) => {
      try {
        // First get the experiment
        const experiment = await prisma.experiment.findUnique({
          where: { slug },
          include: {
            _count: {
              select: {
                twoVideoComparisonTasks: true
              }
            }
          }
        });
        
        if (!experiment) {
          console.log(chalk.red(`Experiment "${slug}" not found`));
          return;
        }
        
        let prolificStudyId: string | null = null;
        let prolificUrl: string | null = null;
        
        // Create Prolific study if requested
        if (options.prolific) {
          console.log(chalk.blue('\n🌐 Creating Prolific study...\n'));
          
          try {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL;
            if (!baseUrl) {
              throw new Error('NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_BASE_URL, or BASE_URL must be set');
            }
            
            const prolificData = {
              experimentId: experiment.id,
              title: options.prolificTitle || `Evaluate ${experiment.name}`,
              description: options.prolificDescription || `Help us evaluate AI model outputs for ${experiment.name}`,
              reward: parseFloat(options.prolificReward),
              totalParticipants: parseInt(options.prolificParticipants)
            };
            
            const response = await fetch(`${baseUrl}/api/prolific/studies`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(prolificData)
            });
            
            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || 'Failed to create Prolific study');
            }
            
            const result = await response.json();
            prolificStudyId = result.studyId;
            prolificUrl = `https://app.prolific.co/researcher/studies/${prolificStudyId}`;
            
            console.log(chalk.green('✅ Prolific study created successfully!'));
            console.log(chalk.white('Study ID:'), chalk.cyan(prolificStudyId));
            
          } catch (error) {
            console.log(chalk.red('❌ Failed to create Prolific study:'), error.message);
            console.log(chalk.gray('You can create it manually later through the admin interface.'));
          }
        }
        
        // Update experiment status
        const updateData: any = { 
          status: 'active', 
          startedAt: new Date()
        };
        
        if (prolificStudyId) {
          updateData.prolificStudyId = prolificStudyId;
        }
        
        const updatedExperiment = await prisma.experiment.update({
          where: { slug },
          data: updateData,
        });
        
        console.log(chalk.green.bold('\n🚀 Experiment launched!\n'));
        console.log(chalk.white('Name:'), chalk.yellow(updatedExperiment.name));
        console.log(chalk.white('Status:'), chalk.green('active'));
        console.log(chalk.white('Started:'), chalk.yellow(updatedExperiment.startedAt?.toLocaleString()));
        
        if (updatedExperiment.prolificStudyId) {
          const studyUrl = prolificUrl || `https://app.prolific.co/researcher/studies/${updatedExperiment.prolificStudyId}`;
          console.log(chalk.white('\nProlific Study:'), chalk.cyan.underline(studyUrl));
        }
        
        const evaluationUrl = `https://${process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL}/evaluate/${updatedExperiment.slug}`;
        console.log(chalk.white('Evaluation URL:'), chalk.blue.underline(evaluationUrl));
        
      } catch (error) {
        console.error(chalk.red('Error launching experiment:'), error);
      } finally {
        await prisma.$disconnect();
      }
    }, true); // Require admin permissions
  });

// Complete experiment command
program
  .command('complete <slug>')
  .description('Mark an experiment as completed')
  .action(async (slug) => {
    await requireAuth('complete experiments', async () => {
      try {
        const experiment = await prisma.experiment.update({
        where: { slug },
        data: { 
          status: 'completed',
          completedAt: new Date()
        },
      });
      
      console.log(chalk.green.bold('\n✅ Experiment completed!\n'));
      console.log(chalk.white('Name:'), chalk.yellow(experiment.name));
        console.log(chalk.white('Completed:'), chalk.yellow(experiment.completedAt?.toLocaleString()));
        
      } catch (error) {
        console.error(chalk.red('Error completing experiment:'), error);
      } finally {
        await prisma.$disconnect();
      }
    }, true); // Require admin permissions
  });

// Stats command
program
  .command('stats <slug>')
  .description('Show experiment statistics')
  .action(async (slug) => {
    await requireAuth('view experiment stats', async () => {
      try {
        // First get experiment to check if it has Prolific integration
        const baseExperiment = await prisma.experiment.findUnique({
          where: { slug },
          select: {
            id: true,
            name: true,
            status: true,
            evaluationMode: true,
            prolificStudyId: true,
            config: true,
            createdAt: true,
            startedAt: true,
            completedAt: true
          }
        });
        
        if (!baseExperiment) {
          console.log(chalk.red('Experiment not found'));
          return;
        }
        
        // Determine participant status filter based on Prolific integration
        const participantStatusFilter = baseExperiment.prolificStudyId 
          ? ['approved']  // For Prolific experiments, only count approved
          : ['active', 'completed', 'approved'];  // For non-Prolific experiments, count all valid statuses
        
        const experiment = await prisma.experiment.findUnique({
        where: { slug },
        include: {
          _count: {
            select: {
              twoVideoComparisonTasks: true,
              singleVideoEvaluationTasks: true,
              participants: {
                where: {
                  AND: [
                    {
                      status: {
                        in: participantStatusFilter
                      }
                    },
                    {
                      prolificId: { not: null }  // Only Prolific participants, exclude anonymous
                    }
                  ]
                }
              },
              twoVideoComparisonSubmissions: true,
              singleVideoEvaluationSubmissions: true,
            }
          },
          twoVideoComparisonSubmissions: {
            select: {
              dimensionScores: true,
              completionTimeSeconds: true,
            }
          },
          singleVideoEvaluationSubmissions: {
            select: {
              dimensionScores: true,
              completionTimeSeconds: true,
            }
          }
        }
      });
      
      if (!experiment) {
        console.log(chalk.red('Experiment not found'));
        return;
      }
      
      console.log(chalk.blue.bold(`\n📊 Statistics for "${experiment.name}"\n`));
      console.log(chalk.white('Status:'), chalk.yellow(experiment.status));
      console.log(chalk.white('Mode:'), chalk.yellow(experiment.evaluationMode));
      console.log(chalk.white('Total Participants:'), chalk.yellow(experiment._count.participants));
      
      if (experiment.evaluationMode === 'single_video') {
        console.log(chalk.white('Total Single Video Tasks:'), chalk.yellow(experiment._count.singleVideoEvaluationTasks));
        console.log(chalk.white('Total Single Video Submissions:'), chalk.yellow(experiment._count.singleVideoEvaluationSubmissions));
        
        if (experiment._count.singleVideoEvaluationTasks > 0) {
          const avgEvaluationsPerTask = 
            experiment._count.singleVideoEvaluationSubmissions / experiment._count.singleVideoEvaluationTasks;
          console.log(chalk.white('Avg Evaluations/Task:'), 
            chalk.yellow(avgEvaluationsPerTask.toFixed(2)));
        }
        
        if (experiment.singleVideoEvaluationSubmissions.length > 0) {
          const avgCompletionTime = experiment.singleVideoEvaluationSubmissions
            .filter(e => e.completionTimeSeconds)
            .reduce((sum, e) => sum + (e.completionTimeSeconds || 0), 0) / 
            experiment.singleVideoEvaluationSubmissions.filter(e => e.completionTimeSeconds).length;
          
          console.log(chalk.white('Avg Completion Time:'), 
            chalk.yellow(`${(avgCompletionTime / 60).toFixed(1)} minutes`));
        }
      } else {
        console.log(chalk.white('Total Two Video Comparison Tasks:'), chalk.yellow(experiment._count.twoVideoComparisonTasks));
        console.log(chalk.white('Total Two Video Comparison Submissions:'), chalk.yellow(experiment._count.twoVideoComparisonSubmissions));
        
        if (experiment._count.twoVideoComparisonTasks > 0) {
          const avgEvaluationsPerComparison = 
            experiment._count.twoVideoComparisonSubmissions / experiment._count.twoVideoComparisonTasks;
          console.log(chalk.white('Avg Evaluations/Comparison:'), 
            chalk.yellow(avgEvaluationsPerComparison.toFixed(2)));
        }
        
        if (experiment.twoVideoComparisonSubmissions.length > 0) {
          const avgCompletionTime = experiment.twoVideoComparisonSubmissions
            .filter(e => e.completionTimeSeconds)
            .reduce((sum, e) => sum + (e.completionTimeSeconds || 0), 0) / 
            experiment.twoVideoComparisonSubmissions.filter(e => e.completionTimeSeconds).length;
          
          console.log(chalk.white('Avg Completion Time:'), 
            chalk.yellow(`${(avgCompletionTime / 60).toFixed(1)} minutes`));
        }
      }
        
      } catch (error) {
        console.error(chalk.red('Error getting stats:'), error);
      } finally {
        await prisma.$disconnect();
      }
    }, true); // Require admin permissions
  });

// List video library command with enhanced filtering
program
  .command('list-videos')
  .description('List all videos in the video library')
  .option('--model <model>', 'Filter by model name')
  .option('--scenario <scenario>', 'Filter by scenario')
  .option('--tag <tag>', 'Filter by tag')
  .option('--group <group>', 'Filter by group')
  .action(async (options) => {
    await requireAuth('list videos', async () => {
      try {
        console.log(chalk.blue.bold('\n📹 Video Library\n'));
        
        // Use new videos API with metadata support
        let url = `${getBaseUrl()}/api/videos`;
        const params = new URLSearchParams();
        
        if (options.model) params.append('model', options.model);
        if (options.scenario) params.append('scenario', options.scenario);
        if (options.tag) params.append('tag', options.tag);
        if (options.group) params.append('group', options.group);
        
        if (params.toString()) {
          url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        const videos = await response.json();
        
        if (videos.length === 0) {
          console.log(chalk.gray('No videos found in library.'));
          console.log(chalk.gray('Upload videos using: ./evalctl upload-videos --dir <directory>'));
          return;
        }
        
        console.log(chalk.white(`Found ${videos.length} videos:\n`));
        
        videos.forEach((video: any, index: number) => {
          console.log(chalk.white(`${index + 1}. ${video.name}`));
          console.log(chalk.gray(`   Uploaded: ${new Date(video.uploadedAt).toLocaleDateString()}`));
          console.log(chalk.gray(`   Size: ${(video.size / (1024 * 1024)).toFixed(1)} MB`));
          
          if (video.modelName) {
            console.log(chalk.cyan(`   Model: ${video.modelName}`));
          }
          if (video.scenarioId) {
            console.log(chalk.cyan(`   Scenario: ${video.scenarioId}`));
          }
          if (video.tags && video.tags.length > 0) {
            console.log(chalk.magenta(`   Tags: ${video.tags.join(', ')}`));
          }
          if (video.groups && video.groups.length > 0) {
            console.log(chalk.blue(`   Groups: ${video.groups.join(', ')}`));
          }
          
          console.log(chalk.gray(`   URL: ${video.url || video.path}\n`));
        });
        
      } catch (error) {
        console.error(chalk.red('Error listing videos:'), error);
      }
    }, true);
  });

// Bulk edit videos command
program
  .command('bulk-edit-videos')
  .description('Bulk edit video metadata')
  .option('--pattern <pattern>', 'File name pattern to match')
  .option('--model <model>', 'Filter by existing model name')
  .option('--scenario <scenario>', 'Filter by existing scenario')
  .option('--set-model <model>', 'Set model name')
  .option('--set-scenario <scenario>', 'Set scenario ID')
  .option('--add-tags <tags>', 'Add tags (comma-separated)')
  .option('--remove-tags <tags>', 'Remove tags (comma-separated)')
  .option('--add-groups <groups>', 'Add groups (comma-separated)')
  .option('--remove-groups <groups>', 'Remove groups (comma-separated)')
  .option('--operation <op>', 'Operation mode (add|replace|remove)', 'add')
  .action(async (options) => {
    await requireAuth('bulk edit videos', async () => {
      try {
        console.log(chalk.blue.bold('\n✏️  Bulk editing videos\n'));
        
        // Get videos to edit
        let url = `${getBaseUrl()}/api/videos`;
        const params = new URLSearchParams();
        
        if (options.model) params.append('model', options.model);
        if (options.scenario) params.append('scenario', options.scenario);
        
        if (params.toString()) {
          url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch videos: ${response.status}`);
        }
        
        let videos = await response.json();
        
        // Filter by pattern if provided
        if (options.pattern) {
          const pattern = new RegExp(options.pattern.replace(/\*/g, '.*'), 'i');
          videos = videos.filter((v: any) => pattern.test(v.name));
        }
        
        if (videos.length === 0) {
          console.log(chalk.yellow('No videos match the specified criteria.'));
          return;
        }
        
        console.log(chalk.white(`Found ${videos.length} videos to edit:\n`));
        videos.forEach((video: any, index: number) => {
          console.log(chalk.gray(`${index + 1}. ${video.name}`));
        });
        
        // Prepare bulk edit data
        const updates: any = {};
        const operation = options.operation;
        
        if (options.setModel) updates.modelName = options.setModel;
        if (options.setScenario) updates.scenarioId = options.setScenario;
        
        if (options.addTags) {
          updates.tags = {
            operation,
            values: options.addTags.split(',').map((t: string) => t.trim())
          };
        }
        
        if (options.removeTags) {
          updates.tags = {
            operation: 'remove',
            values: options.removeTags.split(',').map((t: string) => t.trim())
          };
        }
        
        if (options.addGroups) {
          updates.groups = {
            operation,
            values: options.addGroups.split(',').map((g: string) => g.trim())
          };
        }
        
        if (options.removeGroups) {
          updates.groups = {
            operation: 'remove',
            values: options.removeGroups.split(',').map((g: string) => g.trim())
          };
        }
        
        if (Object.keys(updates).length === 0) {
          console.log(chalk.yellow('No updates specified. Use --set-model, --add-tags, etc.'));
          return;
        }
        
        // Apply bulk edits
        const videoIds = videos.map((v: any) => v.id);
        const bulkEditResponse = await fetch(`${getBaseUrl()}/api/videos/bulk-edit`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            videoIds,
            updates
          })
        });
        
        if (!bulkEditResponse.ok) {
          const error = await bulkEditResponse.json();
          throw new Error(error.error || 'Failed to bulk edit videos');
        }
        
        const result = await bulkEditResponse.json();
        console.log(chalk.green.bold(`\n✅ Updated ${result.updatedCount} videos successfully!`));
        
      } catch (error) {
        console.error(chalk.red('Error bulk editing videos:'), error);
      }
    }, true);
  });

// Upload videos command
program
  .command('upload-videos')
  .description('Upload videos from a directory to the video library')
  .option('-d, --dir <directory>', 'Directory containing video files to upload')
  .option('-m, --model <model>', 'Model name to associate with uploaded videos')
  .action(async (options) => {
    await requireAuth('upload videos', async (auth) => {
      const { spawn } = require('child_process');
      const fs = require('fs');
      const path = require('path');

      try {
        if (!options.dir) {
          console.error(chalk.red('❌ Directory is required. Use --dir <directory>'));
          process.exit(1);
        }

        // Resolve path relative to where the command was run, not where the script is located
        const originalPwd = process.env.ORIGINAL_PWD || process.cwd();
        const videoDir = path.resolve(originalPwd, options.dir);

        // Check if directory exists
        if (!fs.existsSync(videoDir)) {
          console.error(chalk.red(`❌ Directory not found: ${videoDir}`));
          process.exit(1);
        }

        // Get all video files from directory
        const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
        const videoFiles = fs.readdirSync(videoDir)
          .filter((file: string) => videoExtensions.some(ext => file.toLowerCase().endsWith(ext)))
          .map((file: string) => path.join(videoDir, file));

        if (videoFiles.length === 0) {
          console.error(chalk.red(`❌ No video files found in: ${videoDir}`));
          process.exit(1);
        }

        console.log(chalk.blue(`📁 Found ${videoFiles.length} video files in ${videoDir}`));
        console.log(chalk.blue(`🚀 Starting upload...\n`));

        // Get organization once for all uploads
        const organizationId = await selectOrganization(auth);
        const results: any[] = [];

        // Upload function using existing web UI functions
        async function uploadVideo(filePath: string): Promise<any> {
          const fileName = path.basename(filePath);
          console.log(chalk.gray(`📤 Uploading: ${fileName}`));
          
          try {
            // Read file as buffer (same as web UI)
            const fileBuffer = fs.readFileSync(filePath);
            
            // Generate key for video library (same logic as web UI route)
            const fileExtension = fileName.split('.').pop() || 'mp4';
            const uniqueId = Math.random().toString(36).substring(2, 10); // 8 char random string
            const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
            const key = `video-library/${uniqueId}_${sanitizedName}`;
            
            // Upload to Tigris using existing function
            const videoUrl = await uploadVideoToTigris(fileBuffer, key, 'video/mp4');

            // Save video record to database (same as web UI route)
            const video = await prisma.video.create({
              data: {
                key,
                name: fileName,
                url: videoUrl,
                size: fileBuffer.length,
                organizationId,
                tags: [],
                groups: [],
                modelName: options.model || null,
                metadata: {
                  originalName: fileName,
                  mimeType: 'video/mp4',
                  uploadedBy: auth.userId || 'cli-user',
                  modelName: options.model || null
                }
              }
            });
            
            console.log(chalk.green(`✅ Uploaded: ${fileName}`));
            return {
              success: true,
              fileName,
              url: videoUrl,
              key,
              id: video.id
            };
            
          } catch (error) {
            console.error(chalk.red(`❌ Failed to upload ${fileName}: ${error}`));
            return {
              success: false,
              fileName,
              error: error.message || 'Upload failed'
            };
          }
        }

        // Upload all videos sequentially
        for (const filePath of videoFiles) {
          const result = await uploadVideo(filePath);
          results.push(result);
          
          // Small delay between uploads to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Summary
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        console.log(chalk.blue.bold(`\n📊 Upload Summary:`));
        console.log(chalk.green(`✅ Successful: ${successful.length}`));
        console.log(chalk.red(`❌ Failed: ${failed.length}`));

        if (successful.length > 0) {
          console.log(chalk.blue(`\n📋 Uploaded Videos:`));
          successful.forEach((result: any) => {
            console.log(chalk.gray(`  • ${result.fileName}`));
          });
        }

        if (failed.length > 0) {
          console.log(chalk.red(`\n💥 Failed Uploads:`));
          failed.forEach((result: any) => {
            console.log(chalk.red(`  • ${result.fileName}: ${result.error}`));
          });
        }

        console.log(chalk.green.bold(`\n🎉 Upload complete! Videos are now available in the Video Library.`));

      } catch (error) {
        console.error(chalk.red('Error uploading videos:'), error);
      } finally {
        await prisma.$disconnect();
      }
    });
  });

// Sync video library with Tigris storage
program
  .command('sync-videos')
  .description('Sync video library database with Tigris storage (Tigris as source of truth)')
  .option('--dry-run', 'Show what would be synced without making changes')
  .action(async (options) => {
    await requireAuth('sync video library', async (auth) => {
      const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
      
      try {
        console.log(chalk.blue.bold('\n🔄 Syncing Video Library with Tigris Storage\n'));
        
        // Initialize Tigris client (same config as web UI)
        const tigrisClient = new S3Client({
          endpoint: process.env.AWS_ENDPOINT_URL_S3 || 'https://fly.storage.tigris.dev',
          region: process.env.AWS_REGION || 'auto',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
        });

        const bucketName = process.env.TIGRIS_BUCKET_NAME || 'eval-data';
        
        // List all video-library objects in Tigris
        console.log(chalk.gray('📋 Fetching videos from Tigris storage...'));
        const listCommand = new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: 'video-library/',
        });
        
        const tigrisResponse = await tigrisClient.send(listCommand);
        const tigrisVideos = tigrisResponse.Contents || [];
        
        console.log(chalk.blue(`Found ${tigrisVideos.length} videos in Tigris storage`));
        
        // Get all video records from database
        console.log(chalk.gray('📋 Fetching videos from database...'));
        const dbVideos = await prisma.video.findMany({
          where: {
            key: {
              startsWith: 'video-library/'
            }
          },
          select: {
            id: true,
            key: true,
            name: true,
            url: true,
            size: true,
            uploadedAt: true
          }
        });
        
        console.log(chalk.blue(`Found ${dbVideos.length} videos in database`));
        
        // Create maps for comparison
        const tigrisKeys = new Set(tigrisVideos.map(obj => obj.Key));
        const dbKeys = new Set(dbVideos.map(video => video.key));
        
        // Find orphaned database records (in DB but not in Tigris)
        const orphanedDbRecords = dbVideos.filter(video => !tigrisKeys.has(video.key));
        
        // Find missing database records (in Tigris but not in DB)
        const missingDbRecords = tigrisVideos.filter(obj => !dbKeys.has(obj.Key));
        
        console.log(chalk.white('\n📊 Sync Analysis (Tigris as source of truth):'));
        console.log(chalk.blue(`🎯 Target: ${tigrisVideos.length} videos in Tigris storage`));
        console.log(chalk.blue(`📄 Current: ${dbVideos.length} videos in database`));
        console.log(chalk.green(`✅ In sync: ${tigrisVideos.length - missingDbRecords.length} videos`));
        console.log(chalk.red(`❌ Orphaned DB records: ${orphanedDbRecords.length} (will be removed)`));
        console.log(chalk.yellow(`➕ Missing DB records: ${missingDbRecords.length} (will be created)`));
        
        if (orphanedDbRecords.length > 0) {
          console.log(chalk.red('\n🗑️  Database Records to Remove:'));
          orphanedDbRecords.forEach(video => {
            console.log(chalk.gray(`  • ${video.name} (${video.key})`));
          });
        }
        
        if (missingDbRecords.length > 0) {
          console.log(chalk.yellow('\n➕ Database Records to Create:'));
          missingDbRecords.forEach(obj => {
            const sizeKB = obj.Size ? Math.round(obj.Size / 1024) : 0;
            const fileName = obj.Key?.split('/').pop()?.split('_').slice(1).join('_') || 'unknown';
            console.log(chalk.gray(`  • ${fileName} (${obj.Key}) - ${sizeKB} KB`));
          });
        }
        
        if (!options.dryRun) {
          // Remove orphaned database records
          if (orphanedDbRecords.length > 0) {
            console.log(chalk.yellow('\n🧹 Removing orphaned database records...'));
            const deleteResult = await prisma.video.deleteMany({
              where: {
                id: {
                  in: orphanedDbRecords.map(v => v.id)
                }
              }
            });
            console.log(chalk.green(`✅ Removed ${deleteResult.count} orphaned database records`));
          }
          
          // Create missing database records
          if (missingDbRecords.length > 0) {
            console.log(chalk.yellow('\n➕ Creating missing database records...'));
            const organizationId = await selectOrganization(auth);
            
            for (const obj of missingDbRecords) {
              const key = obj.Key!;
              const fileName = key.split('/').pop()?.split('_').slice(1).join('_') || 'unknown';
              const bucketName = process.env.TIGRIS_BUCKET_NAME || 'eval-data';
              const videoUrl = `https://${bucketName}.fly.storage.tigris.dev/${key}`;
              
              await prisma.video.create({
                data: {
                  key,
                  name: fileName,
                  url: videoUrl,
                  size: obj.Size || 0,
                  organizationId,
                  tags: [],
                  groups: [],
                  metadata: {
                    originalName: fileName,
                    mimeType: 'video/mp4',
                    uploadedBy: 'sync-command',
                    syncedAt: new Date().toISOString()
                  }
                }
              });
            }
            console.log(chalk.green(`✅ Created ${missingDbRecords.length} missing database records`));
          }
          
          console.log(chalk.green('\n🎉 Database successfully synced with Tigris storage!'));
          console.log(chalk.blue(`📊 Final state: ${tigrisVideos.length} videos in both storage and database`));
        } else {
          console.log(chalk.blue('\n🔍 Dry run complete - no changes made'));
          console.log(chalk.gray('Run without --dry-run to sync database with Tigris storage'));
        }
        
      } catch (error) {
        console.error(chalk.red('Error syncing video library:'), error);
      } finally {
        await prisma.$disconnect();
      }
    });
  });

// Clear all video data command
program
  .command('clear-videos')
  .description('Delete ALL video data from both database and storage (DESTRUCTIVE)')
  .option('--confirm', 'Required confirmation flag to proceed with deletion')
  .option('--storage-only', 'Only delete from storage, keep database records')
  .option('--db-only', 'Only delete from database, keep storage files')
  .action(async (options) => {
    await requireAuth('clear video data', async (auth) => {
      try {
        if (!options.confirm) {
          console.log(chalk.red.bold('\n⚠️  WARNING: This will DELETE ALL video data!\n'));
          console.log(chalk.gray('This command will:'));
          console.log(chalk.gray('• Delete all video files from Tigris storage'));
          console.log(chalk.gray('• Delete all video records from database'));
          console.log(chalk.gray('• This action CANNOT be undone!'));
          console.log(chalk.yellow('\nTo proceed, add the --confirm flag:'));
          console.log(chalk.white('  ./evalctl clear-videos --confirm'));
          console.log(chalk.gray('\nOptions:'));
          console.log(chalk.gray('  --storage-only  Only delete files from storage'));
          console.log(chalk.gray('  --db-only       Only delete database records'));
          return;
        }

        console.log(chalk.red.bold('\n🗑️  Clearing ALL Video Data\n'));
        
        const organizationId = await selectOrganization(auth);
        let deletedFiles = 0;
        let deletedRecords = 0;

        // Delete from storage unless --db-only
        if (!options.dbOnly) {
          console.log(chalk.yellow('🧹 Deleting files from Tigris storage...'));
          
          const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
          const tigrisClient = new S3Client({
            endpoint: process.env.AWS_ENDPOINT_URL_S3 || 'https://fly.storage.tigris.dev',
            region: process.env.AWS_REGION || 'auto',
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            },
          });

          const bucketName = process.env.TIGRIS_BUCKET_NAME;
          if (!bucketName) {
            throw new Error('TIGRIS_BUCKET_NAME environment variable is not set');
          }
          
          // List all video-library objects
          const listCommand = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: 'video-library/',
          });
          
          const response = await tigrisClient.send(listCommand);
          const objects = response.Contents || [];
          
          console.log(chalk.blue(`Found ${objects.length} files to delete from storage`));
          
          // Delete each object
          for (const obj of objects) {
            if (obj.Key) {
              const deleteCommand = new DeleteObjectCommand({
                Bucket: bucketName,
                Key: obj.Key,
              });
              await tigrisClient.send(deleteCommand);
              deletedFiles++;
              console.log(chalk.gray(`  ✓ Deleted: ${obj.Key}`));
            }
          }
        }

        // Delete from database unless --storage-only  
        if (!options.storageOnly) {
          console.log(chalk.yellow('🧹 Deleting records from database...'));
          
          const deleteResult = await prisma.video.deleteMany({
            where: {
              organizationId,
              key: {
                startsWith: 'video-library/'
              }
            }
          });
          deletedRecords = deleteResult.count;
          console.log(chalk.blue(`Deleted ${deletedRecords} video records from database`));
        }

        console.log(chalk.green.bold('\n✅ Video data cleared successfully!'));
        console.log(chalk.white(`📁 Storage files deleted: ${deletedFiles}`));
        console.log(chalk.white(`📄 Database records deleted: ${deletedRecords}`));
        console.log(chalk.gray('\nYou can now upload fresh videos with model information.'));
        
      } catch (error) {
        console.error(chalk.red('Error clearing video data:'), error);
      } finally {
        await prisma.$disconnect();
      }
    }, true);
  });

// Create video tasks command
program
  .command('create-video-tasks')
  .description('Create video tasks for single video evaluation experiments')
  .option('-e, --experiment <slug>', 'Experiment slug')
  .option('--strategy <strategy>', 'Assignment strategy (auto|random|manual)', 'auto')
  .option('--seed <seed>', 'Random seed for reproducible assignment')
  .action(async (options) => {
    await requireAuth('create video tasks', async () => {
      let rl: readline.Interface | null = null;
      try {
        console.log(chalk.blue.bold('\n🎬 Creating Single Video Evaluation Tasks\n'));
        
        let experimentSlug = options.experiment;
        if (!experimentSlug) {
          const { question } = getReadline();
          experimentSlug = await question(chalk.cyan('Experiment slug: '));
        }
        
        // Get experiment
        const experiment = await prisma.experiment.findUnique({
          where: { slug: experimentSlug },
          include: { singleVideoEvaluationTasks: true }
        });
        
        if (!experiment) {
          console.log(chalk.red(`Experiment "${experimentSlug}" not found.`));
          return;
        }
        
        if (experiment.evaluationMode !== 'single_video') {
          console.log(chalk.red(`Experiment "${experimentSlug}" is not in single video mode.`));
          return;
        }
        
        // Get video library
        const response = await fetch(`${getBaseUrl()}/api/videos`);
        if (!response.ok) {
          throw new Error(`Failed to fetch video library: ${response.status}`);
        }
        const videos = await response.json();
        
        if (videos.length === 0) {
          console.log(chalk.red('No videos found in library.'));
          console.log(chalk.gray('Upload videos first using: ./evalctl upload-videos --dir <directory>'));
          return;
        }
        
        console.log(chalk.white(`Found experiment: ${experiment.name}`));
        console.log(chalk.white(`Available videos: ${videos.length}`));
        
        const config = experiment.config as any;
        const scenarios = config?.scenarios || [];
        
        // Handle empty scenarios - add a default scenario
        const validScenarios = scenarios.filter((s: any) => s && s.trim && s.trim().length > 0);
        if (validScenarios.length === 0) {
          console.log(chalk.yellow('⚠ No valid scenarios found in experiment config. Adding default scenario "default".'));
          scenarios.length = 0; // Clear array
          scenarios.push('default');
          
          // Update experiment config
          await prisma.experiment.update({
            where: { id: experiment.id },
            data: {
              config: {
                ...config,
                scenarios: ['default']
              }
            }
          });
        }
        
        // Auto-discover available models from uploaded videos
        const availableModels = Array.from(new Set(
          videos.filter((v: any) => v.modelName).map((v: any) => v.modelName)
        ));
        
        if (availableModels.length === 0) {
          console.log(chalk.red('No videos with model names found in library.'));
          console.log(chalk.gray('Upload videos with model names using: ./evalctl upload-videos --dir <directory> --model <model-name>'));
          return;
        }
        
        console.log(chalk.white(`Auto-discovered models: ${chalk.green(availableModels.join(', '))}`));
        
        // Show video counts per model
        console.log(chalk.blue('\n📊 Videos available per model:'));
        availableModels.forEach(model => {
          const modelVideos = videos.filter((v: any) => v.modelName === model);
          console.log(chalk.white(`  ${model}: ${chalk.green(modelVideos.length)} videos`));
        });
        
        // Ask user to select which model to evaluate
        const { rl: readlineInterface, question } = getReadline();
        rl = readlineInterface;
        console.log(chalk.blue('\n🎯 Select model to evaluate:'));
        availableModels.forEach((model, index) => {
          console.log(chalk.gray(`  ${index + 1}. ${model}`));
        });
        
        const modelChoice = await question(chalk.cyan('Enter model number or name: '));
        
        let selectedModel: string;
        const choiceNum = parseInt(modelChoice);
        if (!isNaN(choiceNum) && choiceNum >= 1 && choiceNum <= availableModels.length) {
          selectedModel = availableModels[choiceNum - 1];
        } else if (availableModels.includes(modelChoice)) {
          selectedModel = modelChoice;
        } else {
          console.log(chalk.red(`Invalid choice: ${modelChoice}`));
          return;
        }
        
        console.log(chalk.green(`\n✅ Selected model: ${selectedModel}`));
        
        // Get all videos for the selected model
        const modelVideos = videos.filter((v: any) => v.modelName === selectedModel);
        console.log(chalk.white(`Found ${modelVideos.length} videos for ${selectedModel}`));
        
        const videoTasks: any[] = [];
        
        console.log(chalk.blue('\n🎬 Creating video evaluation tasks...\n'));
        
        // Create one task per video for the selected model
        modelVideos.forEach((video: any, index: number) => {
          videoTasks.push({
            experimentId: experiment.id,
            scenarioId: 'single-evaluation', // Use a generic scenario name
            modelName: selectedModel,
            videoPath: video.url || video.path,
            videoId: video.id,
            metadata: {
              videoName: video.name,
              videoSize: video.size,
              videoDuration: video.duration,
              taskIndex: index + 1
            }
          });
          
          console.log(chalk.green(`✓ Task ${index + 1}: ${video.name}`));
        });
        
        if (videoTasks.length > 0) {
          // Update experiment config with selected model
          await prisma.experiment.update({
            where: { id: experiment.id },
            data: {
              config: {
                ...config,
                models: [selectedModel],
                scenarios: ['single-evaluation']
              }
            }
          });
          
          // Create video tasks
          await prisma.singleVideoEvaluationTask.createMany({
            data: videoTasks
          });
          
          console.log(chalk.green.bold(`\n✅ Created ${videoTasks.length} video evaluation tasks!`));
          console.log(chalk.white(`All tasks are for model: ${chalk.green(selectedModel)}`));
          console.log(chalk.gray(`Each video will be evaluated individually on a 1-5 scale`));
        } else {
          console.log(chalk.red(`\nNo videos found for model: ${selectedModel}`));
        }
        
      } catch (error) {
        console.error(chalk.red('Error creating video tasks:'), error);
      } finally {
        // Clean up readline interface
        if (rl) {
          rl.close();
        }
        await prisma.$disconnect();
      }
    }, true);
  });

// Reset experiment command
program
  .command('reset')
  .description('Reset an experiment by deleting all tasks (keeps experiment config)')
  .option('-e, --experiment <slug>', 'Experiment slug')
  .option('--confirm', 'Required confirmation flag to proceed with deletion')
  .action(async (options) => {
    await requireAuth('delete video tasks', async () => {
      try {
        if (!options.confirm) {
          console.log(chalk.red.bold('\n⚠️  WARNING: This will RESET the experiment!\n'));
          console.log(chalk.gray('This will:'));
          console.log(chalk.gray('• Delete all video evaluation tasks'));
          console.log(chalk.gray('• Delete all comparison tasks'));
          console.log(chalk.gray('• Keep the experiment config intact'));
          console.log(chalk.gray('• This action CANNOT be undone!'));
          console.log(chalk.yellow('\nTo proceed, add the --confirm flag:'));
          console.log(chalk.white('  ./evalctl reset --experiment <slug> --confirm'));
          return;
        }

        console.log(chalk.red.bold('\n🔄 Resetting Experiment\n'));
        
        let experimentSlug = options.experiment;
        if (!experimentSlug) {
          const { question } = getReadline();
          experimentSlug = await question(chalk.cyan('Experiment slug: '));
        }
        
        // Get experiment
        const experiment = await prisma.experiment.findUnique({
          where: { slug: experimentSlug },
          include: { 
            singleVideoEvaluationTasks: true,
            twoVideoComparisonTasks: true 
          }
        });
        
        if (!experiment) {
          console.log(chalk.red(`Experiment "${experimentSlug}" not found.`));
          return;
        }

        console.log(chalk.white(`Found experiment: ${experiment.name}`));
        console.log(chalk.white(`Single video tasks: ${experiment.singleVideoEvaluationTasks.length}`));
        console.log(chalk.white(`Comparison tasks: ${experiment.twoVideoComparisonTasks.length}`));

        let deletedTasks = 0;

        // Delete single video evaluation tasks
        if (experiment.singleVideoEvaluationTasks.length > 0) {
          const result = await prisma.singleVideoEvaluationTask.deleteMany({
            where: { experimentId: experiment.id }
          });
          deletedTasks += result.count;
          console.log(chalk.blue(`Deleted ${result.count} single video evaluation tasks`));
        }

        // Delete comparison tasks  
        if (experiment.twoVideoComparisonTasks.length > 0) {
          const result = await prisma.twoVideoComparisonTask.deleteMany({
            where: { experimentId: experiment.id }
          });
          deletedTasks += result.count;
          console.log(chalk.blue(`Deleted ${result.count} comparison tasks`));
        }

        console.log(chalk.green.bold(`\n✅ Reset complete! Deleted ${deletedTasks} tasks.`));
        console.log(chalk.gray('The experiment is now ready for fresh task creation.'));
        
      } catch (error) {
        console.error(chalk.red('Error deleting tasks:'), error);
      } finally {
        await prisma.$disconnect();
      }
    }, true);
  });

// Bulk experiment creation command
program
  .command('create-bulk')
  .description('Create multiple experiments using matrix mode')
  .option('-m, --models <models>', 'Comma-separated list of models')
  .option('-s, --scenarios <scenarios>', 'Comma-separated list of scenarios')
  .option('-g, --group <group>', 'Experiment group for organization')
  .option('--mode <mode>', 'Evaluation mode (comparison|single_video)', 'comparison')
  .option('--strategy <strategy>', 'Video assignment strategy (auto|random|manual)', 'auto')
  .option('--seed <seed>', 'Random seed for reproducible assignment')
  .option('--randomize-order', 'Randomize comparison order')
  .option('--randomize-positions', 'Randomize model positions (A/B swapping)')
  .action(async (options) => {
    await requireAuth('create bulk experiments', async (auth) => {
      console.log(chalk.blue.bold('\n🧪 Creating bulk experiments with matrix mode\n'));
      
      try {
        const { question } = getReadline();
        
        // Auto-discover available models from uploaded videos
        const videoResponse = await fetch(`${getBaseUrl()}/api/videos`);
        if (!videoResponse.ok) {
          throw new Error(`Failed to fetch video library: ${videoResponse.status}`);
        }
        const videos = await videoResponse.json();
        
        const availableModels = Array.from(new Set(
          videos.filter((v: any) => v.modelName).map((v: any) => v.modelName)
        ));
        
        if (availableModels.length === 0) {
          console.log(chalk.red('No videos with model names found in library.'));
          console.log(chalk.gray('Upload videos with model names first using: ./evalctl upload-videos --dir <directory> --model <model-name>'));
          return;
        }
        
        console.log(chalk.white(`Auto-discovered models: ${chalk.green(availableModels.join(', '))}`));
        
        // Allow manual override if models option is provided
        const models = options.models ? 
          options.models.split(',').map((m: string) => m.trim()) : 
          availableModels;
        
        const scenariosInput = options.scenarios || await question(
          chalk.cyan('Scenarios (comma-separated): ')
        );
        const scenarios = scenariosInput.split(',').map((s: string) => s.trim());
        
        const group = options.group || await question(
          chalk.cyan('Experiment group (optional): ')
        );
        
        const evaluationMode = options.mode;
        const strategy = options.strategy;
        const seed = options.seed ? parseInt(options.seed) : undefined;
        
        // Call bulk creation API
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/experiments/bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            models,
            scenarios,
            group: group || null,
            evaluationMode,
            videoAssignmentStrategy: strategy,
            randomSeed: seed,
            randomizeOrder: options.randomizeOrder || false,
            randomizePositions: options.randomizePositions || false,
            createdBy: auth.userId
          })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create bulk experiments');
        }
        
        const result = await response.json();
        
        console.log(chalk.green.bold('\n✅ Bulk experiments created successfully!\n'));
        console.log(chalk.white('Created:'), chalk.yellow(`${result.experiments.length} experiments`));
        console.log(chalk.white('Mode:'), chalk.yellow(evaluationMode));
        
        if (evaluationMode === 'single_video') {
          console.log(chalk.white('Total video tasks:'), chalk.yellow(result.totalVideoTasks || 0));
        } else {
          console.log(chalk.white('Total comparisons:'), chalk.yellow(result.totalComparisons || 0));
        }
        
        if (result.videoAssignments) {
          console.log(chalk.white('Videos assigned:'), chalk.yellow(result.videoAssignments));
        }
        
        console.log(chalk.blue('\n📋 Created experiments:'));
        result.experiments.forEach((exp: any) => {
          console.log(chalk.white(`- ${exp.name} (${exp.slug})`));
        });
        
        if (result.warnings && result.warnings.length > 0) {
          console.log(chalk.yellow('\n⚠️  Warnings:'));
          result.warnings.forEach((warning: string) => {
            console.log(chalk.yellow(`- ${warning}`));
          });
        }
        
      } catch (error) {
        console.error(chalk.red('Error creating bulk experiments:'), error);
      } finally {
        await prisma.$disconnect();
      }
    }, true); // Require admin permissions
  });

// Auto-assign videos to experiment
program
  .command('assign-videos')
  .description('Auto-assign videos from library to experiment comparisons')
  .option('-e, --experiment <slug>', 'Experiment slug')
  .option('--strategy <strategy>', 'Assignment strategy (auto|random|manual)', 'auto')
  .option('--seed <seed>', 'Random seed for reproducible assignment')
  .action(async (options) => {
    await requireAuth('assign videos', async () => {
      try {
        console.log(chalk.blue.bold('\n🎯 Assigning Videos to Experiment\n'));
        
        let experimentSlug = options.experiment;
        if (!experimentSlug) {
          const { question } = getReadline();
          experimentSlug = await question(chalk.cyan('Experiment slug: '));
        }
        
        // Get experiment
        const experiment = await prisma.experiment.findUnique({
          where: { slug: experimentSlug },
          include: { twoVideoComparisonTasks: true }
        });
        
        if (!experiment) {
          console.log(chalk.red(`Experiment "${experimentSlug}" not found.`));
          return;
        }
        
        // Get video library
        const response = await fetch(`${getBaseUrl()}/api/video-library`);
        if (!response.ok) {
          throw new Error(`Failed to fetch video library: ${response.status}`);
        }
        const videos = await response.json();
        
        if (videos.length === 0) {
          console.log(chalk.red('No videos found in library.'));
          console.log(chalk.gray('Upload videos first using: npm run upload-videos --dir <directory>'));
          return;
        }
        
        console.log(chalk.white(`Found experiment: ${experiment.name}`));
        console.log(chalk.white(`Available videos: ${videos.length}`));
        
        const strategy = options.strategy || 'auto';
        const seed = options.seed ? parseInt(options.seed) : undefined;
        
        if (strategy === 'auto') {
          // Auto-assign based on video metadata
          console.log(chalk.blue('\n🤖 Auto-assigning videos based on metadata...\n'));
          
          // Use new video library API that supports metadata
          const videoResponse = await fetch(`${getBaseUrl()}/api/videos`);
          if (!videoResponse.ok) {
            throw new Error(`Failed to fetch video library: ${videoResponse.status}`);
          }
          const videosWithMetadata = await videoResponse.json();
          
          const config = experiment.config as any;
          const scenarios = config?.scenarios || [];
          
          // Auto-discover available models from uploaded videos
          const availableModels = Array.from(new Set(
            videosWithMetadata.filter((v: any) => v.modelName).map((v: any) => v.modelName)
          ));
          
          if (availableModels.length === 0) {
            console.log(chalk.red('No videos with model names found in library.'));
            return;
          }
          
          console.log(chalk.white(`Auto-discovered models: ${chalk.green(availableModels.join(', '))}`));
          
          const comparisons: any[] = [];
          
          for (const scenario of scenarios) {
            for (let i = 0; i < availableModels.length; i++) {
              for (let j = i + 1; j < availableModels.length; j++) {
                const modelA = availableModels[i];
                const modelB = availableModels[j];
                
                // Find videos by metadata first, fallback to filename patterns
                let videoA = videosWithMetadata.find((v: any) => 
                  v.modelName === modelA && v.scenarioId === scenario
                );
                let videoB = videosWithMetadata.find((v: any) => 
                  v.modelName === modelB && v.scenarioId === scenario
                );
                
                // Fallback to filename patterns if metadata not available
                if (!videoA) {
                  videoA = videosWithMetadata.find((v: any) => 
                    v.name.toLowerCase().includes(scenario.toLowerCase()) && 
                    v.name.toLowerCase().includes(modelA.toLowerCase())
                  );
                }
                if (!videoB) {
                  videoB = videosWithMetadata.find((v: any) => 
                    v.name.toLowerCase().includes(scenario.toLowerCase()) && 
                    v.name.toLowerCase().includes(modelB.toLowerCase())
                  );
                }
                
                if (videoA && videoB) {
                  comparisons.push({
                    scenarioId: scenario,
                    modelA,
                    modelB,
                    videoAPath: videoA.url || videoA.path,
                    videoBPath: videoB.url || videoB.path,
                    metadata: {
                      videoAName: videoA.name,
                      videoBName: videoB.name,
                      videoAId: videoA.id,
                      videoBId: videoB.id
                    }
                  });
                  
                  console.log(chalk.green(`✓ ${scenario}: ${modelA} vs ${modelB}`));
                  console.log(chalk.gray(`  A: ${videoA.name}`));
                  console.log(chalk.gray(`  B: ${videoB.name}\n`));
                } else {
                  console.log(chalk.yellow(`⚠ ${scenario}: ${modelA} vs ${modelB} - videos not found`));
                }
              }
            }
          }
          
          if (comparisons.length > 0) {
            // Update experiment config with discovered models
            await prisma.experiment.update({
              where: { id: experiment.id },
              data: {
                config: {
                  ...config,
                  models: availableModels,
                  scenarios
                }
              }
            });
            
            // Create comparisons
            await prisma.twoVideoComparisonTask.createMany({
              data: comparisons.map(comp => ({
                scenarioId: comp.scenarioId,
                modelA: comp.modelA,
                modelB: comp.modelB,
                videoAPath: comp.videoAPath,
                videoBPath: comp.videoBPath,
                metadata: comp.metadata,
                experimentId: experiment.id
              }))
            });
            
            console.log(chalk.green.bold(`\n✅ Created ${comparisons.length} comparisons!`));
          } else {
            console.log(chalk.red('\nNo matching videos found. Check your video metadata or filename patterns.'));
            console.log(chalk.gray('Expected: videos with modelName and scenarioId metadata, or pattern {scenario}_{model}.mp4'));
          }
          
        } else if (strategy === 'random') {
          console.log(chalk.blue('\n🎲 Random video assignment...\n'));
          
          // Get videos with metadata
          const videoResponse = await fetch(`${getBaseUrl()}/api/videos`);
          if (!videoResponse.ok) {
            throw new Error(`Failed to fetch video library: ${videoResponse.status}`);
          }
          await videoResponse.json();
          
          if (seed) {
            console.log(chalk.gray(`Using random seed: ${seed}`));
          }
          
          // Implement random assignment logic here
          console.log(chalk.yellow('Random assignment implementation coming soon'));
          
        } else {
          // Interactive assignment
          console.log(chalk.blue('\n📋 Interactive video assignment (coming soon)'));
          console.log(chalk.gray('Use --strategy auto for automatic assignment based on metadata or filename patterns'));
        }
        
      } catch (error) {
        console.error(chalk.red('Error assigning videos:'), error);
      } finally {
        await prisma.$disconnect();
      }
    }, true);
  });

// Prolific Commands
program
  .command('prolific:create')
  .description('Create a Prolific study for an experiment')
  .option('-e, --experiment <slug>', 'Experiment slug')
  .option('-t, --title <title>', 'Study title')
  .option('-d, --description <description>', 'Study description')
  .option('-r, --reward <amount>', 'Reward amount in USD', '8.00')
  .option('-p, --participants <count>', 'Number of participants', '50')
  .action(async (options) => {
    await requireAuth('create Prolific studies', async () => {
      try {
        console.log(chalk.blue.bold('\n🌍 Creating Prolific Study\n'));
        
        const { question } = getReadline();
        
        // Get experiment
        let experimentSlug = options.experiment;
        if (!experimentSlug) {
          experimentSlug = await question(chalk.cyan('Experiment slug: '));
        }
        
        const experiment = await prisma.experiment.findUnique({
          where: { slug: experimentSlug },
          include: {
            _count: { select: { twoVideoComparisonTasks: true } }
          }
        });
        
        if (!experiment) {
          console.log(chalk.red(`Experiment "${experimentSlug}" not found.`));
          return;
        }
        
        if (experiment.prolificStudyId) {
          console.log(chalk.yellow(`Experiment already has a Prolific study: ${experiment.prolificStudyId}`));
          const proceed = await question(chalk.cyan('Create another study? (y/N): '));
          if (proceed.toLowerCase() !== 'y') {
            return;
          }
        }
        
        // Get study details
        const title = options.title || await question(
          chalk.cyan(`Study title (${chalk.gray(`Evaluate ${experiment.name}`)}): `)
        ) || `Evaluate ${experiment.name}`;
        
        const description = options.description || await question(
          chalk.cyan(`Description (${chalk.gray('Help us evaluate AI model outputs')}): `)
        ) || `Help us evaluate AI model outputs for ${experiment.name}`;
        
        const reward = parseFloat(options.reward);
        const totalParticipants = parseInt(options.participants);
        
        console.log(chalk.gray('\n📊 Study Summary:'));
        console.log(chalk.gray(`  Experiment: ${experiment.name} (${experimentSlug})`));
        console.log(chalk.gray(`  Two Video Comparison Tasks: ${experiment._count.twoVideoComparisonTasks}`));
        console.log(chalk.gray(`  Estimated time: ~${Math.ceil(experiment._count.twoVideoComparisonTasks * 2)} minutes`));
        console.log(chalk.gray(`  Reward: $${reward.toFixed(2)}`));
        console.log(chalk.gray(`  Participants: ${totalParticipants}`));
        console.log(chalk.gray(`  Total cost: ~$${(reward * totalParticipants).toFixed(2)} (+ Prolific fees)`));
        
        const confirm = await question(chalk.cyan('\nCreate study? (Y/n): '));
        if (confirm.toLowerCase() === 'n') {
          console.log(chalk.gray('Study creation cancelled.'));
          return;
        }
        
        console.log(chalk.yellow('\n🔄 Creating study on Prolific...'));
        
        // Create organization-specific Prolific service
        const organizationProlificService = await ProlificService.createForOrganization(experiment.organizationId);
        const prolificStudy = await organizationProlificService.createStudy({
          experimentId: experiment.id,
          title,
          description,
          reward,
          totalParticipants
        });
        
        console.log(chalk.green.bold('\n✅ Prolific study created successfully!\n'));
        console.log(chalk.white('Study ID:'), chalk.yellow(prolificStudy.id));
        console.log(chalk.white('Status:'), chalk.yellow(prolificStudy.status));
        console.log(chalk.white('External URL:'), chalk.blue.underline(prolificStudy.external_study_url));
        console.log(chalk.white('Prolific Dashboard:'), 
          chalk.blue.underline(`https://app.prolific.co/researcher/studies/${prolificStudy.id}`));
        
        console.log(chalk.gray('\nNext steps:'));
        console.log(chalk.gray(`1. Review study on Prolific dashboard`));
        console.log(chalk.gray(`2. Publish study: ./evalctl prolific:publish --study ${prolificStudy.id}`));
        console.log(chalk.gray(`3. Monitor progress: ./evalctl prolific:status --study ${prolificStudy.id}`));
        
      } catch (error) {
        console.error(chalk.red('Error creating Prolific study:'), error);
      } finally {
        await prisma.$disconnect();
      }
    }, true);
  });

program
  .command('prolific:list')
  .description('List all Prolific studies')
  .action(async () => {
    await requireAuth('list Prolific studies', async () => {
      try {
        console.log(chalk.blue.bold('\n🌍 Prolific Studies\n'));
        
        const experiments = await prisma.experiment.findMany({
          where: {
            prolificStudyId: { not: null }
          },
          select: {
            id: true,
            name: true,
            prolificStudyId: true,
            status: true,
            createdAt: true,
            _count: {
              select: {
                participants: {
                  where: {
                    id: {
                      not: {
                        startsWith: 'anon-session-'
                      }
                    }
                  }
                },
                twoVideoComparisonSubmissions: true,
                twoVideoComparisonTasks: true
              }
            }
          }
        });
        
        if (experiments.length === 0) {
          console.log(chalk.gray('No experiments with Prolific studies found.'));
          return;
        }
        
        console.log(chalk.yellow('🔄 Fetching study details from Prolific...'));
        
        for (const exp of experiments) {
          try {
            const study = await prolificService.instance.getStudy(exp.prolificStudyId!);
            
            const statusColor = {
              'UNPUBLISHED': 'gray',
              'ACTIVE': 'green',
              'PAUSED': 'yellow',
              'COMPLETED': 'blue',
              'AWAITING_REVIEW': 'cyan'
            }[study.status] || 'white';
            
            console.log(chalk.bold.white(`${exp.name}`));
            console.log(chalk.gray(`  Experiment ID: ${exp.id}`));
            console.log(chalk.gray(`  Study ID: ${exp.prolificStudyId}`));
            console.log(chalk[statusColor](`  Status: ${study.status}`));
            console.log(chalk.gray(`  Participants: ${study.number_of_submissions}/${study.total_available_places}`));
            console.log(chalk.gray(`  Reward: $${(study.reward / 100).toFixed(2)}`));
            console.log(chalk.gray(`  Created: ${new Date(study.date_created).toLocaleDateString()}`));
            console.log(chalk.blue.underline(`  Dashboard: https://app.prolific.co/researcher/studies/${exp.prolificStudyId}`));
            console.log();
          } catch (error) {
            console.log(chalk.bold.white(`${exp.name}`));
            console.log(chalk.red(`  Error: Failed to fetch study details`));
            console.log(chalk.gray(`  Study ID: ${exp.prolificStudyId}`));
            console.log();
          }
        }
        
      } catch (error) {
        console.error(chalk.red('Error listing Prolific studies:'), error);
      } finally {
        await prisma.$disconnect();
      }
    });
  });

program
  .command('prolific:status')
  .description('Get status of a Prolific study')
  .option('-s, --study <studyId>', 'Prolific study ID')
  .action(async (options) => {
    await requireAuth('check Prolific study status', async () => {
      try {
        const { question } = getReadline();
        
        let studyId = options.study;
        if (!studyId) {
          studyId = await question(chalk.cyan('Prolific study ID: '));
        }
        
        console.log(chalk.yellow('🔄 Fetching study status...'));
        
        const study = await prolificService.instance.getStudy(studyId);
        const submissions = await prolificService.instance.getSubmissions(studyId);
        
        const statusColor = {
          'UNPUBLISHED': 'gray',
          'ACTIVE': 'green',
          'PAUSED': 'yellow',
          'COMPLETED': 'blue',
          'AWAITING_REVIEW': 'cyan'
        }[study.status] || 'white';
        
        console.log(chalk.blue.bold('\n📊 Study Status\n'));
        console.log(chalk.white('Study ID:'), chalk.yellow(studyId));
        console.log(chalk.white('Name:'), chalk.white(study.name));
        console.log(chalk.white('Status:'), chalk[statusColor](study.status));
        console.log(chalk.white('Participants:'), chalk.yellow(`${study.number_of_submissions}/${study.total_available_places}`));
        console.log(chalk.white('Reward:'), chalk.green(`$${(study.reward / 100).toFixed(2)}`));
        console.log(chalk.white('Created:'), chalk.gray(new Date(study.date_created).toLocaleDateString()));
        
        if (submissions.results.length > 0) {
          console.log(chalk.blue('\n📋 Submissions:'));
          const submissionCounts = submissions.results.reduce((acc, sub) => {
            acc[sub.status] = (acc[sub.status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          Object.entries(submissionCounts).forEach(([status, count]) => {
            const color = {
              'ACTIVE': 'yellow',
              'AWAITING_REVIEW': 'cyan',
              'APPROVED': 'green',
              'REJECTED': 'red',
              'RETURNED': 'gray'
            }[status] || 'white';
            console.log(chalk[color](`  ${status}: ${count}`));
          });
        }
        
        console.log(chalk.blue.underline(`\nProlific Dashboard: https://app.prolific.co/researcher/studies/${studyId}`));
        
      } catch (error) {
        console.error(chalk.red('Error fetching study status:'), error);
      } finally {
        if (rl) {
          rl.close();
        }
        await prisma.$disconnect();
      }
    });
  });

program
  .command('prolific:publish')
  .description('Publish a Prolific study')
  .option('-s, --study <studyId>', 'Prolific study ID')
  .action(async (options) => {
    await requireAuth('publish Prolific studies', async () => {
      try {
        const { question } = getReadline();
        
        let studyId = options.study;
        if (!studyId) {
          studyId = await question(chalk.cyan('Prolific study ID to publish: '));
        }
        
        // Get experiment to find organization
        const experiment = await prisma.experiment.findFirst({
          where: { prolificStudyId: studyId }
        });
        
        if (!experiment) {
          console.log(chalk.red(`No experiment found for Prolific study ${studyId}`));
          return;
        }
        
        // Create organization-specific Prolific service
        const organizationProlificService = await ProlificService.createForOrganization(experiment.organizationId);
        
        // Get current status
        const study = await organizationProlificService.getStudy(studyId);
        
        if (study.status !== 'UNPUBLISHED') {
          console.log(chalk.yellow(`Study is already ${study.status.toLowerCase()}. Cannot publish.`));
          return;
        }
        
        console.log(chalk.gray('\n📊 Study to publish:'));
        console.log(chalk.gray(`  Name: ${study.name}`));
        console.log(chalk.gray(`  Participants: ${study.total_available_places}`));
        console.log(chalk.gray(`  Reward: $${(study.reward / 100).toFixed(2)}`));
        console.log(chalk.gray(`  Total cost: ~$${((study.reward / 100) * study.total_available_places).toFixed(2)} (+ Prolific fees)`));
        
        const confirm = await question(chalk.cyan('\nPublish study? (Y/n): '));
        if (confirm.toLowerCase() === 'n') {
          console.log(chalk.gray('Study publication cancelled.'));
          return;
        }
        
        console.log(chalk.yellow('🔄 Publishing study...'));
        
        // Use organization-specific service to publish
        const updatedStudy = await organizationProlificService.updateStudyStatus(studyId, { action: 'publish' });
        
        console.log(chalk.green.bold('\n✅ Study published successfully!'));
        console.log(chalk.white('Status:'), chalk.green(updatedStudy.status));
        console.log(chalk.blue.underline(`Dashboard: https://app.prolific.co/researcher/studies/${studyId}`));
        
      } catch (error) {
        console.error(chalk.red('Error publishing study:'), error);
      } finally {
        if (rl) {
          rl.close();
        }
        await prisma.$disconnect();
      }
    }, true);
  });

program
  .command('prolific:start')
  .description('Start a paused Prolific study')
  .option('-s, --study <studyId>', 'Prolific study ID')
  .action(async (options) => {
    await requireAuth('start Prolific study', async () => {
      try {
        const { question } = getReadline();
        
        let studyId = options.study;
        if (!studyId) {
          studyId = await question(chalk.cyan('Prolific study ID to start: '));
        }
        
        console.log(chalk.yellow('🔄 Starting study...'));
        
        // Make API call directly to avoid frontend prisma issues
        // Get experiment to find organization
        const experiment = await prisma.experiment.findFirst({
          where: { prolificStudyId: studyId }
        });
        
        if (!experiment) {
          console.log(chalk.red(`No experiment found for Prolific study ${studyId}`));
          return;
        }
        
        // Create organization-specific Prolific service
        const organizationProlificService = await ProlificService.createForOrganization(experiment.organizationId);
        
        // Use organization-specific service to start
        const updatedStudy = await organizationProlificService.updateStudyStatus(studyId, { action: 'start' });
        
        console.log(chalk.green.bold('\n✅ Study started successfully!'));
        console.log(chalk.white('Status:'), chalk.green(updatedStudy.status));
        console.log(chalk.blue.underline(`Dashboard: https://app.prolific.co/researcher/studies/${studyId}`));
        
      } catch (error) {
        console.error(chalk.red('Error starting study:'), error);
      } finally {
        if (rl) {
          rl.close();
        }
        await prisma.$disconnect();
      }
    }, true);
  });

program
  .command('prolific:pause')
  .description('Pause a running Prolific study')
  .option('-s, --study <studyId>', 'Prolific study ID')
  .action(async (options) => {
    await requireAuth('pause Prolific study', async () => {
      try {
        const { question } = getReadline();
        
        let studyId = options.study;
        if (!studyId) {
          studyId = await question(chalk.cyan('Prolific study ID to pause: '));
        }
        
        console.log(chalk.yellow('🔄 Pausing study...'));
        
        // Make API call directly to avoid frontend prisma issues
        // Get experiment to find organization
        const experiment = await prisma.experiment.findFirst({
          where: { prolificStudyId: studyId }
        });
        
        if (!experiment) {
          console.log(chalk.red(`No experiment found for Prolific study ${studyId}`));
          return;
        }
        
        // Create organization-specific Prolific service
        const organizationProlificService = await ProlificService.createForOrganization(experiment.organizationId);
        
        // Use organization-specific service to pause
        const updatedStudy = await organizationProlificService.updateStudyStatus(studyId, { action: 'pause' });
        
        console.log(chalk.green.bold('\n✅ Study paused successfully!'));
        console.log(chalk.white('Status:'), chalk.green(updatedStudy.status));
        console.log(chalk.blue.underline(`Dashboard: https://app.prolific.co/researcher/studies/${studyId}`));
        
      } catch (error) {
        console.error(chalk.red('Error pausing study:'), error);
      } finally {
        if (rl) {
          rl.close();
        }
        await prisma.$disconnect();
      }
    }, true);
  });

program
  .command('prolific:stop')
  .description('Stop a Prolific study (cannot be restarted)')
  .option('-s, --study <studyId>', 'Prolific study ID')
  .action(async (options) => {
    await requireAuth('stop Prolific study', async () => {
      try {
        const { question } = getReadline();
        
        let studyId = options.study;
        if (!studyId) {
          studyId = await question(chalk.cyan('Prolific study ID to stop: '));
        }
        
        const confirm = await question(chalk.red('⚠️  Stopping a study is permanent. Continue? (y/N): '));
        if (confirm.toLowerCase() !== 'y') {
          console.log(chalk.gray('Study stop cancelled.'));
          return;
        }
        
        console.log(chalk.yellow('🔄 Stopping study...'));
        
        // Make API call directly to avoid frontend prisma issues
        // Get experiment to find organization
        const experiment = await prisma.experiment.findFirst({
          where: { prolificStudyId: studyId }
        });
        
        if (!experiment) {
          console.log(chalk.red(`No experiment found for Prolific study ${studyId}`));
          return;
        }
        
        // Create organization-specific Prolific service
        const organizationProlificService = await ProlificService.createForOrganization(experiment.organizationId);
        
        // Use organization-specific service to stop
        const updatedStudy = await organizationProlificService.updateStudyStatus(studyId, { action: 'stop' });
        
        console.log(chalk.green.bold('\n✅ Study stopped successfully!'));
        console.log(chalk.white('Status:'), chalk.green(updatedStudy.status));
        console.log(chalk.blue.underline(`Dashboard: https://app.prolific.co/researcher/studies/${studyId}`));
        
      } catch (error) {
        console.error(chalk.red('Error stopping study:'), error);
      } finally {
        if (rl) {
          rl.close();
        }
        await prisma.$disconnect();
      }
    }, true);
  });

program
  .command('prolific:sync')
  .description('Sync Prolific study data with database including participant demographics')
  .option('-s, --study <studyId>', 'Prolific study ID')
  .option('--all', 'Sync all studies')
  .action(async (options) => {
    await requireAuth('sync Prolific data', async () => {
      try {
        if (options.all) {
          console.log(chalk.blue.bold('\n🔄 Syncing All Prolific Studies\n'));
          
          const experiments = await prisma.experiment.findMany({
            where: {
              prolificStudyId: { not: null }
            },
            select: {
              id: true,
              name: true,
              prolificStudyId: true,
              status: true,
              createdAt: true,
              _count: {
                select: {
                  participants: {
                    where: {
                      id: {
                        not: {
                          startsWith: 'anon-session-'
                        }
                      }
                    }
                  },
                  twoVideoComparisonSubmissions: true,
                  twoVideoComparisonTasks: true
                }
              }
            }
          });
          
          if (experiments.length === 0) {
            console.log(chalk.gray('No experiments with Prolific studies found.'));
            return;
          }
          
          let totalSynced = 0;
          
          for (const exp of experiments) {
            try {
              console.log(chalk.yellow(`📡 Syncing ${exp.name} (${exp.prolificStudyId})...`));
              
              const result = await prolificService.instance.syncStudyWithDatabase(exp.prolificStudyId!);
              
              console.log(chalk.green(`  ✅ Synced ${result.syncedParticipants} participants`));
              console.log(chalk.gray(`  📊 Study status: ${result.study.status}`));
              console.log(chalk.gray(`  👥 Submissions: ${result.submissions.length}`));
              
              totalSynced += result.syncedParticipants;
              
            } catch (error) {
              console.log(chalk.red(`  ❌ Failed to sync ${exp.name}: ${error}`));
            }
          }
          
          console.log(chalk.green.bold(`\n✅ Sync complete! Total participants synced: ${totalSynced}`));
          
        } else {
          const { question } = getReadline();
          
          let studyId = options.study;
          if (!studyId) {
            studyId = await question(chalk.cyan('Prolific study ID to sync: '));
          }
          
          console.log(chalk.blue.bold('\n🔄 Syncing Prolific Study\n'));
          console.log(chalk.yellow(`📡 Syncing study ${studyId}...`));
          
          const result = await prolificService.instance.syncStudyWithDatabase(studyId);
          
          console.log(chalk.green.bold('\n✅ Sync complete!\n'));
          console.log(chalk.white('Study:'), chalk.yellow(result.study.name));
          console.log(chalk.white('Status:'), chalk.yellow(result.study.status));
          console.log(chalk.white('Participants synced:'), chalk.green(result.syncedParticipants));
          console.log(chalk.white('Total submissions:'), chalk.yellow(result.submissions.length));
          
          // Show demographic summary from synced participants
          console.log(chalk.blue('\n📊 Participant Summary:'));
          console.log(chalk.gray(`  Total submissions: ${result.submissions.length}`));
          
          // Find the experiment for this study
          const experiment = await prisma.experiment.findFirst({
            where: { prolificStudyId: studyId }
          });
          
          // Get detailed participant data from database
          const syncedParticipants = experiment ? await prisma.participant.findMany({
            where: { 
              experimentId: experiment.id
            },
            select: { metadata: true, prolificId: true }
          }).then(participants => participants.filter(p => p.prolificId)) : [];
          
          if (syncedParticipants.length > 0) {
            console.log(chalk.gray(`  Synced with demographics: ${syncedParticipants.length}`));
            
            // Extract demographics from metadata
            const demographics = syncedParticipants
              .map(p => p.metadata as any)
              .filter(m => m && (m.age || m.sex || m.nationality));
            
            if (demographics.length > 0) {
              console.log(chalk.blue('\n📈 Demographics Summary:'));
              
              // Age distribution
              const ages = demographics.filter(d => d.age).map(d => Number(d.age));
              if (ages.length > 0) {
                const avgAge = Math.round(ages.reduce((a, b) => a + b, 0) / ages.length);
                console.log(chalk.gray(`  Age: ${Math.min(...ages)}-${Math.max(...ages)} (avg: ${avgAge})`));
              }
              
              // Gender distribution
              const genders = demographics.filter(d => d.sex).reduce((acc, d) => {
                acc[d.sex] = (acc[d.sex] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);
              if (Object.keys(genders).length > 0) {
                const genderStr = Object.entries(genders)
                  .map(([gender, count]) => `${gender}: ${count}`)
                  .join(', ');
                console.log(chalk.gray(`  Gender: ${genderStr}`));
              }
              
              // Top nationalities
              const nationalities = demographics.filter(d => d.nationality).reduce((acc, d) => {
                acc[d.nationality] = (acc[d.nationality] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);
              if (Object.keys(nationalities).length > 0) {
                const topNationalities = Object.entries(nationalities)
                  .sort(([,a], [,b]) => (b as number) - (a as number))
                  .slice(0, 3)
                  .map(([nat, count]) => `${nat}: ${count}`)
                  .join(', ');
                console.log(chalk.gray(`  Top nationalities: ${topNationalities}`));
              }
            }
          }
        }
        
      } catch (error) {
        console.error(chalk.red('Error syncing Prolific data:'), error);
      } finally {
        await prisma.$disconnect();
      }
    }, true);
  });

// Debug command
program
  .command('debug:progress <slug>')
  .description('Debug progress calculation for an experiment')
  .action(async (slug) => {
    try {
      // First get experiment to check if it has Prolific integration
      const baseExperiment = await prisma.experiment.findUnique({
        where: { slug },
        select: {
          prolificStudyId: true
        }
      });
      
      if (!baseExperiment) {
        console.log(chalk.red(`Experiment "${slug}" not found.`));
        return;
      }
      
      // Determine participant status filter based on Prolific integration
      const participantStatusFilter = baseExperiment.prolificStudyId 
        ? ['approved']  // For Prolific experiments, only count approved
        : ['active', 'completed', 'approved'];  // For non-Prolific experiments, count all valid statuses
      
      const experiment = await prisma.experiment.findUnique({
        where: { slug },
        include: {
          _count: {
            select: {
              twoVideoComparisonTasks: true,
              participants: {
                where: {
                  AND: [
                    {
                      status: {
                        in: participantStatusFilter
                      }
                    },
                    {
                      prolificId: { not: null }  // Only Prolific participants, exclude anonymous
                    }
                  ]
                }
              },
              twoVideoComparisonSubmissions: true
            }
          }
        }
      });
      
      if (!experiment) {
        console.log(chalk.red(`Experiment "${slug}" not found.`));
        return;
      }
      
      console.log(chalk.blue.bold('\n🔍 Progress Debug for "' + experiment.name + '"\n'));
      
      console.log(chalk.white('Database Counts:'));
      console.log(chalk.gray(`  Two Video Comparison Tasks: ${experiment._count.twoVideoComparisonTasks}`));
      console.log(chalk.gray(`  Participants: ${experiment._count.participants}`));
      console.log(chalk.gray(`  Two Video Comparison Submissions: ${experiment._count.twoVideoComparisonSubmissions}`));
      
      console.log(chalk.white('\nExperiment Config:'));
      console.log(chalk.gray(JSON.stringify(experiment.config, null, 2)));
      
      // Calculate progress the same way the frontend does
      const evaluationsPerComparison = experiment.config?.evaluationsPerComparison;
      const targetEvaluations = evaluationsPerComparison ? experiment._count.twoVideoComparisonTasks * evaluationsPerComparison : 0;
      const progressPercentage = targetEvaluations > 0 ? Math.min((experiment._count.twoVideoComparisonSubmissions / targetEvaluations) * 100, 100) : 0;
      
      console.log(chalk.white('\nProgress Calculation:'));
      console.log(chalk.gray(`  evaluationsPerComparison from config: ${experiment.config?.evaluationsPerComparison}`));
      console.log(chalk.gray(`  evaluationsPerComparison used: ${evaluationsPerComparison || 'not set'}`));
      console.log(chalk.gray(`  targetEvaluations: ${experiment._count.twoVideoComparisonTasks} × ${evaluationsPerComparison || 'not set'} = ${targetEvaluations}`));
      console.log(chalk.gray(`  actual evaluations: ${experiment._count.twoVideoComparisonSubmissions}`));
      console.log(chalk.yellow(`  progressPercentage: ${experiment._count.twoVideoComparisonSubmissions}/${targetEvaluations} = ${Math.round(progressPercentage)}%`));
      
      if (progressPercentage !== 100 && experiment._count.twoVideoComparisonSubmissions > 0) {
        console.log(chalk.red('\n⚠️  Progress is not 100%. Possible issues:'));
        if (!experiment.config?.evaluationsPerComparison) {
          console.log(chalk.red('  - Missing evaluationsPerComparison in config (target not set)'));
          
          // Auto-fix suggestion
          if (experiment._count.twoVideoComparisonTasks > 0) {
            const actualEvaluationsPerComparison = Math.round(experiment._count.twoVideoComparisonSubmissions / experiment._count.twoVideoComparisonTasks);
            console.log(chalk.yellow(`\n💡 Auto-fix suggestion:`));
            console.log(chalk.yellow(`  Based on current data, this experiment appears to need ${actualEvaluationsPerComparison} evaluations per comparison`));
            console.log(chalk.yellow(`  Run: npm run experiment -- fix-config ${slug} --evaluations-per-comparison ${actualEvaluationsPerComparison}`));
          }
        }
        if (experiment._count.twoVideoComparisonSubmissions < targetEvaluations) {
          console.log(chalk.red(`  - Need ${targetEvaluations - experiment._count.twoVideoComparisonSubmissions} more evaluations`));
        }
      }
      
    } catch (error) {
      console.error(chalk.red('Error debugging experiment:'), error);
    } finally {
      await prisma.$disconnect();
    }
  });

// Debug participants command
program
  .command('debug:participants <slug>')
  .description('Show detailed participant information for an experiment')
  .action(async (slug) => {
    try {
      const experiment = await prisma.experiment.findUnique({
        where: { slug },
        include: {
          participants: {
            select: {
              id: true,
              prolificId: true,
              prolificSubmissionId: true,
              status: true,
              startedAt: true,
              completedAt: true,
              metadata: true
            }
          }
        }
      });
      
      if (!experiment) {
        console.log(chalk.red(`Experiment "${slug}" not found.`));
        return;
      }
      
      console.log(chalk.blue.bold('\n🔍 Participant Debug for "' + experiment.name + '"\n'));
      
      console.log(chalk.white(`Total participants: ${experiment.participants.length}\n`));
      
      experiment.participants.forEach((participant, index) => {
        console.log(chalk.yellow(`Participant ${index + 1}:`));
        console.log(chalk.gray(`  ID: ${participant.id}`));
        console.log(chalk.gray(`  Prolific ID: ${participant.prolificId || 'null'}`));
        console.log(chalk.gray(`  Submission ID: ${participant.prolificSubmissionId || 'null'}`));
        console.log(chalk.gray(`  Status: ${participant.status}`));
        console.log(chalk.gray(`  Started: ${participant.startedAt}`));
        console.log(chalk.gray(`  Completed: ${participant.completedAt || 'null'}`));
        
        if (participant.metadata) {
          const metadata = participant.metadata as any;
          if (metadata.submissionStatus) {
            console.log(chalk.gray(`  Prolific Status: ${metadata.submissionStatus}`));
          }
          if (metadata.demographics) {
            console.log(chalk.gray(`  Demographics: ${JSON.stringify(metadata.demographics)}`));
          }
        }
        console.log();
      });
      
      // Count by status
      const statusCounts = experiment.participants.reduce((acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log(chalk.white('Status breakdown:'));
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(chalk.gray(`  ${status}: ${count}`));
      });
      
      // Show filtered count (what the CLI would count)
      const participantStatusFilter = experiment.prolificStudyId 
        ? ['approved']  // For Prolific experiments, only count approved
        : ['active', 'completed', 'approved'];  // For non-Prolific experiments, count all valid statuses
        
      const validParticipants = experiment.participants.filter(p => 
        participantStatusFilter.includes(p.status) && p.prolificId
      );
      
      console.log(chalk.cyan(`\nFiltered count (${participantStatusFilter.join('/')} with prolificId): ${validParticipants.length}`));
      
    } catch (error) {
      console.error(chalk.red('Error debugging participants:'), error);
    } finally {
      await prisma.$disconnect();
    }
  });

// Debug submissions command
program
  .command('debug:submissions <slug>')
  .description('Show detailed submission information for an experiment')
  .action(async (slug) => {
    try {
      const experiment = await prisma.experiment.findUnique({
        where: { slug },
        include: {
          singleVideoEvaluationSubmissions: {
            include: {
              participant: {
                select: {
                  id: true,
                  prolificId: true,
                  status: true
                }
              },
              singleVideoEvaluationTask: {
                select: {
                  id: true,
                  scenarioId: true,
                  modelName: true
                }
              }
            }
          },
          singleVideoEvaluationTasks: {
            select: {
              id: true,
              scenarioId: true,
              modelName: true,
              videoPath: true
            }
          }
        }
      });
      
      if (!experiment) {
        console.log(chalk.red(`Experiment "${slug}" not found.`));
        return;
      }
      
      console.log(chalk.blue.bold('\n🔍 Submissions Debug for "' + experiment.name + '"\n'));
      
      console.log(chalk.white(`Tasks: ${experiment.singleVideoEvaluationTasks.length}`));
      experiment.singleVideoEvaluationTasks.forEach((task, index) => {
        console.log(chalk.gray(`  Task ${index + 1}: ${task.scenarioId} - ${task.modelName}`));
      });
      
      console.log(chalk.white(`\nSubmissions: ${experiment.singleVideoEvaluationSubmissions.length}`));
      
      // Group submissions by participant
      const submissionsByParticipant = experiment.singleVideoEvaluationSubmissions.reduce((acc, sub) => {
        const participantId = sub.participant.id;
        if (!acc[participantId]) {
          acc[participantId] = {
            participant: sub.participant,
            submissions: []
          };
        }
        acc[participantId].submissions.push(sub);
        return acc;
      }, {} as Record<string, { participant: any, submissions: any[] }>);
      
      Object.values(submissionsByParticipant).forEach(({ participant, submissions }) => {
        console.log(chalk.yellow(`\nParticipant ${participant.prolificId || participant.id}:`));
        console.log(chalk.gray(`  Status: ${participant.status}`));
        console.log(chalk.gray(`  Submissions: ${submissions.length}`));
        
        submissions.forEach((sub, index) => {
          console.log(chalk.gray(`    ${index + 1}. Task: ${sub.singleVideoEvaluationTask.scenarioId} - ${sub.singleVideoEvaluationTask.modelName}`));
          console.log(chalk.gray(`       Status: ${sub.status}, Created: ${sub.createdAt}`));
        });
      });
      
      // Count valid submissions (from approved participants only for Prolific experiments)
      const validParticipantIds = Object.values(submissionsByParticipant)
        .filter(({ participant }) => {
          if (experiment.prolificStudyId) {
            return participant.status === 'approved' && participant.prolificId;
          } else {
            return ['active', 'completed', 'approved'].includes(participant.status);
          }
        })
        .map(({ participant }) => participant.id);
      
      const validSubmissions = experiment.singleVideoEvaluationSubmissions.filter(sub => 
        validParticipantIds.includes(sub.participantId)
      );
      
      console.log(chalk.cyan(`\nValid submissions (from valid participants): ${validSubmissions.length}`));
      console.log(chalk.cyan(`Expected submissions: ${experiment.singleVideoEvaluationTasks.length} tasks × ${validParticipantIds.length} participants = ${experiment.singleVideoEvaluationTasks.length * validParticipantIds.length}`));
      
    } catch (error) {
      console.error(chalk.red('Error debugging submissions:'), error);
    } finally {
      await prisma.$disconnect();
    }
  });

// Fix config command
program
  .command('fix-config <slug>')
  .description('Fix experiment configuration')
  .option('--evaluations-per-comparison <number>', 'Set evaluations per comparison')
  .action(async (slug, options) => {
    await requireAuth('fix experiment config', async () => {
      try {
        const experiment = await prisma.experiment.findUnique({
          where: { slug }
        });
        
        if (!experiment) {
          console.log(chalk.red(`Experiment "${slug}" not found.`));
          return;
        }
        
        const updatedConfig = {
          ...experiment.config,
        };
        
        if (options.evaluationsPerComparison) {
          updatedConfig.evaluationsPerComparison = parseInt(options.evaluationsPerComparison);
        }
        
        await prisma.experiment.update({
          where: { slug },
          data: { config: updatedConfig }
        });
        
        console.log(chalk.green.bold('\n✅ Configuration updated successfully!\n'));
        console.log(chalk.white('Updated config:'));
        console.log(chalk.gray(JSON.stringify(updatedConfig, null, 2)));
        
      } catch (error) {
        console.error(chalk.red('Error fixing config:'), error);
      } finally {
        await prisma.$disconnect();
      }
    }, true);
  });

// Logout command
// Database management commands
program
  .command('db:tables')
  .description('List all database tables')
  .action(async () => {
    await requireAuth('view database tables', async () => {
      try {
        const result = await prisma.$queryRaw`
          SELECT 
            table_name,
            COALESCE(obj_description(c.oid), '') as comment
          FROM information_schema.tables t
          LEFT JOIN pg_class c ON c.relname = t.table_name
          WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `;
        
        console.log(chalk.blue.bold('\n📋 Database Tables\n'));
        if (Array.isArray(result) && result.length > 0) {
          result.forEach((table: any) => {
            console.log(chalk.white(`• ${table.table_name}`) + 
              (table.comment ? chalk.gray(` - ${table.comment}`) : ''));
          });
        } else {
          console.log(chalk.gray('No tables found'));
        }
      } catch (error) {
        console.error(chalk.red('Error listing tables:'), error);
      }
    });
  });

program
  .command('db:count')
  .description('Count records in database tables')
  .option('-t, --table <table>', 'Specific table to count')
  .action(async (options) => {
    await requireAuth('view database counts', async () => {
      try {
        if (options.table) {
          // Count specific table
          const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${options.table}"`);
          const count = Array.isArray(result) ? result[0]?.count : 0;
          console.log(chalk.blue(`📊 ${options.table}: ${Number(count).toLocaleString()} records`));
        } else {
          // Count all main tables
          console.log(chalk.blue.bold('\n📊 Record Counts\n'));
          
          const tables = [
            'Experiment',
            'TwoVideoComparisonTask', 
            'TwoVideoComparisonSubmission',
            'SingleVideoEvaluationTask',
            'SingleVideoEvaluationSubmission',
            'Participant',
            'Video',
            'organizations',
            'organization_members'
          ];
          
          for (const table of tables) {
            try {
              const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${table}"`);
              const count = Array.isArray(result) ? result[0]?.count : 0;
              console.log(chalk.white(`${table}: `) + chalk.yellow(Number(count).toLocaleString()));
            } catch (error) {
              console.log(chalk.white(`${table}: `) + chalk.red('Error'));
            }
          }
        }
      } catch (error) {
        console.error(chalk.red('Error counting records:'), error);
      }
    });
  });

// Storage management commands
program
  .command('storage:list')
  .description('List objects in cloud storage')
  .option('-p, --prefix <prefix>', 'Filter by prefix (e.g., experiments/)', '')
  .option('-b, --bucket <bucket>', 'Bucket name (uses env TIGRIS_BUCKET_NAME if not specified)')
  .option('-d, --detailed', 'Show detailed information')
  .action(async (options) => {
    await requireAuth('view storage', async () => {
      try {
        const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
        
        const client = new S3Client({
          endpoint: process.env.AWS_ENDPOINT_URL_S3 || 'https://fly.storage.tigris.dev',
          region: process.env.AWS_REGION || 'auto',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
        });
        
        const bucketName = options.bucket || process.env.TIGRIS_BUCKET_NAME || 'eval-data';
        
        console.log(chalk.blue.bold(`\n📁 Listing objects in bucket '${bucketName}'`));
        if (options.prefix) {
          console.log(chalk.gray(`   with prefix '${options.prefix}'`));
        }
        console.log();
        
        const command = new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: options.prefix,
        });
        
        const response = await client.send(command);
        
        if (!response.Contents || response.Contents.length === 0) {
          console.log(chalk.gray('No objects found'));
          return;
        }
        
        let totalSize = 0;
        
        response.Contents.forEach((obj) => {
          const sizeMB = (obj.Size || 0) / (1024 * 1024);
          totalSize += obj.Size || 0;
          
          if (options.detailed) {
            const modified = obj.LastModified?.toISOString().slice(0, 16).replace('T', ' ') || 'Unknown';
            console.log(chalk.white(`${obj.Key}`));
            console.log(chalk.gray(`  Size: ${sizeMB.toFixed(2)} MB`));
            console.log(chalk.gray(`  Modified: ${modified}`));
            console.log(chalk.gray(`  Storage: ${obj.StorageClass || 'STANDARD'}`));
            console.log();
          } else {
            console.log(chalk.white(`${obj.Key} `) + chalk.yellow(`(${sizeMB.toFixed(2)} MB)`));
          }
        });
        
        console.log(chalk.blue(`\n📊 Total: ${response.Contents.length} objects, ${(totalSize / (1024 * 1024)).toFixed(2)} MB`));
        
      } catch (error) {
        console.error(chalk.red('Error listing storage objects:'), error);
      }
    });
  });

program
  .command('db:sql <query>')
  .description('Execute a custom SQL query')
  .option('-f, --format <format>', 'Output format (table|json)', 'table')
  .action(async (query, options) => {
    await requireAuth('execute SQL query', async () => {
      try {
        console.log(chalk.blue(`\n🔍 Executing: ${chalk.white(query)}\n`));
        
        const result = await prisma.$queryRawUnsafe(query);
        
        if (Array.isArray(result) && result.length > 0) {
          if (options.format === 'json') {
            console.log(JSON.stringify(result, null, 2));
          } else {
            // Table format
            console.log(chalk.blue.bold('📋 Results:\n'));
            console.table(result);
          }
          console.log(chalk.gray(`\n(${result.length} row${result.length === 1 ? '' : 's'})`));
        } else if (Array.isArray(result) && result.length === 0) {
          console.log(chalk.gray('No results returned'));
        } else {
          console.log(chalk.green('Query executed successfully'));
          if (result) {
            console.log(chalk.gray('Result:'), result);
          }
        }
        
      } catch (error) {
        console.error(chalk.red('❌ Query failed:'), error);
      }
    });
  });

program
  .command('whoami')
  .description('Show current user information including Stack Auth User ID')
  .action(async () => {
    await requireAuth('show user info', async (auth) => {
      console.log(chalk.blue.bold('\n👤 Current User Information\n'));
      console.log(chalk.white('Email:'), chalk.cyan(auth.email || 'Unknown'));
      console.log(chalk.white('Stack Auth User ID:'), chalk.yellow(auth.userId || auth.id));
      console.log(chalk.white('Admin Status:'), auth.isAdmin ? chalk.green('Yes') : chalk.gray('No'));
      
      // Show organizations
      try {
        const userOrganizations = await getUserOrganizations(auth.userId || auth.id);
        if (userOrganizations.length > 0) {
          console.log(chalk.white('\nOrganizations:'));
          userOrganizations.forEach((membership) => {
            const org = membership.organization;
            console.log(chalk.gray(`  • ${org.name} (${org.slug}) - ${membership.role}`));
          });
        } else {
          console.log(chalk.gray('\nNo organizations found'));
        }
      } catch (error) {
        console.log(chalk.red('\nError fetching organizations:'), error);
      }
    });
  });

program
  .command('sync-stack-auth [organizationSlug]')
  .description('Sync Stack Auth team members to organization database')
  .action(async (organizationSlug) => {
    await requireAuth('sync Stack Auth team members', async (auth) => {
      try {
        // Get organization to sync
        let organizationId;
        if (organizationSlug) {
          const org = await prisma.organization.findUnique({
            where: { slug: organizationSlug }
          });
          if (!org) {
            console.log(chalk.red(`Organization "${organizationSlug}" not found.`));
            return;
          }
          organizationId = org.id;
        } else {
          organizationId = await selectOrganization(auth);
        }

        console.log(chalk.blue(`\n🔄 Syncing Stack Auth team members...`));
        console.log(chalk.gray(`🏢 Organization ID: ${organizationId}`));
        
        // Import and call the CLI-compatible sync function
        const { syncStackAuthTeamToOrganization } = await import('./stack-auth-sync-cli');
        
        const result = await syncStackAuthTeamToOrganization(organizationId);
        
        if (!result.success) {
          console.log(chalk.red(`❌ Sync failed: ${result.error}`));
          return;
        }
        
        console.log(chalk.green(`\n✅ Successfully synced Stack Auth team for: ${chalk.white(result.organization.name)}`));
        console.log(chalk.gray(`   Stack Team ID: ${result.stackTeam.id}`));
        console.log(chalk.gray(`   Total Stack Auth members: ${result.stackTeam.totalMembers}`));
        console.log(chalk.gray(`   Existing database members: ${result.sync.existingMembers}`));
        console.log(chalk.gray(`   New members added: ${result.sync.addedMembers}`));
        
        if (result.sync.newMembers.length > 0) {
          console.log(chalk.blue('\n📋 New members added:'));
          result.sync.newMembers.forEach((member: any) => {
            console.log(chalk.white(`  • ${member.email} (${member.role})`));
          });
        } else {
          console.log(chalk.gray('\n📋 All Stack Auth team members are already in the database'));
        }

      } catch (error) {
        console.error(chalk.red('Error syncing Stack Auth teams:'), error);
      }
    });
  });

program
  .command('add-member <stackUserId> [role]')
  .description('Add a Stack Auth user to your organization by their User ID')
  .action(async (stackUserId, role = 'ADMIN') => {
    await requireAuth('add organization member', async (auth) => {
      try {
        const organizationId = await selectOrganization(auth);
        
        // Get organization details
        const org = await prisma.organization.findUnique({
          where: { id: organizationId }
        });
        
        if (!org) {
          console.log(chalk.red('Organization not found'));
          return;
        }

        console.log(chalk.blue(`\n👥 Adding member to: ${chalk.white(org.name)}`));
        console.log(chalk.gray(`   Stack User ID: ${stackUserId}`));
        console.log(chalk.gray(`   Role: ${role}`));
        
        // Check if user is already a member
        const existingMember = await prisma.organizationMember.findUnique({
          where: {
            organizationId_stackUserId: {
              organizationId: organizationId,
              stackUserId: stackUserId.trim()
            }
          }
        });
        
        if (existingMember) {
          console.log(chalk.yellow(`⚠️  User is already a member of this organization with role: ${existingMember.role}`));
          return;
        }

        // Add the member
        const member = await prisma.organizationMember.create({
          data: {
            organizationId: organizationId,
            stackUserId: stackUserId.trim(),
            role: role.toUpperCase() as any
          }
        });

        console.log(chalk.green(`\n✅ Successfully added user to ${org.name}`));
        console.log(chalk.gray(`   Member ID: ${member.id}`));
        console.log(chalk.gray(`   Role: ${member.role}`));
        console.log(chalk.gray(`   Stack User ID: ${member.stackUserId}`));

      } catch (error) {
        console.error(chalk.red('Error adding member:'), error);
      }
    });
  });

program
  .command('logout')
  .description('Clear stored authentication')
  .action(async () => {
    await clearAuth();
  });

// Cleanup function
async function cleanup() {
  try {
    await prisma.$disconnect();
    if (rl) {
      rl.close();
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Handle process exit
process.on('exit', () => {
  if (rl) {
    rl.close();
  }
});

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(0);
});

// Create organization command
program
  .command('create-organization')
  .description('Create a new organization and add current user as owner')
  .option('-n, --name <name>', 'Organization name')
  .option('-s, --slug <slug>', 'Organization slug')
  .option('-d, --description <description>', 'Organization description')
  .action(async (options) => {
    try {
      const auth = await requireAuth('create organization', async (authData) => {
        console.log(chalk.blue('🏢 Creating a new organization...'));
        
        // Initialize readline
        const rl = getReadline();
        const question = promisify(rl.question).bind(rl);
        
        // Get organization details
        const name = options.name || await question('Organization name: ');
        const slug = options.slug || slugify(name);
        const description = options.description || await question('Description (optional): ') || null;
        
        // Check if slug is available
        const existing = await prisma.organization.findUnique({
          where: { slug }
        });
        
        if (existing) {
          console.log(chalk.red(`❌ Organization with slug "${slug}" already exists`));
          process.exit(1);
        }
        
        // Create organization
        const organization = await prisma.organization.create({
          data: {
            name,
            slug,
            description,
            stackTeamId: null // Will be set when Stack Auth integration is added
          }
        });
        
        console.log(chalk.green(`✅ Created organization: ${name} (${slug})`));
        
        // Add current user as owner
        await prisma.organizationMember.create({
          data: {
            stackUserId: authData.userId,
            organizationId: organization.id,
            role: 'OWNER'
          }
        });
        
        console.log(chalk.green(`✅ Added you as owner of the organization`));
        console.log(chalk.blue(`\n🎉 Organization setup complete!`));
        console.log(chalk.gray(`   You can now access the admin dashboard with full permissions.`));
        
        return organization;
      });
      
      if (!auth) {
        console.log(chalk.red('❌ Authentication failed'));
        process.exit(1);
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to create organization:'), error);
      process.exit(1);
    } finally {
      await cleanup();
    }
  });

program.parse();

// Cleanup after parsing is complete
process.nextTick(async () => {
  await cleanup();
});