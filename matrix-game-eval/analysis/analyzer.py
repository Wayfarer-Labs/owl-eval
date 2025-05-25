"""
Analysis tools for Matrix-Game evaluation results.
"""

import json
import os
from typing import Dict, List, Tuple, Optional, Any
from datetime import datetime
import pandas as pd
import numpy as np
from collections import defaultdict
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats

from ..evaluation.ab_testing import ABTestingFramework, VideoComparison, EvaluationResult
from ..evaluation.criteria import ComparisonResult


class EvaluationAnalyzer:
    """Analyze human evaluation results for Matrix-Game."""
    
    def __init__(self, framework: ABTestingFramework):
        """
        Initialize analyzer.
        
        Args:
            framework: A/B testing framework containing results
        """
        self.framework = framework
        self.comparisons = self._load_all_comparisons()
        self.results = self._load_all_results()
    
    def _load_all_comparisons(self) -> Dict[str, VideoComparison]:
        """Load all comparisons from the framework."""
        comparisons = {}
        
        for filename in os.listdir(self.framework.comparisons_dir):
            if filename.endswith('.json'):
                comp_id = filename.replace('.json', '')
                comparison = self.framework.get_comparison(comp_id)
                if comparison:
                    comparisons[comp_id] = comparison
        
        return comparisons
    
    def _load_all_results(self) -> List[EvaluationResult]:
        """Load all evaluation results."""
        results = []
        
        for filename in os.listdir(self.framework.results_dir):
            if filename.endswith('.json'):
                with open(os.path.join(self.framework.results_dir, filename), 'r') as f:
                    data = json.load(f)
                    data['submitted_at'] = datetime.fromisoformat(data['submitted_at'])
                    results.append(EvaluationResult(**data))
        
        return results
    
    def calculate_model_performance(self) -> pd.DataFrame:
        """
        Calculate overall model performance across all dimensions.
        
        Returns:
            DataFrame with model performance metrics
        """
        model_scores = defaultdict(lambda: defaultdict(list))
        
        for result in self.results:
            comparison = self.comparisons.get(result.comparison_id)
            if not comparison:
                continue
            
            # Get actual model names from randomized labels
            model_a_actual = comparison.randomized_labels['A']
            model_b_actual = comparison.randomized_labels['B']
            
            # Process dimension scores
            for dimension, choice in result.dimension_scores.items():
                if choice == 'A':
                    model_scores[model_a_actual][dimension].append(1)
                    model_scores[model_b_actual][dimension].append(0)
                elif choice == 'B':
                    model_scores[model_a_actual][dimension].append(0)
                    model_scores[model_b_actual][dimension].append(1)
                else:  # Equal
                    model_scores[model_a_actual][dimension].append(0.5)
                    model_scores[model_b_actual][dimension].append(0.5)
        
        # Calculate win rates
        performance_data = []
        for model, dimensions in model_scores.items():
            for dimension, scores in dimensions.items():
                if scores:
                    win_rate = np.mean(scores)
                    performance_data.append({
                        'model': model,
                        'dimension': dimension,
                        'win_rate': win_rate,
                        'num_evaluations': len(scores),
                        'std_error': np.std(scores) / np.sqrt(len(scores))
                    })
        
        return pd.DataFrame(performance_data)
    
    def calculate_inter_rater_reliability(self) -> Dict[str, float]:
        """
        Calculate inter-rater reliability using Fleiss' kappa.
        
        Returns:
            Dictionary with kappa values for each dimension
        """
        # Group results by comparison
        comparison_results = defaultdict(list)
        for result in self.results:
            comparison_results[result.comparison_id].append(result)
        
        # Calculate kappa for each dimension
        kappa_scores = {}
        
        for dimension in ['overall_quality', 'controllability', 'visual_quality', 'temporal_consistency']:
            # Build rating matrix
            rating_matrix = []
            
            for comp_id, results in comparison_results.items():
                if len(results) < 2:  # Need at least 2 raters
                    continue
                
                # Count votes for each option
                votes = {'A': 0, 'B': 0, 'Equal': 0}
                for result in results:
                    choice = result.dimension_scores.get(dimension, 'Equal')
                    votes[choice] += 1
                
                rating_matrix.append([votes['A'], votes['B'], votes['Equal']])
            
            if rating_matrix:
                # Calculate Fleiss' kappa
                rating_array = np.array(rating_matrix)
                n_raters = rating_array.sum(axis=1)[0]
                n_subjects = len(rating_array)
                n_categories = rating_array.shape[1]
                
                # Calculate observed agreement
                p_j = rating_array.sum(axis=0) / (n_raters * n_subjects)
                P_e_bar = (p_j ** 2).sum()
                
                # Calculate expected agreement
                P_i = []
                for i in range(n_subjects):
                    P_i.append(
                        (rating_array[i] ** 2).sum() - n_raters
                    ) / (n_raters * (n_raters - 1))
                P_bar = np.mean(P_i)
                
                # Calculate kappa
                if P_e_bar < 1:
                    kappa = (P_bar - P_e_bar) / (1 - P_e_bar)
                else:
                    kappa = 1.0
                
                kappa_scores[dimension] = kappa
        
        return kappa_scores
    
    def analyze_by_scenario(self) -> pd.DataFrame:
        """
        Analyze model performance by scenario/biome.
        
        Returns:
            DataFrame with scenario-specific performance
        """
        scenario_scores = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
        
        for result in self.results:
            comparison = self.comparisons.get(result.comparison_id)
            if not comparison:
                continue
            
            scenario = comparison.scenario_metadata.get('biome', 'unknown')
            model_a_actual = comparison.randomized_labels['A']
            model_b_actual = comparison.randomized_labels['B']
            
            for dimension, choice in result.dimension_scores.items():
                if choice == 'A':
                    scenario_scores[scenario][model_a_actual][dimension].append(1)
                    scenario_scores[scenario][model_b_actual][dimension].append(0)
                elif choice == 'B':
                    scenario_scores[scenario][model_a_actual][dimension].append(0)
                    scenario_scores[scenario][model_b_actual][dimension].append(1)
                else:
                    scenario_scores[scenario][model_a_actual][dimension].append(0.5)
                    scenario_scores[scenario][model_b_actual][dimension].append(0.5)
        
        # Aggregate results
        scenario_data = []
        for scenario, models in scenario_scores.items():
            for model, dimensions in models.items():
                for dimension, scores in dimensions.items():
                    if scores:
                        scenario_data.append({
                            'scenario': scenario,
                            'model': model,
                            'dimension': dimension,
                            'win_rate': np.mean(scores),
                            'num_evaluations': len(scores)
                        })
        
        return pd.DataFrame(scenario_data)
    
    def analyze_evaluation_quality(self) -> Dict[str, Any]:
        """
        Analyze the quality of evaluations (completion times, patterns, etc.)
        
        Returns:
            Dictionary with quality metrics
        """
        evaluator_stats = defaultdict(lambda: {
            'num_evaluations': 0,
            'avg_time': 0,
            'total_time': 0,
            'dimension_variance': defaultdict(int)
        })
        
        # Collect stats per evaluator
        for result in self.results:
            evaluator = result.evaluator_id
            evaluator_stats[evaluator]['num_evaluations'] += 1
            evaluator_stats[evaluator]['total_time'] += result.completion_time_seconds
            
            for dimension, choice in result.dimension_scores.items():
                evaluator_stats[evaluator]['dimension_variance'][choice] += 1
        
        # Calculate metrics
        quality_metrics = {
            'total_evaluations': len(self.results),
            'unique_evaluators': len(evaluator_stats),
            'avg_time_per_evaluation': np.mean([r.completion_time_seconds for r in self.results]),
            'median_time_per_evaluation': np.median([r.completion_time_seconds for r in self.results]),
            'evaluator_details': []
        }
        
        # Analyze each evaluator
        for evaluator, stats in evaluator_stats.items():
            stats['avg_time'] = stats['total_time'] / stats['num_evaluations']
            
            # Check for suspicious patterns
            choices = []
            for choice, count in stats['dimension_variance'].items():
                choices.extend([choice] * count)
            
            # Calculate entropy as measure of response diversity
            unique_choices = len(set(choices))
            entropy = -sum(
                (choices.count(c) / len(choices)) * np.log2(choices.count(c) / len(choices))
                for c in set(choices) if choices.count(c) > 0
            ) if unique_choices > 1 else 0
            
            quality_metrics['evaluator_details'].append({
                'evaluator_id': evaluator,
                'num_evaluations': stats['num_evaluations'],
                'avg_time': stats['avg_time'],
                'response_entropy': entropy,
                'unique_responses': unique_choices
            })
        
        return quality_metrics
    
    def generate_report(self, output_path: str) -> None:
        """
        Generate a comprehensive analysis report.
        
        Args:
            output_path: Path to save the report
        """
        # Create output directory
        os.makedirs(output_path, exist_ok=True)
        
        # 1. Model Performance Summary
        print("Calculating model performance...")
        performance_df = self.calculate_model_performance()
        performance_df.to_csv(os.path.join(output_path, 'model_performance.csv'), index=False)
        
        # 2. Inter-rater Reliability
        print("Calculating inter-rater reliability...")
        irr = self.calculate_inter_rater_reliability()
        with open(os.path.join(output_path, 'inter_rater_reliability.json'), 'w') as f:
            json.dump(irr, f, indent=2)
        
        # 3. Scenario Analysis
        print("Analyzing by scenario...")
        scenario_df = self.analyze_by_scenario()
        scenario_df.to_csv(os.path.join(output_path, 'scenario_analysis.csv'), index=False)
        
        # 4. Evaluation Quality
        print("Analyzing evaluation quality...")
        quality = self.analyze_evaluation_quality()
        with open(os.path.join(output_path, 'evaluation_quality.json'), 'w') as f:
            json.dump(quality, f, indent=2, default=str)
        
        # 5. Generate visualizations
        print("Generating visualizations...")
        self._generate_visualizations(performance_df, scenario_df, output_path)
        
        # 6. Generate summary report
        self._generate_summary_report(performance_df, irr, quality, output_path)
        
        print(f"Report generated at: {output_path}")
    
    def _generate_visualizations(
        self, 
        performance_df: pd.DataFrame, 
        scenario_df: pd.DataFrame,
        output_path: str
    ) -> None:
        """Generate visualization plots."""
        # Set style
        sns.set_style("whitegrid")
        plt.rcParams['figure.figsize'] = (10, 6)
        
        # 1. Overall model performance
        plt.figure()
        pivot_df = performance_df.pivot(index='dimension', columns='model', values='win_rate')
        pivot_df.plot(kind='bar')
        plt.title('Model Performance by Dimension')
        plt.ylabel('Win Rate')
        plt.xlabel('Evaluation Dimension')
        plt.xticks(rotation=45)
        plt.legend(title='Model')
        plt.tight_layout()
        plt.savefig(os.path.join(output_path, 'model_performance.png'))
        plt.close()
        
        # 2. Performance with error bars
        plt.figure()
        for model in performance_df['model'].unique():
            model_data = performance_df[performance_df['model'] == model]
            plt.errorbar(
                model_data['dimension'],
                model_data['win_rate'],
                yerr=model_data['std_error'],
                label=model,
                marker='o',
                capsize=5
            )
        plt.title('Model Performance with Standard Error')
        plt.ylabel('Win Rate')
        plt.xlabel('Dimension')
        plt.xticks(rotation=45)
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
        plt.savefig(os.path.join(output_path, 'model_performance_error.png'))
        plt.close()
        
        # 3. Scenario heatmap
        if not scenario_df.empty:
            plt.figure(figsize=(12, 8))
            
            # Aggregate by scenario and model
            scenario_pivot = scenario_df.groupby(['scenario', 'model'])['win_rate'].mean().reset_index()
            scenario_matrix = scenario_pivot.pivot(index='scenario', columns='model', values='win_rate')
            
            sns.heatmap(scenario_matrix, annot=True, fmt='.2f', cmap='RdYlGn', center=0.5)
            plt.title('Model Performance by Scenario')
            plt.tight_layout()
            plt.savefig(os.path.join(output_path, 'scenario_heatmap.png'))
            plt.close()
    
    def _generate_summary_report(
        self,
        performance_df: pd.DataFrame,
        irr: Dict[str, float],
        quality: Dict[str, Any],
        output_path: str
    ) -> None:
        """Generate a text summary report."""
        report_lines = [
            "# Matrix-Game Human Evaluation Report",
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            "## Summary Statistics",
            f"- Total Evaluations: {quality['total_evaluations']}",
            f"- Unique Evaluators: {quality['unique_evaluators']}",
            f"- Average Time per Evaluation: {quality['avg_time_per_evaluation']:.1f} seconds",
            "",
            "## Model Performance",
            ""
        ]
        
        # Aggregate model performance
        for model in performance_df['model'].unique():
            model_data = performance_df[performance_df['model'] == model]
            avg_win_rate = model_data['win_rate'].mean()
            report_lines.append(f"### {model}")
            report_lines.append(f"- Overall Win Rate: {avg_win_rate:.2%}")
            
            for _, row in model_data.iterrows():
                report_lines.append(
                    f"- {row['dimension']}: {row['win_rate']:.2%} "
                    f"(±{row['std_error']:.2%}, n={row['num_evaluations']})"
                )
            report_lines.append("")
        
        # Inter-rater reliability
        report_lines.extend([
            "## Inter-Rater Reliability (Fleiss' Kappa)",
            ""
        ])
        
        for dimension, kappa in irr.items():
            interpretation = self._interpret_kappa(kappa)
            report_lines.append(f"- {dimension}: {kappa:.3f} ({interpretation})")
        
        report_lines.extend([
            "",
            "## Evaluation Quality Indicators",
            ""
        ])
        
        # Flag potential issues
        fast_evaluations = [
            e for e in quality['evaluator_details'] 
            if e['avg_time'] < 30
        ]
        low_entropy = [
            e for e in quality['evaluator_details']
            if e['response_entropy'] < 0.5
        ]
        
        if fast_evaluations:
            report_lines.append(f"⚠️  {len(fast_evaluations)} evaluators with very fast average times (<30s)")
        
        if low_entropy:
            report_lines.append(f"⚠️  {len(low_entropy)} evaluators with low response diversity")
        
        # Write report
        report_path = os.path.join(output_path, 'summary_report.md')
        with open(report_path, 'w') as f:
            f.write('\n'.join(report_lines))
    
    def _interpret_kappa(self, kappa: float) -> str:
        """Interpret Fleiss' kappa value."""
        if kappa < 0:
            return "Poor agreement"
        elif kappa < 0.20:
            return "Slight agreement"
        elif kappa < 0.40:
            return "Fair agreement"
        elif kappa < 0.60:
            return "Moderate agreement"
        elif kappa < 0.80:
            return "Substantial agreement"
        else:
            return "Almost perfect agreement"