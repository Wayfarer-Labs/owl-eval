# OWL Evaluation Platform

A comprehensive human evaluation platform for assessing generative video models through structured comparative analysis and crowdsourced evaluation studies.

## Overview

OWL Eval is a full-stack TypeScript platform designed to enable rigorous evaluation of video generation models through human judgment. The system provides end-to-end infrastructure for conducting comparative studies, from experiment design to statistical analysis, with particular focus on evaluating world models that simulate dynamic environments.

The platform addresses the critical need for standardized human evaluation methodologies in generative AI research, providing researchers with tools to assess model outputs across multiple dimensions including visual quality, temporal consistency, controllability, and overall realism.

## Architecture

**Multi-tenant Platform**: Built with organization-level isolation, role-based access control, and team collaboration features.

**Evaluation Modes**:
- **Pairwise Comparison**: Side-by-side video evaluation with preference selection
- **Single Video Rating**: Individual assessment across multiple quality dimensions

**Integration Points**:
- **Prolific**: Automated participant recruitment and study management  
- **Stack Auth**: Enterprise authentication with team management
- **Cloud Storage**: Scalable video asset management (AWS S3/Tigris)

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes, Prisma ORM
- **Database**: PostgreSQL with full ACID compliance
- **Authentication**: Stack Auth with multi-organization support
- **CLI**: TypeScript-based command-line interface
- **Deployment**: Docker containers with GitHub Actions CI/CD

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- AWS S3 or compatible storage

### Installation

1. **Clone and setup**:
   ```bash
   git clone <repository>
   cd owl-eval/eval/frontend
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your database and service credentials
   ```

3. **Initialize database**:
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

### CLI Usage

The platform includes a unified CLI for experiment management:

```bash
cd eval
./evalctl --help

# Create organization and experiments
./evalctl create-org "Research Lab"
./evalctl create-experiment --name "Model Comparison Study"

# Manage videos and tasks
./evalctl upload-videos --path ./samples/
./evalctl assign-tasks --experiment exp_123

# Database operations
./evalctl db:sql "SELECT * FROM experiments"
./evalctl sync-stack-auth my-org
```

## Core Features

### Experiment Management
- **Multi-modal Studies**: Support for both comparison and absolute rating tasks
- **Scenario Organization**: Logical grouping of evaluation tasks by context
- **Progress Tracking**: Real-time monitoring of study completion rates
- **Batch Operations**: Efficient handling of large-scale experiments

### Human Evaluation Interface
- **Synchronized Playback**: Frame-perfect video comparison
- **Multi-dimensional Rating**: Structured assessment across quality dimensions
- **Responsive Design**: Optimized for desktop and tablet evaluation sessions
- **Progress Persistence**: Automatic saving of partial responses

### Analytics Dashboard
- **Performance Metrics**: Model comparison with statistical significance testing
- **Participation Analytics**: Study completion rates and participant engagement
- **Data Export**: CSV/JSON export for external analysis
- **Visualization**: Interactive charts and performance summaries

### Prolific Integration
- **Automated Study Creation**: API-driven study setup and participant recruitment
- **Dynamic Completion Codes**: Secure participant verification
- **Quality Control**: Built-in screening and attention checks
- **Bonus Management**: Automated performance-based payments

## Project Structure

```
owl-eval/
├── eval/
│   ├── frontend/           # Next.js web application
│   │   ├── src/app/       # Pages and API routes
│   │   ├── components/    # React components
│   │   ├── lib/          # Business logic
│   │   └── prisma/       # Database schema
│   ├── scripts/          # CLI implementation
│   └── evalctl          # Main CLI executable
├── docs/                 # Documentation
└── README.md            # This file
```

## Development Workflow

### Local Development
```bash
# Start development environment
npm run dev

# Run tests
npm test

# Type checking
npm run type-check

# Database migrations
npx prisma migrate dev
```

### Contributing
1. Create feature branch from `main`
2. Implement changes with tests
3. Run quality checks: `npm run lint && npm run type-check`
4. Submit pull request with detailed description

### Deployment
The application supports both Docker containerization and serverless deployment:

```bash
# Docker deployment
docker-compose up

# Production build
npm run build
npm start
```

## Documentation

- **[System Architecture](docs/evaluation-system.md)**: Technical architecture and design patterns
- **[Multi-tenancy](docs/multitenant.md)**: Organization management and access control
- **[CLI Reference](docs/cli-scripts.md)**: Complete command-line interface documentation
- **[Prolific Integration](docs/prolific-integration.md)**: Crowdsourcing configuration and best practices
- **[Development Guide](docs/frontend-development.md)**: Setup instructions and coding standards

## Research Applications

This platform has been designed to support research in:
- **World Model Evaluation**: Assessment of environment simulation fidelity
- **Video Generation Quality**: Comparative analysis of diffusion models
- **Human-AI Interaction**: Understanding preferences in AI-generated content
- **Perceptual Studies**: Investigation of human visual perception and judgment

## API Reference

Core API endpoints for programmatic access:

```
GET    /api/experiments           # List experiments
POST   /api/experiments           # Create experiment
GET    /api/experiments/[id]      # Get experiment details
POST   /api/submit-evaluation     # Submit evaluation response
GET    /api/model-performance     # Get performance analytics
```

Complete API documentation available in the codebase.

## Security & Privacy

- **Data Isolation**: Strict multi-tenant data separation
- **Authentication**: Enterprise-grade auth with Stack Auth
- **GDPR Compliance**: Participant data handling and deletion
- **API Security**: Rate limiting and input validation

## Support & Community

For questions, bug reports, or feature requests:
- Check existing [documentation](docs/) 
- Review [GitHub Issues](../../issues)
- Follow [contributing guidelines](docs/contributing.md)

## License

MIT License - see LICENSE file for details.
