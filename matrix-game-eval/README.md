# Matrix-Game Human Evaluation Harness

A comprehensive framework for conducting human evaluations of diffusion-based world models, specifically designed to recreate the evaluation methodology from the Matrix-Game paper.

## Overview

This harness enables A/B testing of diffusion world models through:
- Local testing with the Matrix-Game model from HuggingFace
- Structured evaluation across four key dimensions (Overall Quality, Controllability, Visual Quality, Temporal Consistency)
- Pre-defined test scenarios covering diverse Minecraft environments
- Future integration with Prolific for crowd-sourced evaluations

## Project Structure

```
matrix-game-eval/
├── models/              # Model interfaces and loaders
│   ├── base_model.py    # Abstract base class for world models
│   ├── matrix_game_model.py  # Matrix-Game specific implementation
│   └── model_loader.py  # Utility for loading models
├── evaluation/          # Evaluation framework components
│   ├── prompts.py       # Human evaluation prompts and instructions
│   ├── criteria.py      # Scoring criteria and rubrics
│   ├── test_scenarios.py # Pre-defined test scenarios
│   └── ab_testing.py    # A/B testing framework
├── web/                 # Web interface (to be implemented)
├── scripts/             # CLI tools
│   └── cli.py          # Command-line interface
├── configs/             # Configuration files
│   └── evaluation_config.yaml
└── data/               # Generated data and results
```

## Installation

1. Clone the repository and navigate to the project directory:
```bash
cd matrix-game-eval
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Install the package in development mode:
```bash
pip install -e .
```

## Usage

### Local Testing

Run a quick test with mock models:
```bash
python -m scripts.cli test-local --dry-run --scenarios 5
```

Run with actual models (requires GPU):
```bash
python -m scripts.cli test-local --config configs/evaluation_config.yaml
```

### Export Test Scenarios

Export all pre-defined test scenarios:
```bash
python -m scripts.cli export-scenarios --output-dir ./data/scenarios
```

### Manual Evaluation (Testing)

Evaluate a specific comparison:
```bash
python -m scripts.cli evaluate-comparison --comparison-id <UUID>
```

## Evaluation Dimensions

Based on the Matrix-Game paper, evaluations cover four key dimensions:

1. **Overall Quality**: General realism, coherence, and completeness
2. **Controllability**: Accuracy in following keyboard and mouse inputs
3. **Visual Quality**: Frame clarity, texture quality, and aesthetic appeal
4. **Temporal Consistency**: Motion smoothness and physics consistency

## Test Scenarios

The framework includes diverse test scenarios across 8 Minecraft biomes:
- Beach, Desert, Forest, Hills, Icy, Mushroom, Plains, River

Each scenario tests specific capabilities:
- Basic movement and navigation
- Complex action sequences
- Camera control
- Physics interactions
- Environment-specific behaviors

## Configuration

Edit `configs/evaluation_config.yaml` to:
- Specify model paths
- Adjust evaluation parameters
- Configure scenario settings
- Set video generation parameters

## Next Steps

1. **Web Interface**: Build Flask-based web interface for human annotations
2. **Prolific Integration**: Add API integration for crowd-sourced evaluations
3. **Analysis Pipeline**: Implement statistical analysis of evaluation results
4. **Model Integration**: Add support for additional baseline models (OASIS, MineWorld)

## Contributing

When adding new models:
1. Create a new model class inheriting from `BaseWorldModel`
2. Register it in `ModelLoader.MODEL_REGISTRY`
3. Add configuration in `evaluation_config.yaml`

When adding test scenarios:
1. Add to `TestScenarios.SCENARIOS` in `test_scenarios.py`
2. Ensure balanced representation across biomes
3. Document the specific capabilities being tested

## License

[To be determined based on OWL project requirements]