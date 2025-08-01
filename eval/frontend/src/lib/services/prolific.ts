import { prisma } from '../prisma';
import Papa from 'papaparse';
import { shouldUpdateExperimentStatus, ExperimentStatus } from '../utils/status';

const PROLIFIC_API_URL = 'https://api.prolific.com';
const PROLIFIC_API_TOKEN = process.env.PROLIFIC_API_TOKEN;

export interface ProlificStudy {
  id: string;
  name: string;
  status: string;
  total_available_places: number;
  number_of_submissions: number;
  reward: number;
  date_created: string;
  external_study_url: string;
  internal_name?: string;
}

export interface ProlificSubmission {
  'Submission id': string;
  'Participant id': string;
  'Status': string;
  'Completed at'?: string;
  'Started at'?: string;
  'Study code'?: string;
  'Reward'?: string;
  'Time taken'?: string;
  'Is complete'?: string;
  'Bonus payments'?: string;
  'Age'?: string;
  'Sex'?: string;
  'Nationality'?: string;
  'Language'?: string;
  'Country of birth'?: string;
  'Country of residence'?: string;
  'Fluent languages'?: string;
  'Employment status'?: string;
  'Student status'?: string;
}

export interface CreateStudyRequest {
  experimentId: string;
  title: string;
  description: string;
  reward: number;
  totalParticipants: number;
}

export interface StudyActionRequest {
  action: 'publish' | 'pause' | 'stop' | 'start' | 'force_reopen';
}

export interface SubmissionActionRequest {
  action: 'approve' | 'reject';
  submissionIds: string[];
  rejectionReason?: string;
}

export function generateCompletionCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length))
  }
  return code
}

export class ProlificService {
  constructor(private apiToken?: string, private organizationId?: string) {
    // Get token from parameter, organization settings, or environment at runtime
    this.apiToken = apiToken || process.env.PROLIFIC_API_TOKEN;
    this.organizationId = organizationId;
    if (!this.apiToken) {
      throw new Error('Prolific API token not configured');
    }
  }

  static async createForOrganization(organizationId: string): Promise<ProlificService> {
    try {
      // Fetch organization settings to get Prolific API key
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true }
      });

      if (!organization) {
        throw new Error(`Organization ${organizationId} not found`);
      }

      const settings = organization.settings as any || {};
      const orgProlificKey = settings.prolificApiKey;

      if (!orgProlificKey) {
        // Fall back to global API key if organization doesn't have one configured
        const globalKey = process.env.PROLIFIC_API_TOKEN;
        if (!globalKey) {
          throw new Error(`No Prolific API key configured for organization ${organizationId} and no global fallback available`);
        }
        console.warn(`Using global Prolific API key for organization ${organizationId} - consider configuring per-organization credentials`);
        return new ProlificService(globalKey, organizationId);
      }

      return new ProlificService(orgProlificKey, organizationId);
    } catch (error) {
      console.error('Failed to create ProlificService for organization:', error);
      throw error;
    }
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${PROLIFIC_API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Token ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Prolific API error (${response.status}): ${JSON.stringify(error)}`);
    }

    return response.json();
  }

  private async makeCsvRequest(endpoint: string, options: RequestInit = {}): Promise<string> {
    const response = await fetch(`${PROLIFIC_API_URL}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Token ${this.apiToken}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text(); // still text, could be an HTML error page
      throw new Error(`Prolific API error (${response.status}): ${errorText}`);
    }

    return response.text(); // returns raw CSV text
  }


  async createStudy(request: CreateStudyRequest): Promise<ProlificStudy> {
    // Validate experiment exists
    const experiment = await prisma.experiment.findUnique({
      where: { id: request.experimentId },
      include: {
        _count: {
          select: { 
            twoVideoComparisonTasks: true,
            singleVideoEvaluationTasks: true
          }
        }
      }
    });

    if (!experiment) {
      throw new Error('Experiment not found');
    }

    // Get app URL
    let appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || process.env.BASE_URL;
    
    if (!appUrl || appUrl.includes('localhost')) {
      throw new Error('NEXT_PUBLIC_APP_URL environment variable must be set to a public HTTPS URL for Prolific integration');
    }
    
    if (!appUrl.startsWith('https://')) {
      appUrl = appUrl.replace('http://', 'https://');
    }

    // Calculate estimated time based on evaluation mode
    let estimatedCompletionTime: number;
    if (experiment.evaluationMode === 'single_video') {
      // For single video: estimate 1 minute per video task
      const videoTaskCount = experiment._count.singleVideoEvaluationTasks || 1;
      estimatedCompletionTime = Math.max(1, Math.ceil(videoTaskCount * 1));
    } else {
      // For comparison: estimate 2 minutes per comparison
      estimatedCompletionTime = Math.max(1, Math.ceil(experiment._count.twoVideoComparisonTasks * 2));
    }
    const studyCompletionCode = generateCompletionCode();

    // Use unified URL format for both comparison and single video evaluations
    const externalStudyUrl = `${appUrl}/prolific?PROLIFIC_PID={{%PROLIFIC_PID%}}&SESSION_ID={{%SESSION_ID%}}&STUDY_ID={{%STUDY_ID%}}&experiment_id=${request.experimentId}`;

    // Get demographics from experiment config
    const demographics = (experiment.config as any)?.demographics;
    
    // Build Prolific filters based on demographics
    const filters: any[] = [
      {
        filter_id: "approval_rate",
        selected_range: {
          lower: demographics?.approvalRate || 95,
          upper: 100
        }
      }
    ];

    // Add age filter if specified
    if (demographics?.ageMin || demographics?.ageMax) {
      filters.push({
        filter_id: "age",
        selected_range: {
          lower: demographics.ageMin || 18,
          upper: demographics.ageMax || 100
        }
      });
    }

    // Add gender filter if specified
    if (demographics?.gender && demographics.gender.length > 0) {
      filters.push({
        filter_id: "sex",
        selected_values: demographics.gender
      });
    }

    // Add country filter if specified
    if (demographics?.country && demographics.country.length > 0) {
      filters.push({
        filter_id: "country_of_residence",
        selected_values: demographics.country
      });
    }

    // Add language filter if specified
    if (demographics?.language && demographics.language.length > 0) {
      filters.push({
        filter_id: "fluent_languages",
        selected_values: demographics.language
      });
    }

    const studyData = {
      name: request.title,
      description: request.description,
      external_study_url: externalStudyUrl,
      estimated_completion_time: estimatedCompletionTime,
      reward: Math.round(request.reward * 100), // Convert to pence/cents
      total_available_places: request.totalParticipants,
      prolific_id_option: "url_parameters",
      completion_codes: [
        {
          code: studyCompletionCode,
          code_type: "COMPLETED",
          actions: [
            { action: "AUTOMATICALLY_APPROVE" }
          ]
        }
      ],
      device_compatibility: ["desktop"],
      peripheral_requirements: ["audio"],
      filters: filters
    };

    const prolificStudy = await this.makeRequest<ProlificStudy>('/api/v1/studies/', {
      method: 'POST',
      body: JSON.stringify(studyData),
    });

    // Update experiment with Prolific study ID, completion code, and initial status
    await prisma.experiment.update({
      where: { id: request.experimentId },
      data: { 
        prolificStudyId: prolificStudy.id,
        config: {
          ...experiment.config as object,
          prolificCompletionCode: studyCompletionCode,
          evaluationsPerComparison: request.totalParticipants,
          prolificStatus: prolificStudy.status // Track initial Prolific status (typically UNPUBLISHED)
        }
      }
    });

    return prolificStudy;
  }

  async getStudy(studyId: string): Promise<ProlificStudy> {
    return this.makeRequest<ProlificStudy>(`/api/v1/studies/${studyId}/`);
  }

  async getStudies(): Promise<ProlificStudy[]> {
    const data = await this.makeRequest<{ results: ProlificStudy[] }>('/api/v1/studies/');
    return data.results;
  }

  async updateStudyStatus(studyId: string, action: StudyActionRequest): Promise<ProlificStudy> {
    let endpoint = `/api/v1/studies/${studyId}/`;
    let method = 'PATCH';
    let requestBody: any = {};

    switch (action.action) {
      case 'publish':
        endpoint += 'transition/';
        method = 'POST';
        requestBody = { action: 'PUBLISH' };
        break;
      case 'pause':
        endpoint += 'transition/';
        method = 'POST';
        requestBody = { action: 'PAUSE' };
        break;
      case 'stop':
        endpoint += 'transition/';
        method = 'POST';
        requestBody = { action: 'STOP' };
        break;
      case 'start':
        endpoint += 'transition/';
        method = 'POST';
        requestBody = { action: 'START' };
        break;
      case 'force_reopen':
        endpoint += 'transition/';
        method = 'POST';
        requestBody = { action: 'FORCE_REOPEN' };
        break;
    }

    const updatedStudy = await this.makeRequest<ProlificStudy>(endpoint, {
      method,
      body: JSON.stringify(requestBody),
    });

    // Update local experiment config with new Prolific status
    const experiment = await prisma.experiment.findFirst({
      where: { prolificStudyId: studyId }
    });

    if (experiment) {
      await prisma.experiment.update({
        where: { id: experiment.id },
        data: {
          config: {
            ...experiment.config as object,
            prolificStatus: updatedStudy.status
          }
        }
      });
      console.log(`✓ Updated local experiment config with Prolific status: ${updatedStudy.status}`);
    }

    return updatedStudy;
  }

  async getSubmissions(studyId: string): Promise<{ results: ProlificSubmission[] }> {
    return this.makeRequest<{ results: ProlificSubmission[] }>(`/api/v1/studies/${studyId}/submissions/`);
  }

  async getParticipant(participantId: string): Promise<any> {
    return this.makeRequest<any>(`/api/v1/participants/${participantId}/`);
  }
  async getSubmissionsExport(
    studyId: string
  ): Promise<{ results: ProlificSubmission[] }> {
    const csvText = await this.makeCsvRequest(`/api/v1/studies/${studyId}/export/`);

    const { data, errors } = Papa.parse<ProlificSubmission>(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    if (errors.length > 0) {
      throw new Error(`CSV parse error: ${errors.map(e => e.message).join(', ')}`);
    }

    return { results: data };
  }

  async processSubmissions(request: SubmissionActionRequest): Promise<{ submissionId: string; success: boolean; error?: any }[]> {
    const results = await Promise.all(
      request.submissionIds.map(async (submissionId: string) => {
        try {
          const endpoint = `/api/v1/submissions/${submissionId}/transition/`;

          const requestBody = request.action === 'approve'
            ? { action: 'APPROVE' }
            : { action: 'REJECT', rejection_category: request.rejectionReason || 'LOW_EFFORT' };

          await this.makeRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify(requestBody),
          });

          return { submissionId, success: true };
        } catch (error) {
          return { submissionId, success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      })
    );

    return results;
  }

  async syncStudyWithDatabase(studyId: string): Promise<{
    study: ProlificStudy;
    submissions: ProlificSubmission[];
    syncedParticipants: number;
  }> {
    const [study, submissionsData] = await Promise.all([
      this.getStudy(studyId),
      this.getSubmissionsExport(studyId)
    ]);

    const submissions = submissionsData.results;

    // Find the experiment associated with this study
    const experiment = await prisma.experiment.findFirst({
      where: { prolificStudyId: studyId }
    });

    if (!experiment) {
      throw new Error(`No experiment found for Prolific study ${studyId}`);
    }

    // Sync participants and their demographic data
    let syncedParticipants = 0;
    
    console.log(`Found ${submissions.length} submissions to sync`);
    
    
    for (const submission of submissions) {
      try {
        // Skip if participant ID is missing
        if (!submission['Participant id']) {
          console.log(`Skipping submission ${submission['Submission id']}: missing participant ID`);
          continue;
        }

        const {
          'Age': age,
          'Sex': sex,
          'Nationality': nationality,
          'Language': language,
          'Country of birth': country_of_birth,
          'Country of residence': country_of_residence,
          'Employment status': employment_status,
          'Student status': student_status,
        } = submission;

        const participantInfo = {
          age: age ? Number(age) : undefined,
          sex,
          nationality,
          language,
          country_of_birth,
          country_of_residence,
          employment_status,
          student_status,
        };

        console.log(`Demographics for participant ${submission['Participant id']}:`, JSON.stringify(participantInfo, null, 2));

        // Find or create participant for this specific experiment
        // First, try to find existing participant for this experiment
        let participant = await prisma.participant.findFirst({
          where: {
            OR: [
              {
                prolificId: submission['Participant id'],
                experimentId: experiment.id
              },
              {
                prolificSubmissionId: submission['Submission id'],
                experimentId: experiment.id
              }
            ]
          }
        });
        
        if (participant) {
          // Update existing participant for this experiment
          participant = await prisma.participant.update({
            where: { id: participant.id },
            data: {
              status: submission['Status'].toLowerCase(),
              metadata: {
                demographics: participantInfo || null,
                prolificSubmissionId: submission['Submission id'],
                submissionStatus: submission['Status'],
                completedDateTime: submission['Completed at'],
                startedDateTime: submission['Started at'],
                studyCode: submission['Study code'],
                reward: study.reward,
                submissionReward: submission['Reward'] ? Number(submission['Reward']) : undefined,
                timeTaken: submission['Time taken'] ? Number(submission['Time taken']) : undefined,
                isComplete: submission['Is complete'] === 'true' || submission['Is complete'] === '1',
                bonusPayments: submission['Bonus payments']
                  ? (() => {
                      try {
                        const parsed = JSON.parse(submission['Bonus payments']);
                        return Array.isArray(parsed) ? parsed.map(Number) : [];
                      } catch {
                        return [];
                      }
                    })()
                  : [],
                totalPayment:
                  (study.reward || 0) +
                  ((submission['Bonus payments']
                    ? (() => {
                        try {
                          const parsed = JSON.parse(submission['Bonus payments']);
                          return Array.isArray(parsed) ? parsed.reduce((a, b) => a + Number(b), 0) : 0;
                        } catch {
                          return 0;
                        }
                      })()
                    : 0) || 0),
                lastSyncedAt: new Date().toISOString()
              }
            }
          });
        } else {
          // Create new participant for this experiment
          // Handle case where prolificId might already exist in another experiment
          try {
            participant = await prisma.participant.create({
              data: {
                prolificId: submission['Participant id'],
                sessionId: `prolific_${submission['Participant id']}_${experiment.id}_${Date.now()}`,
                experimentId: experiment.id,
                status: submission['Status'].toLowerCase(),
                assignedTwoVideoComparisonTasks: [],
                metadata: {
                  demographics: participantInfo || null,
                  prolificSubmissionId: submission['Submission id'],
                  submissionStatus: submission['Status'],
                  completedDateTime: submission['Completed at'],
                  startedDateTime: submission['Started at'],
                  studyCode: submission['Study code'],
                  reward: study.reward,
                  submissionReward: submission['Reward'] ? Number(submission['Reward']) : undefined,
                  timeTaken: submission['Time taken'] ? Number(submission['Time taken']) : undefined,
                  isComplete: submission['Is complete'] === 'true' || submission['Is complete'] === '1',
                  bonusPayments: submission['Bonus payments']
                    ? (() => {
                        try {
                          const parsed = JSON.parse(submission['Bonus payments']);
                          return Array.isArray(parsed) ? parsed.map(Number) : [];
                        } catch {
                          return [];
                        }
                      })()
                    : [],
                  totalPayment:
                    (study.reward || 0) +
                    ((submission['Bonus payments']
                      ? (() => {
                          try {
                            const parsed = JSON.parse(submission['Bonus payments']);
                            return Array.isArray(parsed) ? parsed.reduce((a, b) => a + Number(b), 0) : 0;
                          } catch {
                            return 0;
                          }
                        })()
                      : 0) || 0),
                  lastSyncedAt: new Date().toISOString()
                }
              }
            });
          } catch (error: any) {
            if (error.code === 'P2002' && error.meta?.target?.includes('prolificId')) {
              // Unique constraint violation - participant exists in another experiment
              console.log(`⚠️  Participant ${submission['Participant id']} already exists in another experiment. Creating with unique session ID.`);
              participant = await prisma.participant.create({
                data: {
                  prolificId: null, // Set to null to avoid unique constraint
                  prolificSubmissionId: submission['Submission id'], // Use submission ID as alternative identifier
                  sessionId: `prolific_${submission['Participant id']}_${experiment.id}_${Date.now()}`,
                  experimentId: experiment.id,
                  status: submission['Status'].toLowerCase(),
                  assignedTwoVideoComparisonTasks: [],
                  metadata: {
                    originalProlificId: submission['Participant id'], // Store original ID in metadata
                    demographics: participantInfo || null,
                    prolificSubmissionId: submission['Submission id'],
                    submissionStatus: submission['Status'],
                    completedDateTime: submission['Completed at'],
                    startedDateTime: submission['Started at'],
                    studyCode: submission['Study code'],
                    reward: study.reward,
                    submissionReward: submission['Reward'] ? Number(submission['Reward']) : undefined,
                    timeTaken: submission['Time taken'] ? Number(submission['Time taken']) : undefined,
                    isComplete: submission['Is complete'] === 'true' || submission['Is complete'] === '1',
                    bonusPayments: submission['Bonus payments']
                      ? (() => {
                          try {
                            const parsed = JSON.parse(submission['Bonus payments']);
                            return Array.isArray(parsed) ? parsed.map(Number) : [];
                          } catch {
                            return [];
                          }
                        })()
                      : [],
                    totalPayment:
                      (study.reward || 0) +
                      ((submission['Bonus payments']
                        ? (() => {
                            try {
                              const parsed = JSON.parse(submission['Bonus payments']);
                              return Array.isArray(parsed) ? parsed.reduce((a, b) => a + Number(b), 0) : 0;
                            } catch {
                              return 0;
                            }
                          })()
                        : 0) || 0),
                    lastSyncedAt: new Date().toISOString()
                  }
                }
              });
            } else {
              throw error; // Re-throw if it's not a unique constraint error
            }
          }
        }


        syncedParticipants++;
        console.log(`✓ Synced participant ${submission['Participant id']}`);
      } catch (error) {
        console.error(`Failed to sync participant ${submission['Participant id']}:`, error);
      }
    }

    // Auto-update experiment status based on Prolific study status using smart status management
    const statusUpdate = shouldUpdateExperimentStatus(
      experiment.status,
      study.status,
      !!experiment.startedAt
    );

    let statusData: any = {
      config: {
        ...experiment.config as object,
        prolificStatus: study.status
      }
    };

    if (statusUpdate.shouldUpdate) {
      statusData.status = statusUpdate.newStatus;
      
      // Set timestamps based on new status
      if (statusUpdate.newStatus === ExperimentStatus.ACTIVE && !experiment.startedAt) {
        statusData.startedAt = new Date();
      } else if (statusUpdate.newStatus === ExperimentStatus.COMPLETED && !experiment.completedAt) {
        statusData.completedAt = new Date();
      }

      await prisma.experiment.update({
        where: { id: experiment.id },
        data: statusData
      });
      
      console.log(`✓ ${statusUpdate.reason}`);
    } else {
      // Still update config to track Prolific status even if experiment status doesn't change
      await prisma.experiment.update({
        where: { id: experiment.id },
        data: statusData
      });
      
      console.log(`✓ ${statusUpdate.reason}`);
    }

    return {
      study,
      submissions,
      syncedParticipants
    };
  }

  async getExperimentsWithProlificStudies() {
    return prisma.experiment.findMany({
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
  }
}

let _prolificService: ProlificService | null = null;

export const prolificService = {
  get instance(): ProlificService {
    if (!_prolificService) {
      _prolificService = new ProlificService();
    }
    return _prolificService;
  },

  // New method for organization-specific instances
  async forOrganization(organizationId: string): Promise<ProlificService> {
    return ProlificService.createForOrganization(organizationId);
  }
};