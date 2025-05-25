"""
Flask web application for Matrix-Game human evaluation.
"""

import os
import json
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_cors import CORS
import yaml

from ..evaluation.ab_testing import ABTestingFramework
from ..evaluation.prompts import EvaluationPrompts
from ..evaluation.criteria import EvaluationCriteria, ComparisonResult


def create_app(config_path="configs/evaluation_config.yaml"):
    """Create and configure the Flask application."""
    
    app = Flask(__name__)
    app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    CORS(app)
    
    # Load configuration
    with open(config_path, 'r') as f:
        app.config['EVAL_CONFIG'] = yaml.safe_load(f)
    
    # Initialize evaluation framework
    output_dir = app.config['EVAL_CONFIG'].get('local_testing', {}).get('output_dir', './data/web_evaluations')
    app.config['FRAMEWORK'] = ABTestingFramework(output_dir=output_dir)
    
    # Routes
    @app.route('/')
    def index():
        """Landing page with instructions."""
        return render_template('index.html')
    
    @app.route('/evaluate/<comparison_id>')
    def evaluate(comparison_id):
        """Main evaluation page for a comparison."""
        framework = app.config['FRAMEWORK']
        comparison = framework.get_comparison(comparison_id)
        
        if not comparison:
            return "Comparison not found", 404
        
        # Initialize session for this evaluation
        if 'evaluator_id' not in session:
            session['evaluator_id'] = str(uuid.uuid4())
        
        if 'start_time' not in session:
            session['start_time'] = datetime.now().isoformat()
        
        # Get evaluation prompts
        dimensions = EvaluationPrompts.get_all_dimensions()
        dimension_prompts = {
            dim: EvaluationPrompts.get_dimension_prompt(dim)
            for dim in dimensions
        }
        
        return render_template(
            'evaluate.html',
            comparison=comparison,
            dimensions=dimensions,
            dimension_prompts=dimension_prompts,
            criteria=EvaluationCriteria.CRITERIA
        )
    
    @app.route('/api/submit_evaluation', methods=['POST'])
    def submit_evaluation():
        """Submit evaluation results."""
        data = request.json
        
        if 'comparison_id' not in data:
            return jsonify({"error": "Missing comparison_id"}), 400
        
        # Calculate completion time
        start_time = datetime.fromisoformat(session.get('start_time', datetime.now().isoformat()))
        completion_time = (datetime.now() - start_time).total_seconds()
        
        # Record evaluation
        framework = app.config['FRAMEWORK']
        result = framework.record_evaluation_result(
            comparison_id=data['comparison_id'],
            evaluator_id=session.get('evaluator_id', 'anonymous'),
            dimension_scores=data.get('dimension_scores', {}),
            detailed_ratings=data.get('detailed_ratings', {}),
            completion_time_seconds=completion_time
        )
        
        # Clear session
        session.clear()
        
        return jsonify({
            "success": True,
            "result_id": result.result_id,
            "next_url": url_for('thank_you')
        })
    
    @app.route('/thank_you')
    def thank_you():
        """Thank you page after evaluation."""
        return render_template('thank_you.html')
    
    @app.route('/api/comparisons')
    def list_comparisons():
        """API endpoint to list available comparisons."""
        framework = app.config['FRAMEWORK']
        
        # Get all comparisons
        comparisons = []
        comparisons_dir = os.path.join(framework.comparisons_dir)
        
        for filename in os.listdir(comparisons_dir):
            if filename.endswith('.json'):
                with open(os.path.join(comparisons_dir, filename), 'r') as f:
                    comp_data = json.load(f)
                    
                # Check how many evaluations this comparison has
                results = framework.get_results_for_comparison(comp_data['comparison_id'])
                
                comparisons.append({
                    "comparison_id": comp_data['comparison_id'],
                    "scenario_id": comp_data['scenario_id'],
                    "created_at": comp_data['created_at'],
                    "num_evaluations": len(results),
                    "evaluation_url": url_for('evaluate', comparison_id=comp_data['comparison_id'])
                })
        
        return jsonify(comparisons)
    
    @app.route('/admin')
    def admin():
        """Admin page to view evaluation progress."""
        return render_template('admin.html')
    
    @app.route('/api/evaluation_stats')
    def evaluation_stats():
        """Get statistics about evaluations."""
        framework = app.config['FRAMEWORK']
        
        # Collect statistics
        total_comparisons = 0
        total_evaluations = 0
        evaluations_by_scenario = {}
        
        comparisons_dir = os.path.join(framework.comparisons_dir)
        for filename in os.listdir(comparisons_dir):
            if filename.endswith('.json'):
                total_comparisons += 1
                
                with open(os.path.join(comparisons_dir, filename), 'r') as f:
                    comp_data = json.load(f)
                
                scenario = comp_data['scenario_id']
                results = framework.get_results_for_comparison(comp_data['comparison_id'])
                
                if scenario not in evaluations_by_scenario:
                    evaluations_by_scenario[scenario] = 0
                evaluations_by_scenario[scenario] += len(results)
                total_evaluations += len(results)
        
        return jsonify({
            "total_comparisons": total_comparisons,
            "total_evaluations": total_evaluations,
            "evaluations_by_scenario": evaluations_by_scenario,
            "target_evaluations_per_comparison": app.config['EVAL_CONFIG']['human_evaluation']['evaluators_per_comparison']
        })
    
    # Error handlers
    @app.errorhandler(404)
    def not_found(error):
        return render_template('404.html'), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        return render_template('500.html'), 500
    
    return app


# Create the application instance
app = create_app()


if __name__ == '__main__':
    app.run(debug=True, port=5000)