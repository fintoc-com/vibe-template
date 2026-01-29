#!/bin/bash

echo "Setting up project..."

# Generate a random secret
SECRET=$(openssl rand -base64 32)

# Copy .env.example to .env
cp .env.example .env

# Set BETTER_AUTH_SECRET in .env
sed -i '' "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$SECRET|" .env

echo "Project setup complete"
