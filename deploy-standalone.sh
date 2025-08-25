#!/bin/bash

# Deployment script for standalone services
echo "🚀 Event Form Suite - Standalone Services Deployment"
echo "=================================================="

# Function to install dependencies for a service
install_service() {
    local service_name=$1
    echo "📦 Installing dependencies for $service_name..."
    cd "$service_name"
    npm install
    if [ $? -eq 0 ]; then
        echo "✅ Dependencies installed for $service_name"
    else
        echo "❌ Failed to install dependencies for $service_name"
        exit 1
    fi
    cd ..
}

# Function to build Docker image for a service
build_docker() {
    local service_name=$1
    echo "🐳 Building Docker image for $service_name..."
    cd "$service_name"
    docker build -t "$service_name" .
    if [ $? -eq 0 ]; then
        echo "✅ Docker image built for $service_name"
    else
        echo "❌ Failed to build Docker image for $service_name"
        exit 1
    fi
    cd ..
}

# Function to run a service locally
run_service() {
    local service_name=$1
    local port=$2
    echo "🏃 Running $service_name on port $port..."
    docker run -d -p "$port:3000" --name "$service_name-container" "$service_name"
    if [ $? -eq 0 ]; then
        echo "✅ $service_name is running at http://localhost:$port"
    else
        echo "❌ Failed to run $service_name"
        exit 1
    fi
}

# Main deployment logic
echo "Choose deployment option:"
echo "1) Install dependencies only"
echo "2) Build Docker images"
echo "3) Run services locally with Docker"
echo "4) Full deployment (install + build + run)"
echo "5) Show service status"

read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        echo "Installing dependencies for all services..."
        install_service "crociera-fiordi"
        install_service "crociera-mediterraneo"
        echo "🎉 All dependencies installed!"
        ;;
    2)
        echo "Building Docker images for all services..."
        build_docker "crociera-fiordi"
        build_docker "crociera-mediterraneo"
        echo "🎉 All Docker images built!"
        ;;
    3)
        echo "Running services locally..."
        run_service "crociera-fiordi" "3001"
        run_service "crociera-mediterraneo" "3002"
        echo "🎉 All services are running!"
        echo "📋 Service URLs:"
        echo "   • Crociera Fiordi: http://localhost:3001"
        echo "   • Crociera Mediterraneo: http://localhost:3002"
        ;;
    4)
        echo "Full deployment starting..."
        install_service "crociera-fiordi"
        install_service "crociera-mediterraneo"
        build_docker "crociera-fiordi"
        build_docker "crociera-mediterraneo"
        run_service "crociera-fiordi" "3001"
        run_service "crociera-mediterraneo" "3002"
        echo "🎉 Full deployment completed!"
        echo "📋 Service URLs:"
        echo "   • Crociera Fiordi: http://localhost:3001"
        echo "   • Crociera Mediterraneo: http://localhost:3002"
        ;;
    5)
        echo "📊 Service Status:"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "crociera-(fiordi|mediterraneo)"
        ;;
    *)
        echo "❌ Invalid choice. Please run the script again."
        exit 1
        ;;
esac

echo ""
echo "ℹ️  For Render.com deployment, see RENDER_DEPLOYMENT_GUIDE.md"
echo "ℹ️  To stop services: docker stop crociera-fiordi-container crociera-mediterraneo-container"
echo "ℹ️  To remove containers: docker rm crociera-fiordi-container crociera-mediterraneo-container"
