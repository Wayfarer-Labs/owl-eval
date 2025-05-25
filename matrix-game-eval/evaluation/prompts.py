"""
Human evaluation prompts for Matrix-Game evaluation.
Based on the four dimensions from the paper:
1. Overall Quality
2. Controllability
3. Visual Quality
4. Temporal Consistency
"""

from typing import Dict, List, Tuple
import random


class EvaluationPrompts:
    """Collection of prompts for human evaluation."""
    
    # Instructions for evaluators
    GENERAL_INSTRUCTIONS = """
    You will be shown two videos side by side, labeled as "Model A" and "Model B".
    Both videos start from the same initial frame and are generated based on the same 
    sequence of control actions (keyboard and mouse movements).
    
    Please watch both videos carefully and evaluate them based on the specific criteria
    provided for each question. There is no right or wrong answer - we want your 
    honest opinion based on what you observe.
    
    For each criterion, select which model performed better, or indicate if they 
    performed equally well.
    """
    
    # Evaluation dimensions with detailed criteria
    EVALUATION_DIMENSIONS = {
        "overall_quality": {
            "name": "Overall Quality",
            "prompt": "Which video has better overall quality?",
            "description": """
            Consider the overall impression of the generated videos, including:
            - General realism and believability
            - Coherence of the game world
            - Completeness of actions and movements
            - How well it looks like actual Minecraft gameplay
            """,
            "sub_questions": [
                "Which video looks more like real Minecraft gameplay?",
                "Which video maintains a more coherent game world?",
                "Which video shows more complete and natural movements?"
            ]
        },
        
        "controllability": {
            "name": "Controllability",
            "prompt": "Which video better follows the control inputs?",
            "description": """
            Evaluate how accurately the character responds to control inputs:
            - Does the character move in the intended direction?
            - Are jumps and attacks executed when commanded?
            - Does the camera rotate smoothly according to mouse movements?
            - Are the responses timely and accurate?
            
            The intended actions are shown below the videos.
            """,
            "sub_questions": [
                "Which video shows more accurate character movement?",
                "Which video has better camera control?",
                "Which video responds more accurately to action commands?"
            ]
        },
        
        "visual_quality": {
            "name": "Visual Quality",
            "prompt": "Which video has better visual quality?",
            "description": """
            Focus on the visual aspects of individual frames:
            - Image clarity and sharpness
            - Texture quality and detail
            - Lighting and color consistency
            - Absence of visual artifacts or glitches
            """,
            "sub_questions": [
                "Which video has clearer and sharper visuals?",
                "Which video shows better texture quality?",
                "Which video has fewer visual artifacts?"
            ]
        },
        
        "temporal_consistency": {
            "name": "Temporal Consistency",
            "prompt": "Which video has better temporal consistency?",
            "description": """
            Evaluate the consistency across time:
            - Smooth transitions between frames
            - Stable object appearance over time
            - Consistent physics and motion
            - No flickering or sudden changes
            """,
            "sub_questions": [
                "Which video has smoother motion?",
                "Which video maintains more stable object appearance?",
                "Which video shows more consistent physics?"
            ]
        }
    }
    
    # Response options for A/B testing
    RESPONSE_OPTIONS = [
        "Model A is much better",
        "Model A is slightly better",
        "Both are equally good",
        "Model B is slightly better",
        "Model B is much better"
    ]
    
    @classmethod
    def get_dimension_prompt(cls, dimension: str) -> Dict[str, str]:
        """Get the prompt for a specific evaluation dimension."""
        if dimension not in cls.EVALUATION_DIMENSIONS:
            raise ValueError(f"Unknown dimension: {dimension}")
        return cls.EVALUATION_DIMENSIONS[dimension]
    
    @classmethod
    def get_all_dimensions(cls) -> List[str]:
        """Get list of all evaluation dimensions."""
        return list(cls.EVALUATION_DIMENSIONS.keys())
    
    @classmethod
    def format_evaluation_page(
        cls,
        dimension: str,
        action_sequence_description: str
    ) -> Dict[str, str]:
        """Format a complete evaluation page for a dimension."""
        dim_info = cls.get_dimension_prompt(dimension)
        
        return {
            "instructions": cls.GENERAL_INSTRUCTIONS,
            "dimension_name": dim_info["name"],
            "main_question": dim_info["prompt"],
            "criteria": dim_info["description"],
            "action_sequence": action_sequence_description,
            "response_options": cls.RESPONSE_OPTIONS,
            "sub_questions": dim_info.get("sub_questions", [])
        }


class ActionSequenceGenerator:
    """Generate diverse action sequences for evaluation."""
    
    # Action templates for different scenarios
    ACTION_TEMPLATES = {
        "exploration": [
            {"name": "Basic Forward Movement", "actions": ["forward"] * 10},
            {"name": "Left-Right Movement", "actions": ["left"] * 5 + ["right"] * 5},
            {"name": "Circle Movement", "actions": ["forward", "right"] * 5},
            {"name": "Zigzag Pattern", "actions": ["forward", "left", "forward", "right"] * 3}
        ],
        
        "navigation": [
            {"name": "Obstacle Avoidance", "actions": ["forward", "jump", "forward", "left", "forward", "right"]},
            {"name": "Climbing", "actions": ["forward", "jump"] * 5},
            {"name": "Turning Corners", "actions": ["forward"] * 3 + ["right"] + ["forward"] * 3}
        ],
        
        "interaction": [
            {"name": "Mining", "actions": ["forward", "attack"] * 5},
            {"name": "Combat Sequence", "actions": ["forward", "attack", "left", "attack", "right", "attack"]},
            {"name": "Jump Attack", "actions": ["forward", "jump", "attack"] * 3}
        ],
        
        "camera_control": [
            {"name": "Look Around", "mouse": ["camera_left", "camera_right", "camera_up", "camera_down"]},
            {"name": "Diagonal View", "mouse": ["camera_upper_left", "camera_lower_right"] * 3},
            {"name": "Scanning", "mouse": ["camera_left"] * 5 + ["camera_right"] * 5}
        ],
        
        "combined": [
            {
                "name": "Exploration with Camera",
                "actions": ["forward"] * 5,
                "mouse": ["camera_left", "camera_right"] * 2
            },
            {
                "name": "Combat with Movement",
                "actions": ["forward", "attack", "left", "jump", "attack"],
                "mouse": ["camera_up", "camera_down"]
            }
        ]
    }
    
    @classmethod
    def generate_sequence(
        cls,
        category: str,
        length: int = 65,
        randomize: bool = False
    ) -> Tuple[List[Dict], str]:
        """
        Generate an action sequence for testing.
        
        Returns:
            Tuple of (action_list, description)
        """
        if category not in cls.ACTION_TEMPLATES:
            category = random.choice(list(cls.ACTION_TEMPLATES.keys()))
        
        template = random.choice(cls.ACTION_TEMPLATES[category])
        actions = []
        
        # Build action sequence
        keyboard_actions = template.get("actions", [])
        mouse_actions = template.get("mouse", [])
        
        # Extend or trim to desired length
        for i in range(length):
            action = {}
            
            # Add keyboard action
            if keyboard_actions:
                action["keyboard"] = keyboard_actions[i % len(keyboard_actions)]
            else:
                action["keyboard"] = "none"
            
            # Add mouse action
            if mouse_actions:
                action["mouse"] = mouse_actions[i % len(mouse_actions)]
            else:
                action["mouse"] = "none"
            
            actions.append(action)
        
        # Create description
        description = f"{template['name']}: "
        if keyboard_actions:
            description += f"Keyboard: {', '.join(keyboard_actions[:5])}..."
        if mouse_actions:
            description += f" Mouse: {', '.join(mouse_actions[:3])}..."
        
        return actions, description
    
    @classmethod
    def generate_evaluation_set(
        cls,
        num_sequences: int = 10,
        scenarios: List[str] = None
    ) -> List[Dict]:
        """Generate a complete set of evaluation sequences."""
        if scenarios is None:
            scenarios = ["beach", "desert", "forest", "hills", "icy", "mushroom", "plains", "river"]
        
        evaluation_set = []
        categories = list(cls.ACTION_TEMPLATES.keys())
        
        for i in range(num_sequences):
            # Rotate through categories
            category = categories[i % len(categories)]
            actions, description = cls.generate_sequence(category)
            
            # Assign to random scenario
            scenario = random.choice(scenarios)
            
            evaluation_set.append({
                "id": f"eval_{i:03d}",
                "scenario": scenario,
                "category": category,
                "actions": actions,
                "description": description
            })
        
        return evaluation_set