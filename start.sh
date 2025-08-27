#!/bin/bash

echo "🚀 Starting MySecurity Scoping Engine..."
echo "📁 Working directory: $(pwd)"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the development server
echo "🔥 Starting NestJS development server..."
npm run start:dev
