#!/bin/bash

echo "Testing Next.js build..."
echo "========================"

# Change to frontend directory
cd "$(dirname "$0")"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Run type check
echo -e "\n1. Running TypeScript type check..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
    echo "❌ TypeScript type check failed"
    exit 1
else
    echo "✅ TypeScript type check passed"
fi

# Run linter
echo -e "\n2. Running ESLint..."
npm run lint
if [ $? -ne 0 ]; then
    echo "❌ ESLint check failed"
    exit 1
else
    echo "✅ ESLint check passed"
fi

# Run build
echo -e "\n3. Running Next.js build..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Next.js build failed"
    exit 1
else
    echo "✅ Next.js build succeeded"
fi

echo -e "\n✅ All checks passed! The application is ready to build."