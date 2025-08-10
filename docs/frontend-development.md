# Frontend Development

Development-specific documentation for the Next.js evaluation platform.

## Setup

```bash
npm install
cp .env.local.example .env.local
# Edit .env.local with your credentials

npx prisma generate
npx prisma db push
npm run dev
```

## Environment Variables

### Required
- `DATABASE_URL` - PostgreSQL connection string
- `NEXT_PUBLIC_STACK_PROJECT_ID` - Stack Auth project ID
- `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY` - Stack Auth client key
- `STACK_SECRET_SERVER_KEY` - Stack Auth server secret

### Optional
- `NEXT_PUBLIC_APP_URL` - Base URL for callbacks

**Note**: Prolific API keys are now configured per-organization in the organization settings UI, not via environment variables.

## CLI Commands

#### Experiment Management
```bash
# Create experiments
npm run experiment create --name "My Study"
npm run experiment create-bulk --models "genie-2b,diamond" --scenarios "forest,desert"

# Manage experiments
npm run experiment list
npm run experiment launch <slug> --prolific
npm run experiment stats <slug>
```

#### Video Management
```bash
# List and edit videos
npm run experiment list-videos --model "genie-2b"
npm run experiment bulk-edit-videos --pattern "forest_*.mp4" --set-model "genie-2b"
npm run experiment assign-videos --experiment my-study --strategy auto
```

#### Authentication
```bash
# Clear stored authentication
npm run experiment logout
```

## Database

```bash
# View database
npx prisma studio

# Reset database
npx prisma db push --force-reset

# Generate client after schema changes
npx prisma generate
```

## Building

```bash
npm run build
npm start
```

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API endpoints
│   ├── admin/            # Admin dashboard
│   ├── evaluate/[id]/    # Evaluation interface
│   └── prolific/         # Prolific integration
├── components/
│   ├── admin/            # Admin components
│   └── ui/              # Base UI components
└── lib/                 # Utilities and config
```

## Authentication

- **Development**: Authentication skipped with warning if Stack Auth not configured
- **Production**: Requires Stack Auth setup with admin users
- **CLI**: Browser-based authentication with token caching