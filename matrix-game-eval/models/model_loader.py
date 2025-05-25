import logging
from typing import Dict, Optional
import yaml

from .base_model import BaseWorldModel
from .matrix_game_model import MatrixGameModel

logger = logging.getLogger(__name__)


class ModelLoader:
    """Utility class for loading different world models."""
    
    # Registry of available models
    MODEL_REGISTRY = {
        "matrix_game": MatrixGameModel,
        "Skywork/Matrix-Game": MatrixGameModel,
        # Add other models here as they're implemented
        # "oasis": OasisModel,
        # "mineworld": MineWorldModel,
    }
    
    @classmethod
    def load_model(
        cls,
        model_name: str,
        device: str = "cuda",
        checkpoint_path: Optional[str] = None
    ) -> BaseWorldModel:
        """
        Load a world model by name.
        
        Args:
            model_name: Name of the model to load
            device: Device to load model on
            checkpoint_path: Optional path to model checkpoint
            
        Returns:
            Loaded world model instance
        """
        # Check if model is in registry
        model_class = None
        for key, value in cls.MODEL_REGISTRY.items():
            if key in model_name:
                model_class = value
                break
                
        if model_class is None:
            raise ValueError(f"Unknown model: {model_name}. Available models: {list(cls.MODEL_REGISTRY.keys())}")
        
        # Create model instance
        logger.info(f"Creating model instance: {model_name}")
        model = model_class(model_name=model_name, device=device)
        
        # Load model weights
        logger.info(f"Loading model weights...")
        model.load_model(checkpoint_path=checkpoint_path)
        
        return model
    
    @classmethod
    def load_from_config(cls, config_path: str) -> Dict[str, BaseWorldModel]:
        """
        Load all models specified in a configuration file.
        
        Args:
            config_path: Path to YAML configuration file
            
        Returns:
            Dictionary mapping model names to loaded models
        """
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        
        models = {}
        
        # Load primary model
        if "models" in config and "matrix_game" in config["models"]:
            primary_config = config["models"]["matrix_game"]
            models["matrix_game"] = cls.load_model(
                model_name=primary_config["name"],
                checkpoint_path=primary_config.get("checkpoint")
            )
        
        # Load baseline models
        if "models" in config and "baselines" in config["models"]:
            for baseline in config["models"]["baselines"]:
                try:
                    models[baseline["name"]] = cls.load_model(
                        model_name=baseline["name"],
                        checkpoint_path=baseline.get("path")
                    )
                except Exception as e:
                    logger.warning(f"Failed to load baseline model {baseline['name']}: {e}")
        
        return models