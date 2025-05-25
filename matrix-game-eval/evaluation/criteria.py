"""
Evaluation criteria and scoring rubrics for Matrix-Game human evaluation.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional
from enum import Enum


class ComparisonResult(Enum):
    """Possible outcomes of A/B comparison."""
    A_MUCH_BETTER = 2
    A_SLIGHTLY_BETTER = 1
    EQUAL = 0
    B_SLIGHTLY_BETTER = -1
    B_MUCH_BETTER = -2


@dataclass
class EvaluationCriterion:
    """Single evaluation criterion with scoring guidance."""
    name: str
    dimension: str
    description: str
    scoring_guide: Dict[str, str]
    weight: float = 1.0


class EvaluationCriteria:
    """Complete set of evaluation criteria based on the Matrix-Game paper."""
    
    CRITERIA = {
        # Overall Quality Criteria
        "realism": EvaluationCriterion(
            name="Realism",
            dimension="overall_quality",
            description="How realistic and believable the generated Minecraft world appears",
            scoring_guide={
                "excellent": "Indistinguishable from real Minecraft gameplay",
                "good": "Very realistic with minor imperfections",
                "fair": "Generally realistic but with noticeable artifacts",
                "poor": "Clearly artificial with many unrealistic elements"
            }
        ),
        
        "coherence": EvaluationCriterion(
            name="World Coherence",
            dimension="overall_quality",
            description="Consistency of the game world structure and physics",
            scoring_guide={
                "excellent": "Perfect world consistency, all elements make sense",
                "good": "Mostly coherent with rare inconsistencies",
                "fair": "Some world inconsistencies but generally acceptable",
                "poor": "Frequent breaks in world logic or structure"
            }
        ),
        
        # Controllability Criteria
        "movement_accuracy": EvaluationCriterion(
            name="Movement Accuracy",
            dimension="controllability",
            description="How accurately character movements match input commands",
            scoring_guide={
                "excellent": "Perfect alignment with all movement commands",
                "good": "Accurate with occasional minor deviations",
                "fair": "Generally follows commands but with some errors",
                "poor": "Frequent misalignment with input commands"
            }
        ),
        
        "action_responsiveness": EvaluationCriterion(
            name="Action Responsiveness",
            dimension="controllability",
            description="Timing and execution of actions (jump, attack)",
            scoring_guide={
                "excellent": "Instant and accurate response to all actions",
                "good": "Responsive with minimal delay",
                "fair": "Some delayed or missed actions",
                "poor": "Frequently unresponsive or incorrect actions"
            }
        ),
        
        "camera_control": EvaluationCriterion(
            name="Camera Control",
            dimension="controllability",
            description="Smoothness and accuracy of camera movements",
            scoring_guide={
                "excellent": "Perfectly smooth camera following mouse input",
                "good": "Smooth camera with minor jitter",
                "fair": "Generally smooth but with noticeable issues",
                "poor": "Jerky or incorrect camera movements"
            }
        ),
        
        # Visual Quality Criteria
        "image_clarity": EvaluationCriterion(
            name="Image Clarity",
            dimension="visual_quality",
            description="Sharpness and clarity of individual frames",
            scoring_guide={
                "excellent": "Crystal clear, sharp textures throughout",
                "good": "Clear with minor blur in some areas",
                "fair": "Generally clear but some noticeable blur",
                "poor": "Significant blur or pixelation"
            }
        ),
        
        "texture_quality": EvaluationCriterion(
            name="Texture Quality",
            dimension="visual_quality",
            description="Quality and consistency of Minecraft textures",
            scoring_guide={
                "excellent": "Perfect Minecraft textures, properly aligned",
                "good": "Good textures with minor inconsistencies",
                "fair": "Recognizable textures but with artifacts",
                "poor": "Distorted or unrecognizable textures"
            }
        ),
        
        "lighting_consistency": EvaluationCriterion(
            name="Lighting Consistency",
            dimension="visual_quality",
            description="Consistency of lighting and shadows",
            scoring_guide={
                "excellent": "Perfect lighting matching Minecraft style",
                "good": "Good lighting with minor inconsistencies",
                "fair": "Some lighting issues but acceptable",
                "poor": "Incorrect or flickering lighting"
            }
        ),
        
        # Temporal Consistency Criteria
        "motion_smoothness": EvaluationCriterion(
            name="Motion Smoothness",
            dimension="temporal_consistency",
            description="Fluidity of movement between frames",
            scoring_guide={
                "excellent": "Perfectly smooth motion throughout",
                "good": "Smooth with occasional minor stutters",
                "fair": "Generally smooth but with noticeable jitter",
                "poor": "Frequent stuttering or jerky motion"
            }
        ),
        
        "object_persistence": EvaluationCriterion(
            name="Object Persistence",
            dimension="temporal_consistency",
            description="Stability of objects and environment over time",
            scoring_guide={
                "excellent": "All objects remain perfectly stable",
                "good": "Stable with rare flickering",
                "fair": "Some objects flicker or change",
                "poor": "Frequent object instability"
            }
        ),
        
        "physics_consistency": EvaluationCriterion(
            name="Physics Consistency",
            dimension="temporal_consistency",
            description="Consistency of physical behaviors (gravity, collisions)",
            scoring_guide={
                "excellent": "Physics perfectly match Minecraft rules",
                "good": "Mostly correct physics with minor issues",
                "fair": "Some physics violations but acceptable",
                "poor": "Frequent impossible physics behaviors"
            }
        )
    }
    
    @classmethod
    def get_criteria_by_dimension(cls, dimension: str) -> List[EvaluationCriterion]:
        """Get all criteria for a specific dimension."""
        return [
            criterion for criterion in cls.CRITERIA.values()
            if criterion.dimension == dimension
        ]
    
    @classmethod
    def score_comparison(
        cls,
        ratings: Dict[str, ComparisonResult],
        weights: Optional[Dict[str, float]] = None
    ) -> float:
        """
        Calculate aggregate score from individual criterion ratings.
        
        Args:
            ratings: Dictionary mapping criterion names to comparison results
            weights: Optional weights for each criterion
            
        Returns:
            Aggregate score (-2 to 2, negative favors B, positive favors A)
        """
        if weights is None:
            weights = {name: criterion.weight for name, criterion in cls.CRITERIA.items()}
        
        total_score = 0
        total_weight = 0
        
        for criterion_name, result in ratings.items():
            weight = weights.get(criterion_name, 1.0)
            total_score += result.value * weight
            total_weight += weight
        
        return total_score / total_weight if total_weight > 0 else 0
    
    @classmethod
    def format_scoring_rubric(cls, dimension: str) -> str:
        """Generate a formatted scoring rubric for a dimension."""
        criteria = cls.get_criteria_by_dimension(dimension)
        
        rubric = f"Scoring Rubric for {dimension.replace('_', ' ').title()}:\n\n"
        
        for criterion in criteria:
            rubric += f"{criterion.name}:\n"
            rubric += f"  {criterion.description}\n"
            rubric += "  Scoring Guide:\n"
            for level, description in criterion.scoring_guide.items():
                rubric += f"    - {level.title()}: {description}\n"
            rubric += "\n"
        
        return rubric