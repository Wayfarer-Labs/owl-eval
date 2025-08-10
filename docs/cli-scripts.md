# CLI Tools and Scripts

The OWL Evaluation Framework includes a unified TypeScript CLI for managing all aspects of the evaluation system.

## Main CLI: `evalctl`

The primary command-line interface for all operations. Navigate to the `eval/` directory and use `./evalctl` for all commands.

### Authentication

All CLI commands require authentication through your Stack Auth account:

```bash
./evalctl list  # Automatically prompts for login if needed
```

Authentication tokens are cached for 7 days for convenience.

### Organization Selection

For multi-tenant support, the CLI prompts you to select an organization when needed:

```bash
./evalctl list
# Prompts: Select an organization:
# 1. My Organization (my-org) - OWNER
# 2. Research Lab (research-lab) - MEMBER
```

## Command Categories

### 📊 **Experiment Management**

Create, manage, and monitor experiments:

```bash
# Create experiments interactively
./evalctl create

# List experiments in your organization
./evalctl list
./evalctl list --status active

# Launch experiments
./evalctl launch my-experiment-slug
./evalctl launch my-experiment-slug --prolific

# View experiment statistics
./evalctl stats my-experiment-slug

# Complete experiments
./evalctl complete my-experiment-slug

# Create multiple experiments (matrix mode)
./evalctl create-bulk --matrix-file experiments.json
```

### 👥 **Prolific Integration**

Manage human evaluation studies on Prolific:

```bash
# Create Prolific study for experiment
./evalctl prolific:create my-experiment-slug \\
  --title "Study Title" \\
  --description "Study description" \\
  --reward 8.00 --participants 50

# List all Prolific studies
./evalctl prolific:list

# Check study status
./evalctl prolific:status study-id

# Sync participant data
./evalctl prolific:sync study-id
```

### 🎥 **Video Library Management**

Manage video assets and metadata:

```bash
# List videos in library
./evalctl list-videos
./evalctl list-videos --model genie-2b

# Bulk edit video metadata
./evalctl bulk-edit-videos --tag "forest"

# Create video evaluation tasks
./evalctl create-video-tasks my-experiment-slug

# Auto-assign videos to experiments
./evalctl assign-videos my-experiment-slug --auto
```

### 🗄️ **Database Operations**

Database inspection and management:

```bash
# List all database tables
./evalctl db:tables

# Count records in tables
./evalctl db:count
./evalctl db:count --table Experiment

# Open database studio (visual interface)
npm run db:studio
```

### ☁️ **Cloud Storage**

Manage cloud storage objects:

```bash
# List storage objects
./evalctl storage:list
./evalctl storage:list --detailed
./evalctl storage:list --prefix video-library/
```

### 🛠️ **Development Tools**

Debugging and maintenance commands:

```bash
# Debug experiment progress calculation
./evalctl debug:progress my-experiment-slug

# Fix experiment configuration
./evalctl fix-config my-experiment-slug --evaluations-per-comparison 5

# Clear authentication cache
./evalctl logout
```

## Configuration

### Environment Variables

The CLI uses the same environment configuration as the web application. Set up `eval/frontend/.env.local`:

```env
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/owleval"

# Authentication
NEXT_PUBLIC_STACK_PROJECT_ID="your-project-id"
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY="your-client-key"
STACK_SECRET_SERVER_KEY="your-server-key"

# Storage (optional)
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
AWS_REGION="us-east-1"
TIGRIS_BUCKET_NAME="your-bucket"

# Prolific API keys are now configured per-organization
# Go to Organization Settings > Integrations to add your Prolific API key
```

### Organization Support

All CLI commands are organization-aware and will:
1. Automatically filter data by your selected organization
2. Respect role-based permissions (OWNER, ADMIN, MEMBER, VIEWER)
3. Maintain data isolation between organizations

## Script Architecture

### Core Files

- **`evalctl.ts`** - Main unified CLI with all commands
- **`auth.ts`** - Authentication utilities and token management
- **`prisma-client.ts`** - Database client configuration
- **`cli-organization.ts`** - Organization management for CLI operations

### Design Principles

- **Type Safety**: Full TypeScript with Prisma integration
- **Organization Awareness**: Multi-tenant support throughout
- **Unified Interface**: Single command for all operations
- **Error Handling**: Graceful error messages and recovery
- **Authentication**: Secure token-based auth with Stack integration

## Common Workflows

### Setting up a new evaluation study:

```bash
# 1. Check available videos
./evalctl list-videos

# 2. Create experiment
./evalctl create

# 3. Launch with Prolific integration
./evalctl launch my-study --prolific \\
  --prolific-title "World Model Evaluation" \\
  --prolific-reward 8.00 --prolific-participants 50

# 4. Monitor progress
./evalctl stats my-study

# 5. Complete when done
./evalctl complete my-study
```

### Database maintenance:

```bash
# Check system status
./evalctl db:count

# Open visual interface for complex queries
npm run db:studio

# Debug specific experiment
./evalctl debug:progress problematic-experiment
```

For additional help on any command, use the `--help` flag:

```bash
./evalctl --help
./evalctl create --help
./evalctl prolific:create --help
```