#!/bin/bash

# Event Form Suite - Docker Deployment Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="event-form-suite"
IMAGE_NAME="event-form-suite"
DEFAULT_PORT=3000

echo -e "${GREEN}🚀 Event Form Suite Docker Deployment${NC}"
echo "==========================================="

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed and running
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    print_status "Docker is installed and running ✓"
}

# Check if docker-compose is available
check_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    else
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    print_status "Docker Compose is available ✓"
}

# Create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    mkdir -p forms data
    print_status "Directories created ✓"
}

# Stop existing container if running
stop_existing() {
    if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
        print_warning "Stopping existing container..."
        docker stop $CONTAINER_NAME
        docker rm $CONTAINER_NAME
    fi
}

# Deploy with Docker Compose (recommended)
deploy_compose() {
    print_status "Deploying with Docker Compose..."
    
    # Check if .env file exists
    if [ ! -f ".env" ]; then
        print_warning ".env file not found. Creating from template..."
        cat > .env << EOF
PORT=3000
NODE_ENV=production
EOF
    fi
    
    # Build and start services
    $COMPOSE_CMD up -d --build
    
    # Wait for service to be ready
    print_status "Waiting for service to be ready..."
    sleep 10
    
    # Check if service is running
    if $COMPOSE_CMD ps | grep -q "Up"; then
        print_status "✅ Deployment successful!"
        print_status "Application is running at: http://localhost:$DEFAULT_PORT"
        print_status "Admin dashboard: http://localhost:$DEFAULT_PORT/admin"
    else
        print_error "❌ Deployment failed. Check logs with: $COMPOSE_CMD logs"
        exit 1
    fi
}

# Deploy with Docker only
deploy_docker() {
    print_status "Deploying with Docker..."
    
    # Build image
    print_status "Building Docker image..."
    docker build -t $IMAGE_NAME .
    
    # Stop existing container
    stop_existing
    
    # Run new container
    print_status "Starting new container..."
    docker run -d \
        --name $CONTAINER_NAME \
        -p $DEFAULT_PORT:3000 \
        -v "$(pwd)/forms:/app/forms" \
        -v "$(pwd)/data:/app/data" \
        -e NODE_ENV=production \
        --restart unless-stopped \
        $IMAGE_NAME
    
    # Wait for service to be ready
    print_status "Waiting for service to be ready..."
    sleep 10
    
    # Check if container is running
    if docker ps | grep -q $CONTAINER_NAME; then
        print_status "✅ Deployment successful!"
        print_status "Application is running at: http://localhost:$DEFAULT_PORT"
        print_status "Admin dashboard: http://localhost:$DEFAULT_PORT/admin"
    else
        print_error "❌ Deployment failed. Check logs with: docker logs $CONTAINER_NAME"
        exit 1
    fi
}

# Show usage
show_usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -h, --help          Show this help message"
    echo "  -c, --compose       Deploy using Docker Compose (default)"
    echo "  -d, --docker        Deploy using Docker only"
    echo "  --dev               Deploy in development mode"
    echo "  --stop              Stop running containers"
    echo "  --logs              Show container logs"
    echo "  --status            Show deployment status"
}

# Stop containers
stop_deployment() {
    print_status "Stopping deployment..."
    if command -v $COMPOSE_CMD &> /dev/null && [ -f "docker-compose.yml" ]; then
        $COMPOSE_CMD down
    else
        docker stop $CONTAINER_NAME 2>/dev/null || true
        docker rm $CONTAINER_NAME 2>/dev/null || true
    fi
    print_status "Deployment stopped ✓"
}

# Show logs
show_logs() {
    if command -v $COMPOSE_CMD &> /dev/null && [ -f "docker-compose.yml" ]; then
        $COMPOSE_CMD logs -f
    else
        docker logs -f $CONTAINER_NAME
    fi
}

# Show status
show_status() {
    print_status "Deployment Status:"
    echo "==================="
    
    if command -v $COMPOSE_CMD &> /dev/null && [ -f "docker-compose.yml" ]; then
        $COMPOSE_CMD ps
    else
        docker ps | grep $CONTAINER_NAME || echo "Container not running"
    fi
}

# Main execution
main() {
    case "${1:-}" in
        -h|--help)
            show_usage
            exit 0
            ;;
        --stop)
            check_docker
            check_docker_compose
            stop_deployment
            exit 0
            ;;
        --logs)
            show_logs
            exit 0
            ;;
        --status)
            show_status
            exit 0
            ;;
        --dev)
            check_docker
            check_docker_compose
            create_directories
            print_status "Deploying in development mode..."
            $COMPOSE_CMD -f docker-compose.yml -f docker-compose.dev.yml up -d --build
            print_status "Development environment started ✓"
            exit 0
            ;;
        -d|--docker)
            check_docker
            create_directories
            deploy_docker
            ;;
        -c|--compose|"")
            check_docker
            check_docker_compose
            create_directories
            deploy_compose
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@" 