#!/bin/bash

# Elizian Backend Environment Setup Script

echo "🔧 Setting up Elizian Backend Environment..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env file created!"
else
    echo "⚠️  .env file already exists. Skipping creation."
fi

# Generate JWT secret if needed
echo "🔐 Checking JWT secret..."
if grep -q "your-super-secret-jwt-key-change-in-production" .env; then
    echo "⚠️  Default JWT secret detected. Generating new one..."
    NEW_SECRET=$(node generate-jwt-secret.js | grep "Base64 encoded secret" -A 1 | tail -n 1)
    sed -i.bak "s/JWT_SECRET=.*/JWT_SECRET=$NEW_SECRET/" .env
    echo "✅ New JWT secret generated and set!"
else
    echo "✅ JWT secret already configured."
fi

# Set NODE_ENV to development if not set
if ! grep -q "NODE_ENV=" .env; then
    echo "📝 Setting NODE_ENV=development..."
    echo "NODE_ENV=development" >> .env
    echo "✅ NODE_ENV set to development!"
else
    echo "✅ NODE_ENV already configured."
fi

echo ""
echo "🎉 Environment setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env file with your database credentials"
echo "2. Run: npm start"
echo ""
echo "🔍 Current configuration:"
echo "NODE_ENV: $(grep NODE_ENV .env | cut -d'=' -f2)"
echo "LOG_OTP: $(grep LOG_OTP .env | cut -d'=' -f2 || echo 'true (default)')"
