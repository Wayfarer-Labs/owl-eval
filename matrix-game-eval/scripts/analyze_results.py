#!/usr/bin/env python
"""
Script to analyze evaluation results and generate reports.
"""

import argparse
import os
import sys
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from evaluation.ab_testing import ABTestingFramework
from analysis.analyzer import EvaluationAnalyzer
from analysis.statistical_tests import StatisticalTests
import pandas as pd
import json


def main():
    parser = argparse.ArgumentParser(description='Analyze Matrix-Game evaluation results')
    parser.add_argument('--data-dir', '-d', required=True,
                       help='Directory containing evaluation data')
    parser.add_argument('--output-dir', '-o', 
                       default=f'./analysis_results_{datetime.now().strftime("%Y%m%d_%H%M%S")}',
                       help='Output directory for analysis results')
    parser.add_argument('--min-evaluations', type=int, default=3,
                       help='Minimum evaluations per comparison for inclusion')
    parser.add_argument('--statistical-tests', action='store_true',
                       help='Run additional statistical tests')
    
    args = parser.parse_args()
    
    print("Loading evaluation data...")
    framework = ABTestingFramework(output_dir=args.data_dir)
    analyzer = EvaluationAnalyzer(framework)
    
    # Check if we have enough data
    if not analyzer.results:
        print("No evaluation results found!")
        return
    
    print(f"Found {len(analyzer.results)} evaluations across {len(analyzer.comparisons)} comparisons")
    
    # Generate main report
    print("\nGenerating analysis report...")
    analyzer.generate_report(args.output_dir)
    
    # Run additional statistical tests if requested
    if args.statistical_tests:
        print("\nRunning statistical tests...")
        run_statistical_tests(analyzer, args.output_dir)
    
    print(f"\nAnalysis complete! Results saved to: {args.output_dir}")
    print("\nKey files generated:")
    print("  - summary_report.md: Overview of results")
    print("  - model_performance.csv: Detailed performance metrics")
    print("  - model_performance.png: Performance visualization")
    print("  - inter_rater_reliability.json: Agreement between evaluators")
    
    # Print quick summary
    performance_df = pd.read_csv(os.path.join(args.output_dir, 'model_performance.csv'))
    print("\nQuick Summary:")
    for model in performance_df['model'].unique():
        model_data = performance_df[performance_df['model'] == model]
        avg_win_rate = model_data['win_rate'].mean()
        print(f"  {model}: {avg_win_rate:.1%} average win rate")


def run_statistical_tests(analyzer: EvaluationAnalyzer, output_dir: str):
    """Run additional statistical tests on the results."""
    
    # Prepare data for statistical tests
    comparison_data = []
    
    for result in analyzer.results:
        comparison = analyzer.comparisons.get(result.comparison_id)
        if not comparison:
            continue
        
        for dimension, choice in result.dimension_scores.items():
            comparison_data.append({
                'comparison_id': result.comparison_id,
                'evaluator_id': result.evaluator_id,
                'dimension': dimension,
                'model_a': comparison.randomized_labels['A'],
                'model_b': comparison.randomized_labels['B'],
                'winner': 'a' if choice == 'A' else ('b' if choice == 'B' else 'tie')
            })
    
    comparison_df = pd.DataFrame(comparison_data)
    
    # 1. Pairwise binomial tests
    print("  - Running pairwise binomial tests...")
    binomial_results = {}
    
    for dimension in ['overall_quality', 'controllability', 'visual_quality', 'temporal_consistency']:
        dim_data = comparison_df[comparison_df['dimension'] == dimension]
        
        # Get unique model pairs
        model_pairs = set()
        for _, row in dim_data.iterrows():
            pair = tuple(sorted([row['model_a'], row['model_b']]))
            model_pairs.add(pair)
        
        for model_a, model_b in model_pairs:
            # Count wins
            pair_data = dim_data[
                ((dim_data['model_a'] == model_a) & (dim_data['model_b'] == model_b)) |
                ((dim_data['model_a'] == model_b) & (dim_data['model_b'] == model_a))
            ]
            
            wins_a = sum(
                (row['model_a'] == model_a and row['winner'] == 'a') or
                (row['model_b'] == model_a and row['winner'] == 'b')
                for _, row in pair_data.iterrows()
            )
            wins_b = sum(
                (row['model_a'] == model_b and row['winner'] == 'a') or
                (row['model_b'] == model_b and row['winner'] == 'b')
                for _, row in pair_data.iterrows()
            )
            ties = sum(row['winner'] == 'tie' for _, row in pair_data.iterrows())
            
            result = StatisticalTests.binomial_test(wins_a, wins_b, ties)
            binomial_results[f"{dimension}_{model_a}_vs_{model_b}"] = result
    
    # Save binomial test results
    with open(os.path.join(output_dir, 'binomial_tests.json'), 'w') as f:
        json.dump(binomial_results, f, indent=2)
    
    # 2. Bradley-Terry model
    print("  - Fitting Bradley-Terry models...")
    bt_results = {}
    
    for dimension in ['overall_quality', 'controllability', 'visual_quality', 'temporal_consistency']:
        dim_data = comparison_df[comparison_df['dimension'] == dimension]
        
        if len(dim_data) > 0:
            bt_result = StatisticalTests.bradley_terry_model(dim_data)
            bt_results[dimension] = bt_result
    
    with open(os.path.join(output_dir, 'bradley_terry_results.json'), 'w') as f:
        json.dump(bt_results, f, indent=2)
    
    # 3. Multiple comparison correction
    print("  - Applying multiple comparison correction...")
    
    # Extract p-values for correction
    p_values = {}
    for test_name, result in binomial_results.items():
        if isinstance(result, dict) and 'p_value' in result:
            p_values[test_name] = result['p_value']
    
    if p_values:
        corrected_results = StatisticalTests.multiple_comparison_correction(
            p_values, method='fdr_bh'
        )
        
        with open(os.path.join(output_dir, 'corrected_p_values.json'), 'w') as f:
            json.dump(corrected_results, f, indent=2)
    
    print("  - Statistical tests complete!")


if __name__ == '__main__':
    main()