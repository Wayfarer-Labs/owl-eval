# Matrix-Game Human Evaluation Harness

A comprehensive Next.js-based platform for conducting human evaluations of diffusion world models, specifically designed to recreate the evaluation methodology from the Matrix-Game paper.

## Overview

This harness provides a modern web interface for A/B testing diffusion world models through:
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
matrix-game-eval/
├── frontend/                    # Next.js application
│   ├── src/
│   │   ├── app/                # Pages and API routes
│   │   ├── components/         # Reusable UI components
│   │   └── lib/               # Core logic (evaluation, analysis)
│   └── public/                # Static assets
├── models/                    # Python model interfaces
├── evaluation/                # Python evaluation framework
├── scripts/                   # CLI tools for data generation
└── data/                     # Generated evaluations and results
```

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.8+ (only for generating test data)

### Installation & Running

1. **Clone and install:**
```bash
cd matrix-game-eval/frontend
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

### 4. Data Generation (Python Scripts)

Generate test comparisons using the Python CLI:

```bash
# Install Python dependencies
pip install -r requirements.txt

# Generate test comparisons
python -m scripts.cli test-local --scenarios 10

# Export test scenarios
python -m scripts.cli export-scenarios
```

## Evaluation Workflow

1. **Generate Comparisons** (using Python scripts)
   - Create video pairs from different models
   - Randomize presentation order
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

1. Set up Prolific API token:
```bash
export PROLIFIC_API_TOKEN=your-token
```

2. Create a study:
```bash
python scripts/prolific_cli.py create-study \
  --name "Matrix-Game Study" \
  --participants 100
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
docker build -t matrix-game-eval ./frontend
docker run -p 3000:3000 matrix-game-eval
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

[Your license here]