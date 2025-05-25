from setuptools import setup, find_packages

with open("requirements.txt") as f:
    requirements = f.read().splitlines()
    requirements = [r for r in requirements if r and not r.startswith("#")]

setup(
    name="matrix-game-eval",
    version="0.1.0",
    description="Human evaluation harness for Matrix-Game diffusion world models",
    author="OWL Team",
    packages=find_packages(),
    install_requires=requirements,
    python_requires=">=3.8",
    entry_points={
        "console_scripts": [
            "matrix-eval=scripts.cli:main",
        ],
    },
)