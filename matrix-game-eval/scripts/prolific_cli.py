#!/usr/bin/env python
"""
CLI for managing Prolific studies.
"""

import click
import os
import sys
import json
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from prolific.client import ProlificClient
from prolific.integration import ProlificIntegration
from evaluation.ab_testing import ABTestingFramework


@click.group()
def cli():
    """Prolific study management CLI"""
    pass


@cli.command()
@click.option('--name', '-n', required=True, help='Study name')
@click.option('--participants', '-p', type=int, default=50, help='Number of participants')
@click.option('--comparisons-per-participant', '-c', type=int, default=5, 
              help='Comparisons per participant')
@click.option('--data-dir', '-d', default='./data/prolific_study',
              help='Directory with pre-generated comparisons')
def create_study(name, participants, comparisons_per_participant, data_dir):
    """Create a new Prolific study."""
    
    # Check for API token
    if not os.environ.get('PROLIFIC_API_TOKEN'):
        click.echo("Error: PROLIFIC_API_TOKEN environment variable not set")
        return
    
    # Initialize clients
    prolific_client = ProlificClient()
    framework = ABTestingFramework(output_dir=data_dir)
    base_url = os.environ.get('BASE_URL', 'http://localhost:5000')
    
    integration = ProlificIntegration(prolific_client, framework, base_url)
    
    click.echo(f"Creating Prolific study: {name}")
    click.echo(f"  Participants: {participants}")
    click.echo(f"  Comparisons per participant: {comparisons_per_participant}")
    
    # Create the study
    try:
        result = integration.create_study_with_comparisons(
            study_name=name,
            num_participants=participants,
            comparisons_per_participant=comparisons_per_participant,
            total_comparisons=participants * comparisons_per_participant // 5  # Assume 5 evals per comparison
        )
        
        click.echo(f"\nStudy created successfully!")
        click.echo(f"  Study ID: {result['study']['id']}")
        click.echo(f"  Status: {result['study']['status']}")
        click.echo(f"  Total comparisons: {result['comparisons']}")
        click.echo(f"  Metadata saved to: {result['metadata_path']}")
        
        click.echo(f"\nTo publish the study, run:")
        click.echo(f"  python -m scripts.prolific_cli publish --study-id {result['study']['id']}")
        
    except Exception as e:
        click.echo(f"Error creating study: {e}", err=True)


@cli.command()
@click.option('--study-id', '-s', required=True, help='Prolific study ID')
def publish(study_id):
    """Publish a draft study."""
    
    if not os.environ.get('PROLIFIC_API_TOKEN'):
        click.echo("Error: PROLIFIC_API_TOKEN environment variable not set")
        return
    
    client = ProlificClient()
    
    try:
        result = client.publish_study(study_id)
        click.echo(f"Study {study_id} published successfully!")
        click.echo(f"Status: {result['status']}")
    except Exception as e:
        click.echo(f"Error publishing study: {e}", err=True)


@cli.command()
@click.option('--study-id', '-s', required=True, help='Prolific study ID')
def status(study_id):
    """Check study status and submissions."""
    
    if not os.environ.get('PROLIFIC_API_TOKEN'):
        click.echo("Error: PROLIFIC_API_TOKEN environment variable not set")
        return
    
    client = ProlificClient()
    
    try:
        # Get study info
        study = client.get_study(study_id)
        click.echo(f"Study: {study['name']}")
        click.echo(f"Status: {study['status']}")
        click.echo(f"Total places: {study['total_available_places']}")
        
        # Get submissions
        submissions = client.get_submissions(study_id)
        
        # Count by status
        status_counts = {}
        for sub in submissions:
            status = sub['status']
            status_counts[status] = status_counts.get(status, 0) + 1
        
        click.echo(f"\nSubmissions:")
        for status, count in status_counts.items():
            click.echo(f"  {status}: {count}")
        
        click.echo(f"\nTotal submissions: {len(submissions)}")
        
    except Exception as e:
        click.echo(f"Error getting study status: {e}", err=True)


@cli.command()
@click.option('--study-id', '-s', required=True, help='Prolific study ID')
@click.option('--data-dir', '-d', required=True, help='Evaluation data directory')
@click.option('--dry-run', is_flag=True, help='Show what would be done without approving')
def sync_results(study_id, data_dir, dry_run):
    """Sync evaluation results with Prolific and approve/reject submissions."""
    
    if not os.environ.get('PROLIFIC_API_TOKEN'):
        click.echo("Error: PROLIFIC_API_TOKEN environment variable not set")
        return
    
    # Initialize
    prolific_client = ProlificClient()
    framework = ABTestingFramework(output_dir=data_dir)
    base_url = os.environ.get('BASE_URL', 'http://localhost:5000')
    
    integration = ProlificIntegration(prolific_client, framework, base_url)
    
    click.echo(f"Syncing results for study {study_id}")
    
    if dry_run:
        click.echo("DRY RUN MODE - No changes will be made")
        
        # Get submissions
        submissions = prolific_client.get_submissions(study_id)
        
        for sub in submissions:
            if sub['status'] == 'AWAITING_REVIEW':
                pid = sub['participant_id']
                validation = integration.validate_participant_completion(pid, study_id)
                
                click.echo(f"\nParticipant {pid}:")
                click.echo(f"  Completed: {validation['total_completed']}/{validation['total_assigned']}")
                click.echo(f"  Quality score: {validation['quality_score']:.2f}")
                click.echo(f"  Average time: {validation['average_time']:.1f}s")
                
                if validation['quality_flags']:
                    click.echo(f"  Flags: {', '.join(validation['quality_flags'])}")
                
                action = "APPROVE" if validation['quality_score'] >= 0.8 else "REJECT"
                click.echo(f"  Would: {action}")
    else:
        # Actually sync
        integration.sync_study_results(study_id)
        click.echo("Sync complete!")


@cli.command()
@click.option('--study-id', '-s', required=True, help='Prolific study ID')
@click.option('--output', '-o', help='Output file path')
def export(study_id, output):
    """Export study data."""
    
    if not os.environ.get('PROLIFIC_API_TOKEN'):
        click.echo("Error: PROLIFIC_API_TOKEN environment variable not set")
        return
    
    client = ProlificClient()
    manager = ProlificStudyManager(client, "")
    
    if not output:
        output = f"prolific_export_{study_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    
    try:
        manager.export_study_data(study_id, output)
        click.echo(f"Study data exported to: {output}")
    except Exception as e:
        click.echo(f"Error exporting data: {e}", err=True)


def main():
    cli()


if __name__ == '__main__':
    main()