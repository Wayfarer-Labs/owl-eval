"""
Integration between Prolific and the Matrix-Game evaluation system.
"""

import os
import json
import uuid
from typing import Dict, List, Optional
from datetime import datetime
import logging

from ..evaluation.ab_testing import ABTestingFramework
from ..evaluation.test_scenarios import TestScenarios
from .client import ProlificClient, ProlificStudyManager

logger = logging.getLogger(__name__)


class ProlificIntegration:
    """Handles integration between Prolific and the evaluation framework."""
    
    def __init__(
        self,
        prolific_client: ProlificClient,
        ab_framework: ABTestingFramework,
        base_url: str
    ):
        """
        Initialize Prolific integration.
        
        Args:
            prolific_client: Prolific API client
            ab_framework: A/B testing framework
            base_url: Base URL for the evaluation interface
        """
        self.prolific_client = prolific_client
        self.ab_framework = ab_framework
        self.base_url = base_url
        self.study_manager = ProlificStudyManager(prolific_client, base_url)
        
        # Track participant assignments
        self.participant_assignments = {}
    
    def create_study_with_comparisons(
        self,
        study_name: str,
        num_participants: int,
        comparisons_per_participant: int,
        total_comparisons: int,
        scenarios: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Create a Prolific study with pre-generated comparisons.
        
        Args:
            study_name: Name for the study
            num_participants: Number of participants
            comparisons_per_participant: Comparisons per participant
            total_comparisons: Total number of unique comparisons to create
            scenarios: Optional list of scenarios to use
            
        Returns:
            Study details and comparison information
        """
        # Generate comparisons if needed
        comparison_pool = self._get_or_create_comparison_pool(
            total_comparisons, 
            scenarios
        )
        
        # Create Prolific study
        study = self.study_manager.create_evaluation_study(
            study_name=study_name,
            num_participants=num_participants,
            comparisons_per_participant=comparisons_per_participant
        )
        
        # Create assignment strategy
        assignment_strategy = self._create_assignment_strategy(
            comparison_pool,
            num_participants,
            comparisons_per_participant
        )
        
        # Save study metadata
        study_metadata = {
            "prolific_study_id": study['id'],
            "study_name": study_name,
            "created_at": datetime.now().isoformat(),
            "num_participants": num_participants,
            "comparisons_per_participant": comparisons_per_participant,
            "comparison_pool": [c.comparison_id for c in comparison_pool],
            "assignment_strategy": assignment_strategy
        }
        
        metadata_path = os.path.join(
            self.ab_framework.output_dir,
            f"prolific_study_{study['id']}.json"
        )
        with open(metadata_path, 'w') as f:
            json.dump(study_metadata, f, indent=2)
        
        return {
            "study": study,
            "comparisons": len(comparison_pool),
            "metadata_path": metadata_path
        }
    
    def get_participant_comparisons(
        self,
        prolific_pid: str,
        study_id: str
    ) -> List[str]:
        """
        Get comparison IDs assigned to a participant.
        
        Args:
            prolific_pid: Prolific participant ID
            study_id: Prolific study ID
            
        Returns:
            List of comparison IDs for this participant
        """
        # Load study metadata
        metadata_path = os.path.join(
            self.ab_framework.output_dir,
            f"prolific_study_{study_id}.json"
        )
        
        if not os.path.exists(metadata_path):
            logger.error(f"Study metadata not found for {study_id}")
            return []
        
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        # Check if participant already has assignments
        if prolific_pid in self.participant_assignments:
            return self.participant_assignments[prolific_pid]
        
        # Assign comparisons using round-robin or random strategy
        assignment_strategy = metadata['assignment_strategy']
        
        if assignment_strategy['type'] == 'round_robin':
            # Deterministic assignment based on participant order
            participant_index = hash(prolific_pid) % metadata['num_participants']
            start_idx = (participant_index * metadata['comparisons_per_participant']) % len(metadata['comparison_pool'])
            
            assigned_comparisons = []
            for i in range(metadata['comparisons_per_participant']):
                idx = (start_idx + i) % len(metadata['comparison_pool'])
                assigned_comparisons.append(metadata['comparison_pool'][idx])
        else:
            # Random assignment
            import random
            random.seed(prolific_pid)  # Deterministic randomness per participant
            assigned_comparisons = random.sample(
                metadata['comparison_pool'],
                min(metadata['comparisons_per_participant'], len(metadata['comparison_pool']))
            )
        
        # Cache assignment
        self.participant_assignments[prolific_pid] = assigned_comparisons
        
        return assigned_comparisons
    
    def validate_participant_completion(
        self,
        prolific_pid: str,
        study_id: str
    ) -> Dict[str, Any]:
        """
        Validate that a participant completed their evaluations properly.
        
        Args:
            prolific_pid: Prolific participant ID
            study_id: Prolific study ID
            
        Returns:
            Validation results including quality metrics
        """
        assigned_comparisons = self.get_participant_comparisons(prolific_pid, study_id)
        
        # Get all results for this participant
        completed_evaluations = []
        quality_metrics = {
            "total_assigned": len(assigned_comparisons),
            "total_completed": 0,
            "average_time": 0,
            "consistency_score": 0,
            "quality_flags": []
        }
        
        for comparison_id in assigned_comparisons:
            results = self.ab_framework.get_results_for_comparison(comparison_id)
            participant_results = [
                r for r in results 
                if r.evaluator_id == prolific_pid
            ]
            
            if participant_results:
                completed_evaluations.extend(participant_results)
                quality_metrics["total_completed"] += 1
        
        # Calculate quality metrics
        if completed_evaluations:
            # Average completion time
            times = [r.completion_time_seconds for r in completed_evaluations]
            quality_metrics["average_time"] = sum(times) / len(times)
            
            # Check for suspiciously fast completions
            if quality_metrics["average_time"] < 30:  # Less than 30 seconds
                quality_metrics["quality_flags"].append("very_fast_completion")
            
            # Check for all same responses (potential random clicking)
            all_dimension_scores = []
            for result in completed_evaluations:
                all_dimension_scores.extend(result.dimension_scores.values())
            
            unique_responses = len(set(all_dimension_scores))
            if unique_responses == 1:
                quality_metrics["quality_flags"].append("no_variation_in_responses")
            
            # Calculate consistency (simplified - could be more sophisticated)
            quality_metrics["consistency_score"] = unique_responses / max(len(all_dimension_scores), 1)
        
        # Overall quality score
        quality_score = 1.0
        if quality_metrics["total_completed"] < quality_metrics["total_assigned"]:
            quality_score *= quality_metrics["total_completed"] / quality_metrics["total_assigned"]
        if quality_metrics["quality_flags"]:
            quality_score *= 0.5  # Penalty for quality issues
        
        quality_metrics["quality_score"] = quality_score
        
        return quality_metrics
    
    def sync_study_results(self, study_id: str) -> None:
        """
        Sync evaluation results with Prolific and approve/reject submissions.
        
        Args:
            study_id: Prolific study ID
        """
        # Get all submissions
        submissions = self.prolific_client.get_submissions(study_id)
        
        # Validate each participant
        participant_results = {}
        for submission in submissions:
            if submission['status'] == 'AWAITING_REVIEW':
                pid = submission['participant_id']
                validation = self.validate_participant_completion(pid, study_id)
                participant_results[pid] = validation
        
        # Sync with Prolific
        self.study_manager.sync_submissions(study_id, participant_results)
        
        # Save validation report
        report_path = os.path.join(
            self.ab_framework.output_dir,
            f"prolific_validation_{study_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        )
        with open(report_path, 'w') as f:
            json.dump({
                "study_id": study_id,
                "validated_at": datetime.now().isoformat(),
                "participant_results": participant_results
            }, f, indent=2)
        
        logger.info(f"Validation report saved to {report_path}")
    
    def _get_or_create_comparison_pool(
        self,
        total_comparisons: int,
        scenarios: Optional[List[Dict]] = None
    ) -> List:
        """Get existing comparisons or create new ones."""
        # Check for existing comparisons
        existing_comparisons = []
        comparisons_dir = self.ab_framework.comparisons_dir
        
        for filename in os.listdir(comparisons_dir):
            if filename.endswith('.json'):
                comparison = self.ab_framework.get_comparison(
                    filename.replace('.json', '')
                )
                if comparison:
                    existing_comparisons.append(comparison)
        
        if len(existing_comparisons) >= total_comparisons:
            logger.info(f"Using {total_comparisons} existing comparisons")
            return existing_comparisons[:total_comparisons]
        
        # Need to create more comparisons
        logger.warning("Not enough existing comparisons. Please create more using the CLI.")
        return existing_comparisons
    
    def _create_assignment_strategy(
        self,
        comparison_pool: List,
        num_participants: int,
        comparisons_per_participant: int
    ) -> Dict[str, Any]:
        """Create a strategy for assigning comparisons to participants."""
        total_evaluations_needed = num_participants * comparisons_per_participant
        total_comparisons = len(comparison_pool)
        
        # Use round-robin if we need multiple evaluations per comparison
        if total_evaluations_needed > total_comparisons:
            return {
                "type": "round_robin",
                "evaluations_per_comparison": total_evaluations_needed // total_comparisons
            }
        else:
            return {
                "type": "random",
                "max_evaluations_per_comparison": 5
            }