# OWL Human Evaluation Framework

A comprehensive Next.js-based platform for conducting human evaluations of diffusion world models through A/B testing and comparative analysis.

## Overview

This framework provides a modern web interface for A/B testing diffusion world models through:
- Side-by-side video comparison with synchronized playback
- Structured evaluation across four key dimensions
- Real-time progress tracking and analytics
- Support for both local testing and crowd-sourced evaluations via Prolific

## Architecture

The entire application is built with **Next.js 14**, using:
- **App Router** for modern React Server Components
- **API Routes** for backend functionality (no separate backend needed!)
- **TypeScript** for type safety
- **Tailwind CSS** + **Radix UI** for beautiful, accessible components
- **File-based data storage** for simplicity (easily swappable for a database)

```
eval/
├── frontend/                    # Next.js application
│   ├── src/
│   │   ├── app/                # Pages and API routes
│   │   ├── components/         # Reusable UI components
│   │   └── lib/               # Core logic (evaluation, analysis)
│   └── public/                # Static assets
├── models/                    # Model interfaces and loaders
├── evaluation/                # Evaluation framework and criteria
├── scripts/                   # CLI tools for experiment management
├── prolific/                  # Prolific integration
├── analysis/                  # Statistical analysis tools
└── data/                     # Generated evaluations and results
```

## Quick Start

### Prerequisites
- Node.js 18+

### Installation & Running

1. **Clone and install:**
```bash
cd eval/frontend
npm install
```

2. **Set up environment:**
```bash
cp .env.local.example .env.local
```

3. **Run the development server:**
```bash
npm run dev
```

Access the application at http://localhost:3000

### Docker Deployment

```bash
docker-compose up
```

## Key Features

### 1. Evaluation Interface (`/evaluate/[id]`)
- Synchronized dual video playback
- Four-dimension rating system based on the paper:
  - **Overall Quality**: General realism and believability
  - **Controllability**: Accuracy in following inputs  
  - **Visual Quality**: Frame clarity and aesthetics
  - **Temporal Consistency**: Motion smoothness

### 2. Admin Dashboard (`/admin`)
- Real-time evaluation statistics
- Model performance visualization with radar charts
- Progress tracking across scenarios
- Exportable results

### 3. API Routes (Built into Next.js!)
```
GET  /api/comparisons              # List all comparisons
GET  /api/comparisons/[id]         # Get specific comparison
POST /api/submit-evaluation        # Submit evaluation results
GET  /api/evaluation-stats         # Get statistics
GET  /api/model-performance        # Get performance metrics
```

### 4. Experiment Management (Scripts)

Use the management scripts for various operations:

```bash
# Install dependencies
npm install

# Use the unified CLI from project root
./evalctl list
./evalctl create --name "My Experiment"
./evalctl db:count
./evalctl storage:list
```

See [CLI Scripts Documentation](./cli-scripts.md) for complete command reference.

## Evaluation Workflow

1. **Generate Comparisons** (using CLI)
   - Create video pairs from different models using `./evalctl create`
   - Assign videos automatically with `./evalctl assign-videos`
   - Store metadata for analysis

2. **Conduct Evaluations** (via web interface)
   - Participants watch synchronized videos
   - Rate across four dimensions
   - Results saved automatically

3. **Analyze Results** (built-in analytics)
   - View real-time statistics in admin dashboard
   - Export data for detailed analysis
   - Calculate inter-rater reliability

## Prolific Integration

For crowd-sourced evaluations:

1. Configure Prolific API key in your organization settings:
   - Navigate to `/{organizationSlug}/settings`
   - Go to the "Integrations" tab
   - Enter your Prolific API key

2. Create and launch a study:
```bash
./evalctl launch my-experiment-slug \
  --prolific \
  --prolific-participants 100 \
  --prolific-title "Matrix-Game Study"
```

3. Participants access via special URL with their ID
4. Completion codes displayed automatically

## Development

### Project Structure

```
src/
├── app/                      # Next.js App Router
│   ├── page.tsx             # Home page
│   ├── evaluate/[id]/       # Evaluation interface
│   ├── admin/              # Admin dashboard
│   └── api/                # API routes
├── components/ui/          # Reusable components
└── lib/                   # Core logic
    ├── evaluation/        # A/B testing framework
    └── analysis/         # Statistical analysis
```

### Adding New Features

1. **New API Route:**
```typescript
// src/app/api/my-endpoint/route.ts
export async function GET(request: Request) {
  // Your logic here
  return NextResponse.json({ data })
}
```

2. **New UI Component:**
```typescript
// src/components/ui/my-component.tsx
export function MyComponent({ prop }: Props) {
  return <div className="...">Content</div>
}
```

## Configuration

Edit evaluation parameters in `src/lib/config.ts`:

```typescript
export function getConfig() {
  return {
    outputDir: './data/evaluations',
    targetEvaluationsPerComparison: 5,
    scenarios: ['beach', 'desert', 'forest', ...],
    // ... more settings
  }
}
```

## Building for Production

```bash
# Build the application
npm run build

# Start production server
npm start

# Or use Docker
docker build -t eval ./frontend
docker run -p 3000:3000 eval
```

## API Reference

All API endpoints are implemented as Next.js API routes:

### GET `/api/comparisons`
Returns list of available comparisons with evaluation counts.

### POST `/api/submit-evaluation`
Submit evaluation results.

**Body:**
```json
{
  "comparison_id": "uuid",
  "dimension_scores": {
    "overall_quality": "A",
    "controllability": "B"
  },
  "completion_time_seconds": 120
}
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Make changes and test
4. Submit a pull request

## Tech Stack

- **Next.js 14** - Full-stack React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Radix UI** - Accessible components
- **Recharts** - Data visualization
- **UUID** - Unique identifiers

## License

MIT