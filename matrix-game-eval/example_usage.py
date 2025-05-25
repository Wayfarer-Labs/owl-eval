"""
Example usage of the Matrix-Game evaluation harness.
This script demonstrates how to run a simple evaluation locally.
"""

import numpy as np
from models.model_loader import ModelLoader
from evaluation.test_scenarios import TestScenarios
from evaluation.ab_testing import ABTestingFramework
from evaluation.prompts import EvaluationPrompts, ActionSequenceGenerator


def main():
    """Run a simple evaluation example."""
    
    print("Matrix-Game Human Evaluation Example")
    print("=" * 50)
    
    # 1. Initialize the A/B testing framework
    print("\n1. Initializing evaluation framework...")
    framework = ABTestingFramework(output_dir="./data/example_run")
    
    # 2. Load models (using mock models for this example)
    print("\n2. Loading models...")
    
    # In practice, you would load real models:
    # models = ModelLoader.load_from_config("configs/evaluation_config.yaml")
    
    # For this example, we'll create mock models
    from models.base_model import BaseWorldModel
    
    class MockModel(BaseWorldModel):
        def load_model(self, checkpoint_path=None):
            print(f"  - Loaded mock model: {self.model_name}")
        
        def generate_video(self, reference_image, actions, **kwargs):
            # Return random frames for demonstration
            frames = np.random.randint(0, 255, (65, 720, 1280, 3), dtype=np.uint8)
            # Add some variation based on model name
            if "matrix" in self.model_name:
                frames[:, :360, :, 0] = 255  # Red tint for top half
            else:
                frames[:, :360, :, 2] = 255  # Blue tint for top half
            return frames
        
        def preprocess_image(self, image):
            return image
        
        def preprocess_actions(self, actions):
            return actions
    
    models = {
        "matrix_game": MockModel("matrix_game"),
        "baseline": MockModel("baseline_model")
    }
    
    for model in models.values():
        model.load_model()
    
    # 3. Select test scenarios
    print("\n3. Selecting test scenarios...")
    test_scenarios = [
        TestScenarios.get_scenario("basic_forward"),
        TestScenarios.get_scenario("turn_sequence"),
        TestScenarios.get_scenario("panoramic_view")
    ]
    
    print(f"  - Selected {len(test_scenarios)} scenarios:")
    for scenario in test_scenarios:
        print(f"    • {scenario['name']} ({scenario['biome']})")
    
    # 4. Generate reference images for each scenario
    print("\n4. Generating reference images...")
    reference_images = {}
    biome_colors = {
        "plains": [100, 200, 100],
        "beach": [255, 220, 150],
        "forest": [50, 150, 50]
    }
    
    for scenario in test_scenarios:
        biome = scenario["biome"]
        color = biome_colors.get(biome, [128, 128, 128])
        ref_image = np.full((720, 1280, 3), color, dtype=np.uint8)
        reference_images[scenario["name"]] = ref_image
        print(f"  - Created reference for {biome} biome")
    
    # 5. Create A/B comparisons
    print("\n5. Creating A/B comparisons...")
    comparisons = []
    
    for scenario in test_scenarios:
        print(f"  - Generating comparison for: {scenario['name']}")
        
        comparison = framework.create_comparison(
            model_a=models["matrix_game"],
            model_b=models["baseline"],
            scenario=scenario,
            reference_image=reference_images[scenario["name"]],
            randomize_order=True
        )
        
        comparisons.append(comparison)
        print(f"    • Comparison ID: {comparison.comparison_id}")
        print(f"    • Randomized labels: A={comparison.randomized_labels['A']}, "
              f"B={comparison.randomized_labels['B']}")
    
    # 6. Display evaluation prompts
    print("\n6. Evaluation prompts for human annotators:")
    print("-" * 50)
    
    dimension = "controllability"
    prompt_data = EvaluationPrompts.format_evaluation_page(
        dimension=dimension,
        action_sequence_description="Forward movement with camera turns"
    )
    
    print(f"Dimension: {prompt_data['dimension_name']}")
    print(f"Question: {prompt_data['main_question']}")
    print(f"\nCriteria:\n{prompt_data['criteria']}")
    print(f"\nResponse options:")
    for option in prompt_data['response_options']:
        print(f"  - {option}")
    
    # 7. Simulate evaluation results
    print("\n7. Simulating evaluation results...")
    
    for i, comparison in enumerate(comparisons):
        # Simulate multiple evaluators
        for evaluator_id in [f"evaluator_{j}" for j in range(3)]:
            # Random scores for demonstration
            dimension_scores = {
                "overall_quality": np.random.choice(["A", "B", "Equal"]),
                "controllability": np.random.choice(["A", "B", "Equal"]),
                "visual_quality": np.random.choice(["A", "B", "Equal"]),
                "temporal_consistency": np.random.choice(["A", "B", "Equal"])
            }
            
            result = framework.record_evaluation_result(
                comparison_id=comparison.comparison_id,
                evaluator_id=evaluator_id,
                dimension_scores=dimension_scores,
                detailed_ratings={},
                completion_time_seconds=np.random.randint(30, 120)
            )
    
    print(f"  - Recorded {len(comparisons) * 3} evaluation results")
    
    # 8. Export results
    print("\n8. Exporting study data...")
    export_path = framework.export_study_data("example_study")
    print(f"  - Study data exported to: {export_path}")
    
    print("\n" + "=" * 50)
    print("Example completed successfully!")
    print(f"Generated {len(comparisons)} comparisons with {len(comparisons) * 3} evaluations")
    print(f"Results saved in: ./data/example_run/")


if __name__ == "__main__":
    main()