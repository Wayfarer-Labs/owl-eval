# Contributing to OWL Eval

Thank you for your interest in contributing to OWL Eval! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Process](#development-process)
- [How to Contribute](#how-to-contribute)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Submitting Changes](#submitting-changes)
- [Community](#community)

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- **Be respectful**: Treat everyone with respect. No harassment, discrimination, or inappropriate behavior.
- **Be collaborative**: Work together to solve problems and improve the project.
- **Be constructive**: Provide helpful feedback and accept constructive criticism gracefully.
- **Be inclusive**: Welcome contributors of all backgrounds and experience levels.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/owl-eval.git
   cd owl-eval
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/owl-team/owl-eval.git
   ```
4. **Set up development environment**:
   ```bash
   # Python dependencies
   pip install -r requirements.txt
   pip install -e .
   
   # Frontend dependencies
   cd matrix-game-eval/frontend
   npm install
   ```

## Development Process

### Branches

- `main` - Stable release branch
- `develop` - Active development branch
- `feature/*` - Feature branches
- `fix/*` - Bug fix branches
- `docs/*` - Documentation updates

### Workflow

1. **Create a new branch** from `develop`:
   ```bash
   git checkout develop
   git pull upstream develop
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our coding standards

3. **Test your changes** thoroughly

4. **Commit your changes** with descriptive messages:
   ```bash
   git add .
   git commit -m "feat: add new evaluation metric for temporal consistency"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request** on GitHub

## How to Contribute

### Reporting Bugs

- Check existing issues first to avoid duplicates
- Use the bug report template
- Include:
  - Clear description of the bug
  - Steps to reproduce
  - Expected vs actual behavior
  - System information (OS, Python version, etc.)
  - Error messages and stack traces

### Suggesting Features

- Use the feature request template
- Explain the problem your feature solves
- Describe your proposed solution
- Consider alternatives you've thought about

### Code Contributions

Types of contributions we welcome:

- **Bug fixes**: Fix reported issues
- **Features**: Add new functionality
- **Performance**: Optimize existing code
- **Documentation**: Improve or add documentation
- **Tests**: Add missing tests or improve coverage
- **Refactoring**: Improve code quality

### Documentation

- Update documentation for any changed functionality
- Add docstrings to new functions/classes
- Include examples where helpful
- Keep README files up to date

## Coding Standards

### Python Code Style

We follow PEP 8 with some modifications:

```python
# Good example
def calculate_model_performance(
    evaluations: List[Evaluation],
    dimensions: List[str],
    confidence_level: float = 0.95
) -> Dict[str, float]:
    """Calculate performance metrics for model evaluations.
    
    Args:
        evaluations: List of evaluation objects
        dimensions: Evaluation dimensions to analyze
        confidence_level: Statistical confidence level
        
    Returns:
        Dictionary mapping metrics to values
    """
    # Implementation here
```

Tools:
- Use `black` for formatting: `black . --line-length 88`
- Use `flake8` for linting: `flake8 . --max-line-length 88`
- Use `mypy` for type checking: `mypy .`

### TypeScript/JavaScript Code Style

For frontend code:

```typescript
// Good example
export function VideoComparison({ 
  comparisonId, 
  onComplete 
}: VideoComparisonProps): JSX.Element {
  const [scores, setScores] = useState<DimensionScores>({});
  
  // Implementation
}
```

Tools:
- Use ESLint: `npm run lint`
- Use Prettier: `npm run format`
- Follow Next.js conventions

### Commit Messages

Follow conventional commits format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test additions or changes
- `chore`: Build process or auxiliary tool changes

Examples:
```
feat(evaluation): add inter-rater reliability calculation
fix(frontend): resolve video sync issues in Safari
docs(api): update endpoint documentation
```

## Testing

### Python Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=matrix_game_eval

# Run specific test file
pytest tests/test_evaluation.py

# Run with verbose output
pytest -v
```

Write tests for:
- New features
- Bug fixes
- Edge cases
- API endpoints

### Frontend Tests

```bash
cd matrix-game-eval/frontend

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### Test Guidelines

- Write descriptive test names
- Test both success and failure cases
- Mock external dependencies
- Keep tests focused and isolated
- Aim for >80% code coverage

## Documentation

### Code Documentation

- All public functions/classes need docstrings
- Use type hints in Python
- Use TypeScript types/interfaces
- Include usage examples for complex features

### User Documentation

- Update relevant README files
- Add to user guides if needed
- Include screenshots for UI changes
- Document API changes

### API Documentation

- Document all endpoints
- Include request/response examples
- Note any breaking changes
- Update OpenAPI/Swagger specs if applicable

## Submitting Changes

### Pull Request Process

1. **Update your branch** with latest changes:
   ```bash
   git fetch upstream
   git rebase upstream/develop
   ```

2. **Ensure all tests pass**:
   ```bash
   pytest
   cd frontend && npm test
   ```

3. **Check code quality**:
   ```bash
   black . --check
   flake8 .
   mypy .
   cd frontend && npm run lint
   ```

4. **Update documentation** as needed

5. **Open a Pull Request** with:
   - Clear title and description
   - Link to related issues
   - Screenshots for UI changes
   - Test results
   - Breaking changes noted

### PR Review Process

- PRs require at least one review
- Address all feedback constructively
- Keep PRs focused and reasonably sized
- Ensure CI/CD checks pass
- Squash commits before merging

### After Your PR is Merged

- Delete your feature branch
- Pull the latest changes
- Celebrate your contribution! 🎉

## Community

### Getting Help

- Check documentation first
- Search existing issues
- Ask in discussions
- Join our Discord server

### Ways to Help

Beyond code contributions:
- Answer questions in discussions
- Review pull requests
- Improve documentation
- Share the project
- Report bugs
- Suggest features

## Recognition

We value all contributions! Contributors will be:
- Listed in our contributors file
- Mentioned in release notes
- Given credit in documentation

Thank you for contributing to OWL Eval! Your efforts help make this project better for everyone.