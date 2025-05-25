"""
Pre-defined test scenarios for comprehensive model evaluation.
Each scenario tests specific aspects of world generation capabilities.
"""

from typing import Dict, List, Any
import json


class TestScenarios:
    """Collection of test scenarios designed to evaluate different model capabilities."""
    
    SCENARIOS = {
        # Basic Movement Tests
        "basic_forward": {
            "name": "Basic Forward Movement",
            "description": "Tests simple forward movement in open terrain",
            "biome": "plains",
            "duration_frames": 65,
            "actions": [{"keyboard": "forward", "mouse": "none"}] * 65,
            "evaluation_focus": ["movement_accuracy", "motion_smoothness"]
        },
        
        "turn_sequence": {
            "name": "Turn Sequence",
            "description": "Tests turning while moving forward",
            "biome": "plains",
            "duration_frames": 65,
            "actions": (
                [{"keyboard": "forward", "mouse": "none"}] * 20 +
                [{"keyboard": "forward", "mouse": "camera_right"}] * 10 +
                [{"keyboard": "forward", "mouse": "none"}] * 20 +
                [{"keyboard": "forward", "mouse": "camera_left"}] * 15
            ),
            "evaluation_focus": ["camera_control", "motion_smoothness"]
        },
        
        # Complex Navigation Tests
        "obstacle_navigation": {
            "name": "Obstacle Navigation",
            "description": "Tests movement around obstacles with jumping",
            "biome": "forest",
            "duration_frames": 65,
            "actions": (
                [{"keyboard": "forward", "mouse": "none"}] * 10 +
                [{"keyboard": "forward", "mouse": "camera_up"}] * 5 +
                [{"keyboard": "jump", "mouse": "none"}] * 3 +
                [{"keyboard": "forward", "mouse": "none"}] * 10 +
                [{"keyboard": "left", "mouse": "camera_left"}] * 8 +
                [{"keyboard": "forward", "mouse": "none"}] * 10 +
                [{"keyboard": "right", "mouse": "camera_right"}] * 8 +
                [{"keyboard": "forward", "mouse": "none"}] * 11
            ),
            "evaluation_focus": ["movement_accuracy", "action_responsiveness", "physics_consistency"]
        },
        
        "climbing_test": {
            "name": "Hill Climbing",
            "description": "Tests climbing mechanics on steep terrain",
            "biome": "hills",
            "duration_frames": 65,
            "actions": (
                [{"keyboard": "forward", "mouse": "camera_up"}] * 15 +
                [{"keyboard": "jump", "mouse": "none"}] * 2 +
                [{"keyboard": "forward", "mouse": "none"}] * 10 +
                [{"keyboard": "jump", "mouse": "none"}] * 2 +
                [{"keyboard": "forward", "mouse": "camera_up"}] * 15 +
                [{"keyboard": "jump", "mouse": "none"}] * 3 +
                [{"keyboard": "forward", "mouse": "none"}] * 18
            ),
            "evaluation_focus": ["physics_consistency", "movement_accuracy"]
        },
        
        # Interaction Tests
        "mining_sequence": {
            "name": "Mining Sequence",
            "description": "Tests block breaking and mining actions",
            "biome": "desert",
            "duration_frames": 65,
            "actions": (
                [{"keyboard": "forward", "mouse": "none"}] * 10 +
                [{"keyboard": "none", "mouse": "camera_down"}] * 5 +
                [{"keyboard": "attack", "mouse": "none"}] * 20 +
                [{"keyboard": "forward", "mouse": "none"}] * 5 +
                [{"keyboard": "attack", "mouse": "none"}] * 15 +
                [{"keyboard": "none", "mouse": "camera_up"}] * 10
            ),
            "evaluation_focus": ["action_responsiveness", "object_persistence"]
        },
        
        # Camera Control Tests
        "panoramic_view": {
            "name": "360° Panoramic View",
            "description": "Tests full camera rotation while stationary",
            "biome": "beach",
            "duration_frames": 65,
            "actions": (
                [{"keyboard": "none", "mouse": "camera_right"}] * 32 +
                [{"keyboard": "none", "mouse": "none"}] * 3 +
                [{"keyboard": "none", "mouse": "camera_left"}] * 30
            ),
            "evaluation_focus": ["camera_control", "temporal_consistency", "object_persistence"]
        },
        
        "look_around_walk": {
            "name": "Walk and Look",
            "description": "Tests simultaneous movement and camera control",
            "biome": "forest",
            "duration_frames": 65,
            "actions": [
                {"keyboard": "forward", "mouse": "camera_left" if i % 20 < 10 else "camera_right"}
                for i in range(65)
            ],
            "evaluation_focus": ["camera_control", "movement_accuracy", "motion_smoothness"]
        },
        
        # Environment-Specific Tests
        "water_interaction": {
            "name": "Water Navigation",
            "description": "Tests movement in and around water",
            "biome": "river",
            "duration_frames": 65,
            "actions": (
                [{"keyboard": "forward", "mouse": "none"}] * 20 +
                [{"keyboard": "forward", "mouse": "camera_down"}] * 10 +
                [{"keyboard": "jump", "mouse": "none"}] * 5 +
                [{"keyboard": "forward", "mouse": "none"}] * 20 +
                [{"keyboard": "none", "mouse": "camera_up"}] * 10
            ),
            "evaluation_focus": ["physics_consistency", "texture_quality"]
        },
        
        "ice_movement": {
            "name": "Ice Surface Movement",
            "description": "Tests movement on slippery ice surfaces",
            "biome": "icy",
            "duration_frames": 65,
            "actions": (
                [{"keyboard": "forward", "mouse": "none"}] * 15 +
                [{"keyboard": "none", "mouse": "none"}] * 10 +  # Should show sliding
                [{"keyboard": "left", "mouse": "camera_left"}] * 10 +
                [{"keyboard": "none", "mouse": "none"}] * 10 +
                [{"keyboard": "right", "mouse": "camera_right"}] * 10 +
                [{"keyboard": "backward", "mouse": "none"}] * 10
            ),
            "evaluation_focus": ["physics_consistency", "motion_smoothness"]
        },
        
        # Stress Tests
        "rapid_actions": {
            "name": "Rapid Action Switching",
            "description": "Tests rapid switching between different actions",
            "biome": "plains",
            "duration_frames": 65,
            "actions": [
                {"keyboard": ["forward", "left", "right", "backward"][i % 4], 
                 "mouse": ["none", "camera_left", "camera_right"][i % 3]}
                for i in range(65)
            ],
            "evaluation_focus": ["action_responsiveness", "temporal_consistency"]
        },
        
        "complex_combat": {
            "name": "Complex Combat Sequence",
            "description": "Tests combat with movement and camera control",
            "biome": "mushroom",
            "duration_frames": 65,
            "actions": (
                [{"keyboard": "forward", "mouse": "none"}] * 10 +
                [{"keyboard": "attack", "mouse": "camera_right"}] * 5 +
                [{"keyboard": "left", "mouse": "none"}] * 5 +
                [{"keyboard": "attack", "mouse": "camera_left"}] * 5 +
                [{"keyboard": "backward", "mouse": "none"}] * 5 +
                [{"keyboard": "jump", "mouse": "none"}] * 3 +
                [{"keyboard": "attack", "mouse": "camera_up"}] * 10 +
                [{"keyboard": "forward", "mouse": "camera_down"}] * 10 +
                [{"keyboard": "attack", "mouse": "none"}] * 12
            ),
            "evaluation_focus": ["action_responsiveness", "movement_accuracy", "camera_control"]
        }
    }
    
    @classmethod
    def get_scenario(cls, scenario_id: str) -> Dict[str, Any]:
        """Get a specific test scenario by ID."""
        if scenario_id not in cls.SCENARIOS:
            raise ValueError(f"Unknown scenario: {scenario_id}")
        return cls.SCENARIOS[scenario_id]
    
    @classmethod
    def get_scenarios_by_biome(cls, biome: str) -> List[Dict[str, Any]]:
        """Get all scenarios for a specific biome."""
        return [
            {**scenario, "id": scenario_id}
            for scenario_id, scenario in cls.SCENARIOS.items()
            if scenario["biome"] == biome
        ]
    
    @classmethod
    def get_scenarios_by_focus(cls, focus: str) -> List[Dict[str, Any]]:
        """Get all scenarios that focus on a specific evaluation criterion."""
        return [
            {**scenario, "id": scenario_id}
            for scenario_id, scenario in cls.SCENARIOS.items()
            if focus in scenario["evaluation_focus"]
        ]
    
    @classmethod
    def export_scenario_set(
        cls,
        output_path: str,
        scenario_ids: List[str] = None
    ) -> None:
        """Export scenarios to JSON file for use in evaluation."""
        if scenario_ids is None:
            scenarios = cls.SCENARIOS
        else:
            scenarios = {
                sid: cls.SCENARIOS[sid] 
                for sid in scenario_ids 
                if sid in cls.SCENARIOS
            }
        
        # Add scenario IDs to the export
        export_data = {
            sid: {**scenario, "id": sid}
            for sid, scenario in scenarios.items()
        }
        
        with open(output_path, 'w') as f:
            json.dump(export_data, f, indent=2)
    
    @classmethod
    def create_balanced_test_set(cls, scenarios_per_biome: int = 2) -> List[Dict[str, Any]]:
        """Create a balanced test set with equal representation across biomes."""
        biomes = ["beach", "desert", "forest", "hills", "icy", "mushroom", "plains", "river"]
        test_set = []
        
        for biome in biomes:
            biome_scenarios = cls.get_scenarios_by_biome(biome)
            # Select up to scenarios_per_biome scenarios
            selected = biome_scenarios[:scenarios_per_biome]
            test_set.extend(selected)
        
        return test_set