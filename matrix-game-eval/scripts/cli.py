"""
Command-line interface for Matrix-Game evaluation harness.
"""

import click
import yaml
import json
import os
from typing import Dict, List
import numpy as np

from ..models.model_loader import ModelLoader
from ..evaluation.test_scenarios import TestScenarios
from ..evaluation.ab_testing import ABTestingFramework
from ..evaluation.prompts import ActionSequenceGenerator


@click.group()
def cli():
    """Matrix-Game Human Evaluation Harness CLI"""
    pass


@cli.command()
@click.option('--config', '-c', default='configs/evaluation_config.yaml', 
              help='Path to configuration file')
@click.option('--output-dir', '-o', default='./data/test_run',
              help='Output directory for test results')
@click.option('--scenarios', '-s', default=5, 
              help='Number of test scenarios to generate')
@click.option('--dry-run', is_flag=True,
              help='Run without actually generating videos')
def test_local(config, output_dir, scenarios, dry_run):
    """Test the evaluation framework locally."""
    
    click.echo("Loading configuration...")
    with open(config, 'r') as f:
        cfg = yaml.safe_load(f)
    
    if dry_run:
        click.echo("DRY RUN MODE - No videos will be generated")
    
    # Initialize framework
    framework = ABTestingFramework(output_dir=output_dir)
    
    # Load models (or use mocks for testing)
    click.echo("Loading models...")
    if not dry_run:
        models = ModelLoader.load_from_config(config)
    else:
        # Create mock models for dry run
        from ..models.base_model import BaseWorldModel
        
        class MockModel(BaseWorldModel):
            def load_model(self, checkpoint_path=None):
                pass
            
            def generate_video(self, reference_image, actions, **kwargs):
                # Return random frames
                return np.random.randint(0, 255, (65, 720, 1280, 3), dtype=np.uint8)
            
            def preprocess_image(self, image):
                return image
            
            def preprocess_actions(self, actions):
                return actions
        
        models = {
            "matrix_game": MockModel("matrix_game"),
            "baseline": MockModel("baseline")
        }
    
    # Create test scenarios
    click.echo(f"Creating {scenarios} test scenarios...")
    test_scenarios = TestScenarios.create_balanced_test_set(
        scenarios_per_biome=max(1, scenarios // 8)
    )[:scenarios]
    
    # Generate reference images (mock for now)
    reference_images = {}
    for scenario in test_scenarios:
        # Create a simple colored reference image based on biome
        biome_colors = {
            "beach": [255, 220, 150],
            "desert": [255, 200, 100],
            "forest": [50, 150, 50],
            "hills": [100, 150, 100],
            "icy": [200, 220, 255],
            "mushroom": [200, 100, 150],
            "plains": [100, 200, 100],
            "river": [100, 150, 200]
        }
        color = biome_colors.get(scenario["biome"], [128, 128, 128])
        ref_image = np.full((720, 1280, 3), color, dtype=np.uint8)
        reference_images[scenario["id"]] = ref_image
    
    # Create comparisons
    click.echo("Creating A/B comparisons...")
    comparisons = []
    
    with click.progressbar(test_scenarios) as scenarios_bar:
        for scenario in scenarios_bar:
            comparison = framework.create_comparison(
                model_a=models["matrix_game"],
                model_b=models.get("baseline", models["matrix_game"]),
                scenario=scenario,
                reference_image=reference_images[scenario["id"]]
            )
            comparisons.append(comparison)
    
    # Save test metadata
    test_metadata = {
        "test_scenarios": test_scenarios,
        "comparisons": [c.to_dict() for c in comparisons],
        "config": cfg
    }
    
    metadata_path = os.path.join(output_dir, "test_metadata.json")
    with open(metadata_path, 'w') as f:
        json.dump(test_metadata, f, indent=2)
    
    click.echo(f"\nTest completed!")
    click.echo(f"Generated {len(comparisons)} comparisons")
    click.echo(f"Results saved to: {output_dir}")
    
    # Print summary
    click.echo("\nComparison Summary:")
    for comp in comparisons[:3]:  # Show first 3
        click.echo(f"  - {comp.scenario_id}: {comp.model_a_name} vs {comp.model_b_name}")
    if len(comparisons) > 3:
        click.echo(f"  ... and {len(comparisons) - 3} more")


@cli.command()
@click.option('--comparison-id', '-c', required=True,
              help='ID of the comparison to evaluate')
@click.option('--output-dir', '-o', default='./data/test_run',
              help='Output directory containing the comparison')
def evaluate_comparison(comparison_id, output_dir):
    """Manually evaluate a single comparison (for testing)."""
    
    framework = ABTestingFramework(output_dir=output_dir)
    
    # Load comparison
    comparison = framework.get_comparison(comparison_id)
    if not comparison:
        click.echo(f"Comparison {comparison_id} not found!")
        return
    
    click.echo(f"Comparison: {comparison.scenario_id}")
    click.echo(f"Models: A={comparison.randomized_labels['A']}, B={comparison.randomized_labels['B']}")
    click.echo(f"Video A: {comparison.model_a_video_path}")
    click.echo(f"Video B: {comparison.model_b_video_path}")
    
    # Simulate evaluation
    click.echo("\nPlease watch both videos and answer the following questions:")
    
    dimensions = ["overall_quality", "controllability", "visual_quality", "temporal_consistency"]
    dimension_scores = {}
    
    for dimension in dimensions:
        click.echo(f"\n{dimension.replace('_', ' ').title()}:")
        choice = click.prompt(
            "Which model performed better? (A/B/Equal)",
            type=click.Choice(['A', 'B', 'Equal'], case_sensitive=False)
        )
        dimension_scores[dimension] = choice
    
    # Record result
    result = framework.record_evaluation_result(
        comparison_id=comparison_id,
        evaluator_id="cli_user",
        dimension_scores=dimension_scores,
        detailed_ratings={},
        completion_time_seconds=60.0  # Mock time
    )
    
    click.echo(f"\nEvaluation recorded: {result.result_id}")


@cli.command()
@click.option('--output-dir', '-o', default='./data/scenarios',
              help='Output directory for scenarios')
def export_scenarios(output_dir):
    """Export all test scenarios to JSON."""
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Export predefined scenarios
    scenarios_path = os.path.join(output_dir, "test_scenarios.json")
    TestScenarios.export_scenario_set(scenarios_path)
    click.echo(f"Exported test scenarios to: {scenarios_path}")
    
    # Generate and export additional random scenarios
    generator = ActionSequenceGenerator()
    random_scenarios = generator.generate_evaluation_set(num_sequences=20)
    
    random_path = os.path.join(output_dir, "random_scenarios.json")
    with open(random_path, 'w') as f:
        json.dump(random_scenarios, f, indent=2)
    click.echo(f"Exported random scenarios to: {random_path}")


@cli.command()
@click.option('--output-dir', '-o', default='./data/test_run',
              help='Output directory containing results')
@click.option('--study-name', '-n', default='test_study',
              help='Name for the exported study')
def export_results(output_dir, study_name):
    """Export study results for analysis."""
    
    framework = ABTestingFramework(output_dir=output_dir)
    export_path = framework.export_study_data(study_name)
    
    click.echo(f"Study data exported to: {export_path}")


def main():
    """Main entry point."""
    cli()


if __name__ == '__main__':
    main()