import torch
import numpy as np
from typing import Dict, List, Optional, Tuple, Union
from diffusers import DiffusionPipeline
from transformers import AutoTokenizer, AutoModel
import logging

from .base_model import BaseWorldModel


logger = logging.getLogger(__name__)


class MatrixGameModel(BaseWorldModel):
    """Matrix-Game world model implementation."""
    
    # Action mappings from the paper
    KEYBOARD_ACTIONS = {
        "forward": 0,
        "backward": 1,
        "left": 2,
        "right": 3,
        "jump": 4,
        "attack": 5,
        "none": 6
    }
    
    # Mouse movement mappings (pitch/yaw angles)
    MOUSE_DIRECTIONS = {
        "camera_up": (-15, 0),         # pitch up
        "camera_down": (15, 0),         # pitch down
        "camera_left": (0, -15),        # yaw left
        "camera_right": (0, 15),        # yaw right
        "camera_upper_left": (-15, -15),
        "camera_upper_right": (-15, 15),
        "camera_lower_left": (15, -15),
        "camera_lower_right": (15, 15),
        "none": (0, 0)
    }
    
    def __init__(self, model_name: str = "Skywork/Matrix-Game", device: str = "cuda"):
        super().__init__(model_name, device)
        self.pipeline = None
        self.visual_encoder = None
        
    def load_model(self, checkpoint_path: Optional[str] = None) -> None:
        """Load Matrix-Game model from HuggingFace or local checkpoint."""
        try:
            logger.info(f"Loading Matrix-Game model from {self.model_name}")
            
            # Load the diffusion pipeline
            self.pipeline = DiffusionPipeline.from_pretrained(
                self.model_name if not checkpoint_path else checkpoint_path,
                torch_dtype=torch.float16 if self.device.type == "cuda" else torch.float32,
                device_map="auto"
            )
            
            # Move to device
            self.pipeline = self.pipeline.to(self.device)
            
            # Enable memory efficient attention if available
            if hasattr(self.pipeline, "enable_attention_slicing"):
                self.pipeline.enable_attention_slicing()
                
            logger.info("Model loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            # Fallback to mock model for testing
            logger.warning("Using mock model for testing purposes")
            self.pipeline = self._create_mock_pipeline()
    
    def _create_mock_pipeline(self):
        """Create a mock pipeline for testing when model isn't available."""
        class MockPipeline:
            def __call__(self, *args, **kwargs):
                # Return random video frames
                frames = kwargs.get("num_frames", 65)
                height = kwargs.get("height", 720)
                width = kwargs.get("width", 1280)
                return {
                    "frames": torch.randn(1, frames, 3, height, width)
                }
        return MockPipeline()
    
    def preprocess_image(self, image: np.ndarray) -> torch.Tensor:
        """Preprocess reference image for model input."""
        # Convert to tensor and normalize
        if isinstance(image, np.ndarray):
            image = torch.from_numpy(image).float() / 255.0
            
        # Ensure shape is (C, H, W)
        if image.dim() == 3 and image.shape[-1] == 3:
            image = image.permute(2, 0, 1)
            
        # Add batch dimension
        if image.dim() == 3:
            image = image.unsqueeze(0)
            
        return image.to(self.device)
    
    def preprocess_actions(self, actions: List[Dict[str, Union[str, float]]]) -> Dict[str, torch.Tensor]:
        """Convert action list to model-specific format."""
        keyboard_actions = []
        mouse_movements = []
        
        for action in actions:
            # Process keyboard action
            kb_action = action.get("keyboard", "none")
            keyboard_actions.append(self.KEYBOARD_ACTIONS.get(kb_action, 6))
            
            # Process mouse movement
            mouse_action = action.get("mouse", "none")
            if mouse_action in self.MOUSE_DIRECTIONS:
                pitch, yaw = self.MOUSE_DIRECTIONS[mouse_action]
            else:
                # Handle continuous values
                pitch = action.get("pitch", 0.0)
                yaw = action.get("yaw", 0.0)
            mouse_movements.append([pitch, yaw])
        
        return {
            "keyboard_actions": torch.tensor(keyboard_actions, dtype=torch.long).to(self.device),
            "mouse_movements": torch.tensor(mouse_movements, dtype=torch.float32).to(self.device)
        }
    
    def generate_video(
        self,
        reference_image: Union[np.ndarray, torch.Tensor],
        actions: List[Dict[str, Union[str, float]]],
        num_frames: int = 65,
        fps: int = 16,
        resolution: Tuple[int, int] = (1280, 720),
        cfg_scale: float = 6.0,
        num_inference_steps: int = 50,
        **kwargs
    ) -> np.ndarray:
        """Generate video using Matrix-Game model."""
        
        # Preprocess inputs
        ref_image_tensor = self.preprocess_image(reference_image)
        action_tensors = self.preprocess_actions(actions)
        
        # Generate video using the pipeline
        with torch.no_grad():
            output = self.pipeline(
                image=ref_image_tensor,
                keyboard_actions=action_tensors["keyboard_actions"],
                mouse_movements=action_tensors["mouse_movements"],
                num_frames=num_frames,
                height=resolution[1],
                width=resolution[0],
                guidance_scale=cfg_scale,
                num_inference_steps=num_inference_steps,
                **kwargs
            )
        
        # Extract frames and convert to numpy
        if isinstance(output, dict):
            frames = output.get("frames", output.get("video", None))
        else:
            frames = output
            
        # Convert to numpy array with shape (num_frames, height, width, 3)
        if isinstance(frames, torch.Tensor):
            # Remove batch dimension if present
            if frames.dim() == 5:  # (B, T, C, H, W)
                frames = frames[0]
            
            # Rearrange to (T, H, W, C)
            if frames.shape[1] == 3:  # (T, C, H, W)
                frames = frames.permute(0, 2, 3, 1)
                
            # Convert to numpy and scale to [0, 255]
            frames = (frames.cpu().numpy() * 255).astype(np.uint8)
        
        return frames
    
    def generate_with_scenario(
        self,
        scenario: str,
        actions: List[Dict[str, Union[str, float]]],
        **kwargs
    ) -> np.ndarray:
        """Generate video for a specific Minecraft scenario."""
        
        # Load or generate a reference image for the scenario
        # In practice, this would load a pre-captured image from that biome
        ref_image = self._get_scenario_reference_image(scenario)
        
        return self.generate_video(ref_image, actions, **kwargs)
    
    def _get_scenario_reference_image(self, scenario: str) -> np.ndarray:
        """Get a reference image for a specific scenario."""
        # In practice, load from a dataset of scenario images
        # For now, return a placeholder
        logger.info(f"Loading reference image for scenario: {scenario}")
        
        # Create a placeholder image with scenario-specific colors
        scenario_colors = {
            "beach": [255, 220, 150],     # Sandy
            "desert": [255, 200, 100],     # Desert sand
            "forest": [50, 150, 50],       # Green
            "hills": [100, 150, 100],      # Hill green
            "icy": [200, 220, 255],        # Ice blue
            "mushroom": [200, 100, 150],   # Mushroom red
            "plains": [100, 200, 100],     # Grass green
            "river": [100, 150, 200]       # Water blue
        }
        
        color = scenario_colors.get(scenario, [128, 128, 128])
        image = np.full((720, 1280, 3), color, dtype=np.uint8)
        
        return image