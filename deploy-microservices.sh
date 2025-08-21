#!/bin/bash

# Deploy script for Event Form Suite Microservices
# This script builds and deploys the microservices architecture

set -e  # Exit on any error

echo "====================================="
echo "Event Form Suite - Microservices Deploy"
echo "====================================="

echo
echo "[1/5] Checking prerequisites..."

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker is not running or not installed."
    echo "Please start Docker and try again."
    exit 1
fi

# Check if docker-compose exists
if ! command -v docker-compose >/dev/null 2>&1; then
    echo "ERROR: docker-compose is not installed or not available."
    echo "Please install Docker Compose and try again."
    exit 1
fi

echo "Docker is running ✓"
echo "Docker Compose is available ✓"

echo
echo "[2/5] Stopping existing containers..."
docker-compose -f docker-compose.microservices.yml down

echo
echo "[3/5] Building microservice images..."
docker-compose -f docker-compose.microservices.yml build --no-cache

echo
echo "[4/5] Starting microservices..."
docker-compose -f docker-compose.microservices.yml up -d

echo
echo "[5/5] Checking service health..."
sleep 10

# Function to check service health
check_service() {
    local service_name=$1
    local service_url=$2
    
    echo "Checking $service_name..."
    if curl -f "$service_url" >/dev/null 2>&1; then
        echo "  ✓ $service_name service is healthy"
        return 0
    else
        echo "  ✗ $service_name service is not responding"
        return 1
    fi
}

# Check individual service health
check_service "Crociera Fiordi" "http://localhost:3000/crociera-fiordi/"
check_service "Crociera Mediterraneo" "http://localhost:3000/crociera-mediterraneo/"
check_service "Tour Capitali" "http://localhost:3000/tour-capitali/"

echo
echo "====================================="
echo "Deployment Complete!"
echo "====================================="
echo
echo "Access your form instances at:"
echo "  Crociera Fiordi:       http://localhost:3000/crociera-fiordi/"
echo "  Crociera Mediterraneo:  http://localhost:3000/crociera-mediterraneo/"
echo "  Tour Capitali:         http://localhost:3000/tour-capitali/"
echo
echo "Admin panels:"
echo "  Crociera Fiordi:       http://localhost:3000/crociera-fiordi/admin"
echo "  Crociera Mediterraneo:  http://localhost:3000/crociera-mediterraneo/admin"
echo "  Tour Capitali:         http://localhost:3000/tour-capitali/admin"
echo
echo "Useful commands:"
echo "  View logs: docker-compose -f docker-compose.microservices.yml logs -f"
echo "  Stop:      docker-compose -f docker-compose.microservices.yml down"
echo "  Restart:   docker-compose -f docker-compose.microservices.yml restart"
echo 