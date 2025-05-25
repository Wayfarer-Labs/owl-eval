"""
Prolific API client for managing human evaluation studies.
"""

import os
import json
import requests
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class ProlificClient:
    """Client for interacting with Prolific API."""
    
    BASE_URL = "https://api.prolific.co"
    
    def __init__(self, api_token: Optional[str] = None):
        """
        Initialize Prolific client.
        
        Args:
            api_token: Prolific API token (or set PROLIFIC_API_TOKEN env var)
        """
        self.api_token = api_token or os.environ.get('PROLIFIC_API_TOKEN')
        if not self.api_token:
            raise ValueError("Prolific API token required. Set PROLIFIC_API_TOKEN environment variable.")
        
        self.headers = {
            'Authorization': f'Token {self.api_token}',
            'Content-Type': 'application/json'
        }
    
    def create_study(
        self,
        name: str,
        description: str,
        external_study_url: str,
        estimated_completion_time: int,
        reward: int,
        total_available_places: int,
        eligibility_requirements: Optional[List[Dict]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Create a new study on Prolific.
        
        Args:
            name: Study name
            description: Study description
            external_study_url: URL where participants will be redirected
            estimated_completion_time: Time in minutes
            reward: Reward in cents (pence for UK)
            total_available_places: Number of participants needed
            eligibility_requirements: List of eligibility criteria
            
        Returns:
            Study creation response
        """
        data = {
            "name": name,
            "description": description,
            "external_study_url": external_study_url,
            "estimated_completion_time": estimated_completion_time,
            "reward": reward,
            "total_available_places": total_available_places,
            "eligibility_requirements": eligibility_requirements or []
        }
        
        # Add any additional parameters
        data.update(kwargs)
        
        response = requests.post(
            f"{self.BASE_URL}/api/v1/studies/",
            headers=self.headers,
            json=data
        )
        
        if response.status_code != 201:
            logger.error(f"Failed to create study: {response.text}")
            response.raise_for_status()
        
        return response.json()
    
    def get_study(self, study_id: str) -> Dict[str, Any]:
        """Get study details."""
        response = requests.get(
            f"{self.BASE_URL}/api/v1/studies/{study_id}/",
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def publish_study(self, study_id: str) -> Dict[str, Any]:
        """Publish a draft study."""
        response = requests.post(
            f"{self.BASE_URL}/api/v1/studies/{study_id}/transition/",
            headers=self.headers,
            json={"action": "PUBLISH"}
        )
        response.raise_for_status()
        return response.json()
    
    def get_submissions(self, study_id: str) -> List[Dict[str, Any]]:
        """Get all submissions for a study."""
        response = requests.get(
            f"{self.BASE_URL}/api/v1/studies/{study_id}/submissions/",
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()['results']
    
    def approve_submission(self, submission_id: str) -> Dict[str, Any]:
        """Approve a submission."""
        response = requests.post(
            f"{self.BASE_URL}/api/v1/submissions/{submission_id}/transition/",
            headers=self.headers,
            json={"action": "APPROVE"}
        )
        response.raise_for_status()
        return response.json()
    
    def reject_submission(self, submission_id: str, rejection_reason: str) -> Dict[str, Any]:
        """Reject a submission with reason."""
        response = requests.post(
            f"{self.BASE_URL}/api/v1/submissions/{submission_id}/transition/",
            headers=self.headers,
            json={
                "action": "REJECT",
                "rejection_reason": rejection_reason
            }
        )
        response.raise_for_status()
        return response.json()


class ProlificStudyManager:
    """Manager for Matrix-Game evaluation studies on Prolific."""
    
    def __init__(self, client: ProlificClient, base_url: str):
        """
        Initialize study manager.
        
        Args:
            client: Prolific API client
            base_url: Base URL for the evaluation web interface
        """
        self.client = client
        self.base_url = base_url
    
    def create_evaluation_study(
        self,
        study_name: str,
        num_participants: int,
        comparisons_per_participant: int = 5,
        reward_per_comparison_cents: int = 50,
        eligibility_requirements: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Create a Matrix-Game evaluation study.
        
        Args:
            study_name: Name for the study
            num_participants: Number of participants needed
            comparisons_per_participant: Number of video comparisons each participant evaluates
            reward_per_comparison_cents: Reward per comparison in cents
            eligibility_requirements: Prolific eligibility requirements
            
        Returns:
            Created study details
        """
        # Calculate total time and reward
        estimated_time_minutes = comparisons_per_participant * 2  # ~2 min per comparison
        total_reward_cents = comparisons_per_participant * reward_per_comparison_cents
        
        # Default eligibility requirements
        if eligibility_requirements is None:
            eligibility_requirements = [
                {
                    "attributes": [
                        {"name": "approval_rate", "value": 95}  # 95% approval rate
                    ]
                },
                {
                    "attributes": [
                        {"name": "language", "value": ["en"]}  # English speakers
                    ]
                }
            ]
        
        # Study description
        description = f"""
        Evaluate AI-generated Minecraft gameplay videos by comparing pairs of videos.
        
        You will:
        - Watch {comparisons_per_participant} pairs of short videos (4 seconds each)
        - Compare them across 4 quality dimensions
        - Provide your honest opinion on which performs better
        
        Time: ~{estimated_time_minutes} minutes
        Reward: ${total_reward_cents/100:.2f}
        """
        
        # Create completion URL with participant ID
        external_url = f"{self.base_url}/prolific/start?PROLIFIC_PID={{%raw%}}{{{{PROLIFIC_PID}}}}{%endraw%}}&SESSION_ID={{%raw%}}{{{{SESSION_ID}}}}{%endraw%}}&STUDY_ID={{%raw%}}{{{{STUDY_ID}}}}{%endraw%}}"
        
        # Create the study
        study = self.client.create_study(
            name=f"Matrix-Game Evaluation: {study_name}",
            description=description.strip(),
            external_study_url=external_url,
            estimated_completion_time=estimated_time_minutes,
            reward=total_reward_cents,
            total_available_places=num_participants,
            eligibility_requirements=eligibility_requirements,
            completion_code="MATRIXGAME2024",  # Participants enter this on completion
            device_compatibility=["desktop"],  # Desktop only for video viewing
            peripheral_requirements=["audio", "download_speed_5"]  # Need audio and good internet
        )
        
        logger.info(f"Created study: {study['id']}")
        return study
    
    def sync_submissions(self, study_id: str, evaluation_results: Dict[str, Any]) -> None:
        """
        Sync evaluation results with Prolific submissions.
        
        Args:
            study_id: Prolific study ID
            evaluation_results: Dictionary mapping participant_id to their evaluation quality
        """
        submissions = self.client.get_submissions(study_id)
        
        for submission in submissions:
            participant_id = submission['participant_id']
            
            if submission['status'] == 'AWAITING_REVIEW':
                if participant_id in evaluation_results:
                    result = evaluation_results[participant_id]
                    
                    # Check quality of evaluations
                    if result['quality_score'] >= 0.8:  # 80% quality threshold
                        logger.info(f"Approving submission for {participant_id}")
                        self.client.approve_submission(submission['id'])
                    else:
                        logger.info(f"Rejecting submission for {participant_id} (low quality)")
                        self.client.reject_submission(
                            submission['id'],
                            "Evaluations did not meet quality standards (random responses detected)"
                        )
    
    def export_study_data(self, study_id: str, output_path: str) -> None:
        """Export all data for a Prolific study."""
        study = self.client.get_study(study_id)
        submissions = self.client.get_submissions(study_id)
        
        export_data = {
            "study": study,
            "submissions": submissions,
            "exported_at": datetime.now().isoformat()
        }
        
        with open(output_path, 'w') as f:
            json.dump(export_data, f, indent=2)
        
        logger.info(f"Exported Prolific data to {output_path}")