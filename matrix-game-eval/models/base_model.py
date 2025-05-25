from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Tuple, Union
import numpy as np
import torch


class BaseWorldModel(ABC):
    """Base class for all world models used in the evaluation harness."""
    
    def __init__(self, model_name: str, device: str = "cuda"):
        self.model_name = model_name
        self.device = torch.device(device if torch.cuda.is_available() else "cpu")
        self.model = None
        
    @abstractmethod
    def load_model(self, checkpoint_path: Optional[str] = None) -> None:
        """Load the model from checkpoint or HuggingFace."""
        pass
    
    @abstractmethod
    def generate_video(
        self,
        reference_image: Union[np.ndarray, torch.Tensor],
        actions: List[Dict[str, Union[str, float]]],
        num_frames: int = 65,
        fps: int = 16,
        resolution: Tuple[int, int] = (1280, 720),
        **kwargs
    ) -> np.ndarray:
        """
        Generate a video given a reference image and action sequence.
        
        Args:
            reference_image: Initial frame as numpy array or torch tensor
            actions: List of action dictionaries with keyboard and mouse actions
            num_frames: Number of frames to generate
            fps: Frames per second
            resolution: Output resolution (width, height)
            
        Returns:
            Generated video as numpy array of shape (num_frames, height, width, 3)
        """
        pass
    
    @abstractmethod
    def preprocess_image(self, image: np.ndarray) -> torch.Tensor:
        """Preprocess image for model input."""
        pass
    
    @abstractmethod
    def preprocess_actions(self, actions: List[Dict[str, Union[str, float]]]) -> torch.Tensor:
        """Convert action list to model-specific format."""
        pass
    
    def generate_autoregressive_video(
        self,
        reference_image: Union[np.ndarray, torch.Tensor],
        action_sequence: List[List[Dict[str, Union[str, float]]]],
        segment_length: int = 33,
        overlap_frames: int = 5,
        **kwargs
    ) -> np.ndarray:
        """
        Generate long videos using autoregressive generation.
        
        Args:
            reference_image: Initial frame
            action_sequence: List of action segments
            segment_length: Length of each segment
            overlap_frames: Number of overlapping frames between segments
            
        Returns:
            Long generated video
        """
        all_frames = []
        current_ref = reference_image
        
        for segment_actions in action_sequence:
            # Generate segment
            segment = self.generate_video(
                current_ref,
                segment_actions[:segment_length],
                num_frames=segment_length,
                **kwargs
            )
            
            # Add frames (excluding overlap from previous segment)
            if all_frames:
                all_frames.extend(segment[overlap_frames:])
            else:
                all_frames.extend(segment)
            
            # Update reference for next segment
            current_ref = segment[-overlap_frames:]
            
        return np.array(all_frames)