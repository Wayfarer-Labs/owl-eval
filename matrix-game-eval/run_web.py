#!/usr/bin/env python
"""
Script to run the Matrix-Game evaluation web interface.
"""

import os
import sys
import argparse

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from web.app import app


def main():
    parser = argparse.ArgumentParser(description='Run Matrix-Game evaluation web interface')
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind to')
    parser.add_argument('--port', type=int, default=5000, help='Port to bind to')
    parser.add_argument('--debug', action='store_true', help='Run in debug mode')
    parser.add_argument('--config', default='configs/evaluation_config.yaml', 
                       help='Path to configuration file')
    
    args = parser.parse_args()
    
    # Set configuration path
    os.environ['EVAL_CONFIG_PATH'] = args.config
    
    print(f"Starting Matrix-Game evaluation web interface...")
    print(f"URL: http://{args.host}:{args.port}")
    print(f"Admin URL: http://{args.host}:{args.port}/admin")
    print("\nPress Ctrl+C to stop the server")
    
    # Run the application
    app.run(
        host=args.host,
        port=args.port,
        debug=args.debug
    )


if __name__ == '__main__':
    main()