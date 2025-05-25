"""
Statistical tests for Matrix-Game evaluation analysis.
"""

import numpy as np
import pandas as pd
from scipy import stats
from typing import Dict, List, Tuple, Optional
import statsmodels.api as sm
from statsmodels.stats.multitest import multipletests


class StatisticalTests:
    """Statistical tests for model comparison analysis."""
    
    @staticmethod
    def binomial_test(
        wins_a: int,
        wins_b: int,
        ties: int = 0,
        exclude_ties: bool = True
    ) -> Dict[str, float]:
        """
        Perform binomial test for pairwise model comparison.
        
        Args:
            wins_a: Number of times model A won
            wins_b: Number of times model B won
            ties: Number of ties
            exclude_ties: Whether to exclude ties from the test
            
        Returns:
            Dictionary with test results
        """
        if exclude_ties:
            n = wins_a + wins_b
            k = wins_a
        else:
            # Distribute ties equally
            n = wins_a + wins_b + ties
            k = wins_a + ties / 2
        
        if n == 0:
            return {
                'p_value': 1.0,
                'win_rate_a': 0.5,
                'ci_lower': 0.0,
                'ci_upper': 1.0,
                'significant': False
            }
        
        # Perform binomial test
        p_value = stats.binom_test(k, n, p=0.5, alternative='two-sided')
        
        # Calculate confidence interval
        win_rate = k / n
        ci = stats.binom.interval(0.95, n, win_rate)
        
        return {
            'p_value': p_value,
            'win_rate_a': win_rate,
            'ci_lower': ci[0] / n,
            'ci_upper': ci[1] / n,
            'significant': p_value < 0.05
        }
    
    @staticmethod
    def mcnemar_test(contingency_table: np.ndarray) -> Dict[str, float]:
        """
        Perform McNemar's test for paired comparisons.
        
        Args:
            contingency_table: 2x2 contingency table
                [[both_correct, a_correct_b_wrong],
                 [a_wrong_b_correct, both_wrong]]
                 
        Returns:
            Dictionary with test results
        """
        if contingency_table.shape != (2, 2):
            raise ValueError("Contingency table must be 2x2")
        
        # Extract values
        b = contingency_table[0, 1]  # A correct, B wrong
        c = contingency_table[1, 0]  # A wrong, B correct
        
        # McNemar's test
        if b + c == 0:
            return {
                'statistic': 0.0,
                'p_value': 1.0,
                'significant': False
            }
        
        # Use exact test for small samples
        if b + c < 25:
            p_value = stats.binom_test(b, b + c, p=0.5)
            statistic = (b - c) ** 2 / (b + c)
        else:
            # Use chi-square approximation with continuity correction
            statistic = (abs(b - c) - 1) ** 2 / (b + c)
            p_value = stats.chi2.sf(statistic, df=1)
        
        return {
            'statistic': statistic,
            'p_value': p_value,
            'significant': p_value < 0.05,
            'odds_ratio': b / c if c > 0 else np.inf
        }
    
    @staticmethod
    def bootstrap_confidence_interval(
        scores_a: List[float],
        scores_b: List[float],
        n_bootstrap: int = 10000,
        confidence_level: float = 0.95
    ) -> Dict[str, float]:
        """
        Calculate bootstrap confidence interval for difference in means.
        
        Args:
            scores_a: Scores for model A
            scores_b: Scores for model B
            n_bootstrap: Number of bootstrap samples
            confidence_level: Confidence level (default 0.95)
            
        Returns:
            Dictionary with bootstrap results
        """
        scores_a = np.array(scores_a)
        scores_b = np.array(scores_b)
        
        # Original difference
        original_diff = np.mean(scores_a) - np.mean(scores_b)
        
        # Bootstrap
        bootstrap_diffs = []
        n_a, n_b = len(scores_a), len(scores_b)
        
        for _ in range(n_bootstrap):
            # Resample with replacement
            sample_a = np.random.choice(scores_a, size=n_a, replace=True)
            sample_b = np.random.choice(scores_b, size=n_b, replace=True)
            
            bootstrap_diffs.append(np.mean(sample_a) - np.mean(sample_b))
        
        bootstrap_diffs = np.array(bootstrap_diffs)
        
        # Calculate confidence interval
        alpha = 1 - confidence_level
        ci_lower = np.percentile(bootstrap_diffs, alpha/2 * 100)
        ci_upper = np.percentile(bootstrap_diffs, (1 - alpha/2) * 100)
        
        # Calculate p-value (proportion of bootstrap samples with opposite sign)
        if original_diff > 0:
            p_value = 2 * np.mean(bootstrap_diffs <= 0)
        else:
            p_value = 2 * np.mean(bootstrap_diffs >= 0)
        
        return {
            'mean_diff': original_diff,
            'ci_lower': ci_lower,
            'ci_upper': ci_upper,
            'p_value': min(p_value, 1.0),
            'significant': 0 < ci_lower or ci_upper < 0
        }
    
    @staticmethod
    def bradley_terry_model(
        comparison_results: pd.DataFrame
    ) -> Dict[str, Dict[str, float]]:
        """
        Fit Bradley-Terry model for multiple model comparisons.
        
        Args:
            comparison_results: DataFrame with columns:
                - model_a: Name of first model
                - model_b: Name of second model
                - winner: 'a', 'b', or 'tie'
                - weight: Optional weight for the comparison
                
        Returns:
            Dictionary with model strengths and standard errors
        """
        # Get unique models
        models = sorted(set(
            comparison_results['model_a'].unique().tolist() +
            comparison_results['model_b'].unique().tolist()
        ))
        n_models = len(models)
        model_to_idx = {model: i for i, model in enumerate(models)}
        
        # Build design matrix
        comparisons = []
        outcomes = []
        weights = []
        
        for _, row in comparison_results.iterrows():
            if row['winner'] == 'tie':
                continue  # Skip ties
                
            idx_a = model_to_idx[row['model_a']]
            idx_b = model_to_idx[row['model_b']]
            
            # Create contrast vector
            contrast = np.zeros(n_models - 1)  # Use first model as reference
            if idx_a > 0:
                contrast[idx_a - 1] = 1
            if idx_b > 0:
                contrast[idx_b - 1] = -1
            
            comparisons.append(contrast)
            outcomes.append(1 if row['winner'] == 'a' else 0)
            weights.append(row.get('weight', 1.0))
        
        if not comparisons:
            return {model: {'strength': 0.0, 'se': np.inf} for model in models}
        
        # Fit logistic regression
        X = np.array(comparisons)
        y = np.array(outcomes)
        w = np.array(weights)
        
        try:
            model = sm.GLM(y, sm.add_constant(X), 
                         family=sm.families.Binomial(),
                         freq_weights=w)
            result = model.fit()
            
            # Extract coefficients
            strengths = np.zeros(n_models)
            strengths[1:] = result.params[1:]  # First model has strength 0 (reference)
            
            # Calculate standard errors
            se = np.zeros(n_models)
            se[1:] = result.bse[1:]
            
            # Convert to probabilities relative to average model
            avg_strength = np.mean(strengths)
            normalized_strengths = strengths - avg_strength
            
            results = {}
            for i, model_name in enumerate(models):
                results[model_name] = {
                    'strength': float(normalized_strengths[i]),
                    'se': float(se[i]),
                    'win_probability': float(1 / (1 + np.exp(-normalized_strengths[i])))
                }
                
            return results
            
        except Exception as e:
            # Fallback to simple win rate
            print(f"Bradley-Terry fitting failed: {e}")
            win_rates = {}
            for model in models:
                wins = sum(
                    (row['model_a'] == model and row['winner'] == 'a') or
                    (row['model_b'] == model and row['winner'] == 'b')
                    for _, row in comparison_results.iterrows()
                )
                total = sum(
                    row['model_a'] == model or row['model_b'] == model
                    for _, row in comparison_results.iterrows()
                )
                win_rates[model] = wins / max(total, 1)
            
            avg_rate = np.mean(list(win_rates.values()))
            return {
                model: {
                    'strength': np.log(rate / (1 - rate)) - np.log(avg_rate / (1 - avg_rate)),
                    'se': np.inf,
                    'win_probability': rate
                }
                for model, rate in win_rates.items()
            }
    
    @staticmethod
    def multiple_comparison_correction(
        p_values: Dict[str, float],
        method: str = 'bonferroni'
    ) -> Dict[str, Dict[str, float]]:
        """
        Apply multiple comparison correction.
        
        Args:
            p_values: Dictionary of test names to p-values
            method: Correction method ('bonferroni', 'holm', 'fdr_bh')
            
        Returns:
            Dictionary with corrected p-values and significance
        """
        test_names = list(p_values.keys())
        p_vals = [p_values[name] for name in test_names]
        
        # Apply correction
        rejected, corrected_p, alpha_sidak, alpha_bonf = multipletests(
            p_vals, method=method
        )
        
        results = {}
        for i, name in enumerate(test_names):
            results[name] = {
                'original_p': p_vals[i],
                'corrected_p': corrected_p[i],
                'significant': rejected[i],
                'method': method
            }
        
        return results