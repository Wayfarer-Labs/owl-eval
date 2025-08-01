<div align="center">

# 🦉 OWL Evaluation Framework

**A comprehensive platform for evaluating and comparing world models through human evaluation studies**

[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)](https://nextjs.org/)

[Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Contributing](#-contributing)

</div>

---

## 🎯 Overview

OWL (Wayfarer Labs) Evaluation Framework is a modern, production-ready platform designed for researchers and organizations conducting human evaluation studies of generative world models. Built with TypeScript and Next.js, it provides a complete solution for comparing video outputs through structured A/B testing and multi-dimensional analysis.

### Why OWL?

- 🔬 **Research-Grade Evaluations**: Structured evaluation across multiple dimensions (quality, controllability, visual fidelity, temporal consistency)
- 🌐 **Scalable Human Studies**: Seamless integration with Prolific for large-scale crowd-sourced evaluations
- 🏢 **Enterprise Ready**: Multi-tenant architecture with organization management and role-based access control
- ⚡ **Developer Friendly**: Unified TypeScript CLI and comprehensive API for automation
- 📊 **Real-time Analytics**: Built-in dashboard with progress tracking and performance visualization

## ✨ Features

### Core Capabilities
- **🎬 Video Comparison Workflows** - Side-by-side video playback with synchronized controls
- **📊 Multi-dimensional Evaluation** - Structured rating across research-validated dimensions
- **👥 Human Study Management** - Complete participant workflow with screening and quality control
- **🏗️ Multi-tenant Architecture** - Organization-based isolation with RBAC
- **⚡ Real-time Analytics** - Live progress tracking and performance dashboards

### Platform Integrations
- **🔗 Prolific Integration** - Automated participant recruitment and payment processing
- **☁️ Cloud Storage** - AWS S3 and Tigris integration for video asset management
- **🔐 Authentication** - Stack Auth integration with social login support
- **📡 REST API** - Complete API for programmatic access and automation

### Developer Experience
- **🛠️ Unified CLI** - `evalctl` command-line tool for experiment management
- **🔄 Docker Support** - Containerized deployment with docker-compose
- **🧪 Testing Suite** - Comprehensive test coverage with Jest
- **📚 Type Safety** - Full TypeScript coverage across frontend and backend

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
- (Optional) AWS S3 or Tigris for video storage

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/Wayfarer-Labs/owl-eval.git
   cd owl-eval/eval/frontend
   npm install
   ```

2. **Set up your environment:**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your database and storage configuration
   ```

3. **Initialize the database:**
   ```bash
   npm run db:migrate
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Use the CLI for experiment management:**
   ```bash
   cd ../
   ./evalctl --help
   ```

### Docker Deployment

For production deployment:

```bash
docker-compose up -d
```

Visit `http://localhost:3000` to access the web interface.

## 🏗️ Architecture

### Tech Stack
- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes, Prisma ORM  
- **Database:** PostgreSQL
- **Authentication:** Stack Auth
- **Storage:** AWS S3 / Tigris
- **CLI:** TypeScript with Commander.js

### Project Structure
```
eval/
├── frontend/           # Next.js web application
│   ├── src/app/       # Pages and API routes  
│   ├── src/components/ # Reusable UI components
│   └── src/lib/       # Core business logic
├── scripts/           # TypeScript CLI tools
├── evalctl           # Main CLI executable
└── docker-compose.yml # Development environment

docs/                  # Comprehensive documentation
├── concepts.md        # Core concepts and methodology
├── evaluation-system.md # System architecture
├── prolific-integration.md # Platform integrations
└── contributing.md    # Development guidelines
```

## 📚 Documentation

### Getting Started
- [**Core Concepts**](docs/concepts.md) - Understanding the evaluation methodology and data model
- [**System Architecture**](docs/evaluation-system.md) - Deep dive into platform architecture and workflows
- [**CLI Reference**](docs/cli-scripts.md) - Complete command-line tool documentation

### Development  
- [**Frontend Development**](docs/frontend-development.md) - Setup and development guidelines
- [**Contributing Guide**](docs/contributing.md) - How to contribute to the project
- [**Testing Guide**](docs/testing.md) - Running and writing tests

### Integrations
- [**Prolific Integration**](docs/prolific-integration.md) - Setting up human evaluation studies
- [**Multi-tenant Setup**](docs/multitenant.md) - Organization and user management

## 🤝 Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, or improving documentation, your help is appreciated.

### How to Contribute
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and add tests
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

See our [Contributing Guide](docs/contributing.md) for detailed development setup and guidelines.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♀️ Support

- 📖 **Documentation**: Check the [`docs/`](docs/) directory for comprehensive guides
- 🐛 **Issues**: Report bugs and request features via [GitHub Issues](https://github.com/Wayfarer-Labs/owl-eval/issues)
- 💬 **Discussions**: Join community discussions in [GitHub Discussions](https://github.com/Wayfarer-Labs/owl-eval/discussions)

---

<div align="center">

**Built with ❤️ by [Wayfarer Labs](https://github.com/Wayfarer-Labs)**

</div>
