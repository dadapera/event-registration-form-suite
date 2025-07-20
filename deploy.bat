@echo off
setlocal enabledelayedexpansion

:: Event Form Suite - Windows Docker Deployment Script

echo.
echo ================================================================
echo 🚀 Event Form Suite Docker Deployment (Windows)
echo ================================================================
echo.

:: Configuration
set CONTAINER_NAME=event-form-suite
set IMAGE_NAME=event-form-suite
set DEFAULT_PORT=3000

:: Check if Docker is installed and running
echo [INFO] Checking Docker installation...
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed. Please install Docker Desktop first.
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)
echo [INFO] Docker is installed and running ✓

:: Check for Docker Compose
echo [INFO] Checking Docker Compose...
docker-compose --version >nul 2>&1
if errorlevel 1 (
    docker compose version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Docker Compose is not available.
        pause
        exit /b 1
    ) else (
        set COMPOSE_CMD=docker compose
    )
) else (
    set COMPOSE_CMD=docker-compose
)
echo [INFO] Docker Compose is available ✓

:: Create necessary directories
echo [INFO] Creating necessary directories...
if not exist "forms" mkdir forms
if not exist "data" mkdir data
echo [INFO] Directories created ✓

:: Handle command line arguments
if "%1"=="stop" goto stop_deployment
if "%1"=="logs" goto show_logs
if "%1"=="status" goto show_status
if "%1"=="dev" goto deploy_dev
if "%1"=="docker" goto deploy_docker_only
if "%1"=="help" goto show_usage
if "%1"=="-h" goto show_usage

:: Default: Deploy with Docker Compose
goto deploy_compose

:deploy_compose
echo [INFO] Deploying with Docker Compose...

:: Check if .env file exists
if not exist ".env" (
    echo [WARN] .env file not found. Creating from template...
    echo PORT=3000 > .env
    echo NODE_ENV=production >> .env
)

:: Build and start services
echo [INFO] Building and starting services...
%COMPOSE_CMD% up -d --build
if errorlevel 1 (
    echo [ERROR] Failed to start services. Check the logs.
    pause
    exit /b 1
)

:: Wait for service to be ready
echo [INFO] Waiting for service to be ready...
timeout /t 10 /nobreak >nul

:: Check if service is running
%COMPOSE_CMD% ps | find "Up" >nul
if errorlevel 1 (
    echo [ERROR] ❌ Deployment failed. Check logs with: %COMPOSE_CMD% logs
    pause
    exit /b 1
) else (
    echo [INFO] ✅ Deployment successful!
    echo [INFO] Application is running at: http://localhost:%DEFAULT_PORT%
    echo [INFO] Admin dashboard: http://localhost:%DEFAULT_PORT%/admin
)
goto end

:deploy_docker_only
echo [INFO] Deploying with Docker only...

:: Build image
echo [INFO] Building Docker image...
docker build -t %IMAGE_NAME% .
if errorlevel 1 (
    echo [ERROR] Failed to build image.
    pause
    exit /b 1
)

:: Stop existing container
echo [INFO] Stopping existing container if running...
docker stop %CONTAINER_NAME% >nul 2>&1
docker rm %CONTAINER_NAME% >nul 2>&1

:: Run new container
echo [INFO] Starting new container...
docker run -d ^
    --name %CONTAINER_NAME% ^
    -p %DEFAULT_PORT%:3000 ^
    -v "%cd%\forms:/app/forms" ^
    -v "%cd%\data:/app/data" ^
    -e NODE_ENV=production ^
    --restart unless-stopped ^
    %IMAGE_NAME%

if errorlevel 1 (
    echo [ERROR] Failed to start container.
    pause
    exit /b 1
)

:: Wait for service to be ready
echo [INFO] Waiting for service to be ready...
timeout /t 10 /nobreak >nul

:: Check if container is running
docker ps | find "%CONTAINER_NAME%" >nul
if errorlevel 1 (
    echo [ERROR] ❌ Deployment failed. Check logs with: docker logs %CONTAINER_NAME%
    pause
    exit /b 1
) else (
    echo [INFO] ✅ Deployment successful!
    echo [INFO] Application is running at: http://localhost:%DEFAULT_PORT%
    echo [INFO] Admin dashboard: http://localhost:%DEFAULT_PORT%/admin
)
goto end

:deploy_dev
echo [INFO] Deploying in development mode...
%COMPOSE_CMD% -f docker-compose.yml -f docker-compose.dev.yml up -d --build
if errorlevel 1 (
    echo [ERROR] Failed to start development environment.
    pause
    exit /b 1
)
echo [INFO] Development environment started ✓
echo [INFO] Application is running at: http://localhost:%DEFAULT_PORT%
goto end

:stop_deployment
echo [INFO] Stopping deployment...
if exist "docker-compose.yml" (
    %COMPOSE_CMD% down
) else (
    docker stop %CONTAINER_NAME% >nul 2>&1
    docker rm %CONTAINER_NAME% >nul 2>&1
)
echo [INFO] Deployment stopped ✓
goto end

:show_logs
if exist "docker-compose.yml" (
    %COMPOSE_CMD% logs -f
) else (
    docker logs -f %CONTAINER_NAME%
)
goto end

:show_status
echo [INFO] Deployment Status:
echo ===================
if exist "docker-compose.yml" (
    %COMPOSE_CMD% ps
) else (
    docker ps | find "%CONTAINER_NAME%" || echo Container not running
)
goto end

:show_usage
echo Usage: %0 [option]
echo.
echo Options:
echo   help        Show this help message
echo   stop        Stop running containers
echo   logs        Show container logs
echo   status      Show deployment status
echo   dev         Deploy in development mode
echo   docker      Deploy using Docker only (no compose)
echo   (no option) Deploy using Docker Compose (default)
echo.
goto end

:end
echo.
echo Press any key to exit...
pause >nul 