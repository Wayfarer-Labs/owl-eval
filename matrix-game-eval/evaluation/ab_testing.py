"""
A/B testing framework for comparing world generation models.
"""

import random
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any
import json
import os
import numpy as np

from ..models.base_model import BaseWorldModel


@dataclass
class VideoComparison:
    """Container for a single A/B comparison."""
    comparison_id: str
    scenario_id: str
    model_a_name: str
    model_b_name: str
    model_a_video_path: str
    model_b_video_path: str
    action_sequence: List[Dict[str, Any]]
    scenario_metadata: Dict[str, Any]
    randomized_labels: Dict[str, str]  # Maps "A"/"B" to actual model names
    created_at: datetime
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "comparison_id": self.comparison_id,
            "scenario_id": self.scenario_id,
            "model_a_name": self.model_a_name,
            "model_b_name": self.model_b_name,
            "model_a_video_path": self.model_a_video_path,
            "model_b_video_path": self.model_b_video_path,
            "action_sequence": self.action_sequence,
            "scenario_metadata": self.scenario_metadata,
            "randomized_labels": self.randomized_labels,
            "created_at": self.created_at.isoformat()
        }


@dataclass
class EvaluationResult:
    """Results from a single human evaluation."""
    result_id: str
    comparison_id: str
    evaluator_id: str
    dimension_scores: Dict[str, str]  # dimension -> selected model ("A" or "B")
    detailed_ratings: Dict[str, int]  # criterion -> rating value
    completion_time_seconds: float
    submitted_at: datetime
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "result_id": self.result_id,
            "comparison_id": self.comparison_id,
            "evaluator_id": self.evaluator_id,
            "dimension_scores": self.dimension_scores,
            "detailed_ratings": self.detailed_ratings,
            "completion_time_seconds": self.completion_time_seconds,
            "submitted_at": self.submitted_at.isoformat()
        }


class ABTestingFramework:
    """Framework for conducting A/B tests between world generation models."""
    
    def __init__(self, output_dir: str = "./data/ab_tests"):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        
        # Create subdirectories
        self.videos_dir = os.path.join(output_dir, "videos")
        self.comparisons_dir = os.path.join(output_dir, "comparisons")
        self.results_dir = os.path.join(output_dir, "results")
        
        for dir_path in [self.videos_dir, self.comparisons_dir, self.results_dir]:
            os.makedirs(dir_path, exist_ok=True)
    
    def create_comparison(
        self,
        model_a: BaseWorldModel,
        model_b: BaseWorldModel,
        scenario: Dict[str, Any],
        reference_image: np.ndarray,
        randomize_order: bool = True
    ) -> VideoComparison:
        """
        Create a single A/B comparison between two models.
        
        Args:
            model_a: First model
            model_b: Second model
            scenario: Test scenario dictionary
            reference_image: Starting frame for generation
            randomize_order: Whether to randomize which model is shown as "A" or "B"
            
        Returns:
            VideoComparison object with generated videos
        """
        comparison_id = str(uuid.uuid4())
        
        # Generate videos from both models
        print(f"Generating video for {model_a.model_name}...")
        video_a = model_a.generate_video(
            reference_image=reference_image,
            actions=scenario["actions"],
            num_frames=scenario["duration_frames"]
        )
        
        print(f"Generating video for {model_b.model_name}...")
        video_b = model_b.generate_video(
            reference_image=reference_image,
            actions=scenario["actions"],
            num_frames=scenario["duration_frames"]
        )
        
        # Save videos
        video_a_path = os.path.join(
            self.videos_dir, 
            f"{comparison_id}_model_a_{model_a.model_name.replace('/', '_')}.mp4"
        )
        video_b_path = os.path.join(
            self.videos_dir,
            f"{comparison_id}_model_b_{model_b.model_name.replace('/', '_')}.mp4"
        )
        
        self._save_video(video_a, video_a_path)
        self._save_video(video_b, video_b_path)
        
        # Randomize labels if requested
        if randomize_order and random.random() < 0.5:
            # Swap the models
            randomized_labels = {"A": model_b.model_name, "B": model_a.model_name}
            display_video_a = video_b_path
            display_video_b = video_a_path
        else:
            randomized_labels = {"A": model_a.model_name, "B": model_b.model_name}
            display_video_a = video_a_path
            display_video_b = video_b_path
        
        # Create comparison object
        comparison = VideoComparison(
            comparison_id=comparison_id,
            scenario_id=scenario.get("id", scenario["name"]),
            model_a_name=model_a.model_name,
            model_b_name=model_b.model_name,
            model_a_video_path=display_video_a,
            model_b_video_path=display_video_b,
            action_sequence=scenario["actions"],
            scenario_metadata=scenario,
            randomized_labels=randomized_labels,
            created_at=datetime.now()
        )
        
        # Save comparison metadata
        self._save_comparison(comparison)
        
        return comparison
    
    def create_comparison_batch(
        self,
        models: Dict[str, BaseWorldModel],
        scenarios: List[Dict[str, Any]],
        reference_images: Dict[str, np.ndarray],
        pairs_per_scenario: int = 1,
        model_pairs: Optional[List[Tuple[str, str]]] = None
    ) -> List[VideoComparison]:
        """
        Create a batch of comparisons for multiple scenarios.
        
        Args:
            models: Dictionary of model name -> model instance
            scenarios: List of test scenarios
            reference_images: Dictionary of scenario -> reference image
            pairs_per_scenario: Number of comparison pairs per scenario
            model_pairs: Optional list of (model_a, model_b) pairs to compare
            
        Returns:
            List of VideoComparison objects
        """
        comparisons = []
        
        # Default to all pairwise comparisons if not specified
        if model_pairs is None:
            model_names = list(models.keys())
            model_pairs = [
                (model_names[i], model_names[j])
                for i in range(len(model_names))
                for j in range(i + 1, len(model_names))
            ]
        
        for scenario in scenarios:
            scenario_biome = scenario.get("biome", "plains")
            ref_image = reference_images.get(
                scenario.get("id", scenario["name"]),
                reference_images.get(scenario_biome)
            )
            
            for _ in range(pairs_per_scenario):
                for model_a_name, model_b_name in model_pairs:
                    comparison = self.create_comparison(
                        model_a=models[model_a_name],
                        model_b=models[model_b_name],
                        scenario=scenario,
                        reference_image=ref_image
                    )
                    comparisons.append(comparison)
        
        return comparisons
    
    def record_evaluation_result(
        self,
        comparison_id: str,
        evaluator_id: str,
        dimension_scores: Dict[str, str],
        detailed_ratings: Dict[str, int],
        completion_time_seconds: float
    ) -> EvaluationResult:
        """Record the results of a human evaluation."""
        result = EvaluationResult(
            result_id=str(uuid.uuid4()),
            comparison_id=comparison_id,
            evaluator_id=evaluator_id,
            dimension_scores=dimension_scores,
            detailed_ratings=detailed_ratings,
            completion_time_seconds=completion_time_seconds,
            submitted_at=datetime.now()
        )
        
        # Save result
        result_path = os.path.join(
            self.results_dir,
            f"{result.result_id}.json"
        )
        with open(result_path, 'w') as f:
            json.dump(result.to_dict(), f, indent=2)
        
        return result
    
    def get_comparison(self, comparison_id: str) -> Optional[VideoComparison]:
        """Load a comparison by ID."""
        comparison_path = os.path.join(
            self.comparisons_dir,
            f"{comparison_id}.json"
        )
        
        if not os.path.exists(comparison_path):
            return None
        
        with open(comparison_path, 'r') as f:
            data = json.load(f)
        
        # Convert back to VideoComparison
        data["created_at"] = datetime.fromisoformat(data["created_at"])
        return VideoComparison(**data)
    
    def get_results_for_comparison(
        self, 
        comparison_id: str
    ) -> List[EvaluationResult]:
        """Get all evaluation results for a comparison."""
        results = []
        
        # Scan results directory
        for filename in os.listdir(self.results_dir):
            if filename.endswith('.json'):
                with open(os.path.join(self.results_dir, filename), 'r') as f:
                    data = json.load(f)
                
                if data["comparison_id"] == comparison_id:
                    data["submitted_at"] = datetime.fromisoformat(data["submitted_at"])
                    results.append(EvaluationResult(**data))
        
        return results
    
    def _save_video(self, frames: np.ndarray, output_path: str) -> None:
        """Save video frames to file."""
        import imageio
        
        # Ensure frames are in the right format
        if frames.dtype != np.uint8:
            frames = (frames * 255).astype(np.uint8)
        
        # Save as video
        imageio.mimwrite(output_path, frames, fps=16, codec='libx264')
    
    def _save_comparison(self, comparison: VideoComparison) -> None:
        """Save comparison metadata."""
        comparison_path = os.path.join(
            self.comparisons_dir,
            f"{comparison.comparison_id}.json"
        )
        
        with open(comparison_path, 'w') as f:
            json.dump(comparison.to_dict(), f, indent=2)
    
    def export_study_data(self, study_name: str) -> str:
        """Export all data for a study in a format suitable for analysis."""
        export_dir = os.path.join(self.output_dir, "exports", study_name)
        os.makedirs(export_dir, exist_ok=True)
        
        # Collect all comparisons and results
        all_comparisons = []
        all_results = []
        
        for filename in os.listdir(self.comparisons_dir):
            if filename.endswith('.json'):
                with open(os.path.join(self.comparisons_dir, filename), 'r') as f:
                    all_comparisons.append(json.load(f))
        
        for filename in os.listdir(self.results_dir):
            if filename.endswith('.json'):
                with open(os.path.join(self.results_dir, filename), 'r') as f:
                    all_results.append(json.load(f))
        
        # Save combined data
        export_data = {
            "study_name": study_name,
            "export_date": datetime.now().isoformat(),
            "comparisons": all_comparisons,
            "results": all_results
        }
        
        export_path = os.path.join(export_dir, "study_data.json")
        with open(export_path, 'w') as f:
            json.dump(export_data, f, indent=2)
        
        return export_path