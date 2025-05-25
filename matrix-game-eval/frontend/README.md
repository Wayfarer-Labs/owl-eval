# Matrix-Game Evaluation Frontend

Next.js-based frontend for the Matrix-Game human evaluation platform.

## Features

- Side-by-side video comparison interface
- Four-dimension evaluation system
- Real-time progress tracking
- Admin dashboard with visualizations
- Prolific integration support

## Getting Started

1. Install dependencies:
```bash
npm install
# or
yarn install
```

2. Set up environment variables:
```bash
cp .env.local.example .env.local
# Edit .env.local with your API URL
```

3. Run the development server:
```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Project Structure

```
src/
├── app/                    # Next.js app router pages
│   ├── page.tsx           # Home page with evaluation list
│   ├── evaluate/[id]/     # Evaluation interface
│   ├── admin/            # Admin dashboard
│   ├── thank-you/        # Completion page
│   └── layout.tsx        # Root layout
├── components/           
│   └── ui/               # Reusable UI components
├── lib/                  # Utility functions
└── types/               # TypeScript type definitions
```

## Key Pages

### Home (`/`)
- Lists available evaluations
- Shows completion status
- Provides study instructions

### Evaluation (`/evaluate/[id]`)
- Synchronized video playback
- Dimension-based rating system
- Action sequence display
- Progress tracking

### Admin (`/admin`)
- Real-time statistics
- Model performance charts
- Scenario distribution
- Progress monitoring

## API Integration

The frontend communicates with the Python backend API:

- `GET /api/comparisons` - List available comparisons
- `POST /api/submit_evaluation` - Submit evaluation results
- `GET /api/evaluation_stats` - Get evaluation statistics
- `GET /api/model_performance` - Get model performance data

## Prolific Integration

When accessed through Prolific, the app:
1. Captures participant ID from URL parameters
2. Assigns specific comparisons to each participant
3. Tracks progress through multiple evaluations
4. Displays completion code at the end

## Development

### Adding New Components

UI components use Radix UI primitives with Tailwind styling:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    Content
  </CardContent>
</Card>
```

### Styling

- Uses Tailwind CSS for styling
- Custom theme variables in `globals.css`
- Dark mode support built-in

## Deployment

### Production Build

```bash
npm run build
npm start
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Environment Variables

- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXT_PUBLIC_BASE_URL` - Frontend base URL (for Prolific callbacks)