@echo off
setlocal

REM Deployment script for standalone services (Windows)
echo 🚀 Event Form Suite - Standalone Services Deployment
echo ==================================================

:menu
echo.
echo Choose deployment option:
echo 1) Install dependencies only
echo 2) Build Docker images
echo 3) Run services locally with Docker
echo 4) Full deployment (install + build + run)
echo 5) Show service status
echo.
set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" goto install_deps
if "%choice%"=="2" goto build_images
if "%choice%"=="3" goto run_services
if "%choice%"=="4" goto full_deploy
if "%choice%"=="5" goto show_status
echo ❌ Invalid choice. Please try again.
goto menu

:install_deps
echo Installing dependencies for all services...
call :install_service settimana-lafenice
call :install_service crociera-mediterraneo
echo 🎉 All dependencies installed!
goto end

:build_images
echo Building Docker images for all services...
call :build_docker settimana-lafenice
call :build_docker crociera-mediterraneo
echo 🎉 All Docker images built!
goto end

:run_services
echo Running services locally...
call :run_service settimana-lafenice 3001
call :run_service crociera-mediterraneo 3002
echo 🎉 All services are running!
echo 📋 Service URLs:
echo    • Settimana La Fenice: http://localhost:3001
echo    • Crociera Mediterraneo: http://localhost:3002
goto end

:full_deploy
echo Full deployment starting...
call :install_service settimana-lafenice
call :install_service crociera-mediterraneo
call :build_docker settimana-lafenice
call :build_docker crociera-mediterraneo
call :run_service settimana-lafenice 3001
call :run_service crociera-mediterraneo 3002
echo 🎉 Full deployment completed!
echo 📋 Service URLs:
echo    • Settimana La Fenice: http://localhost:3001
echo    • Crociera Mediterraneo: http://localhost:3002
goto end

:show_status
echo 📊 Service Status:
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | findstr "crociera"
goto end

REM Function to install dependencies for a service
:install_service
set service_name=%1
echo 📦 Installing dependencies for %service_name%...
cd %service_name%
npm install
if errorlevel 1 (
    echo ❌ Failed to install dependencies for %service_name%
    exit /b 1
)
echo ✅ Dependencies installed for %service_name%
cd ..
exit /b 0

REM Function to build Docker image for a service
:build_docker
set service_name=%1
echo 🐳 Building Docker image for %service_name%...
cd %service_name%
docker build -t %service_name% .
if errorlevel 1 (
    echo ❌ Failed to build Docker image for %service_name%
    exit /b 1
)
echo ✅ Docker image built for %service_name%
cd ..
exit /b 0

REM Function to run a service locally
:run_service
set service_name=%1
set port=%2
echo 🏃 Running %service_name% on port %port%...
docker run -d -p %port%:3000 --name %service_name%-container %service_name%
if errorlevel 1 (
    echo ❌ Failed to run %service_name%
    exit /b 1
)
echo ✅ %service_name% is running at http://localhost:%port%
exit /b 0

:end
echo.
echo ℹ️  For Render.com deployment, see RENDER_DEPLOYMENT_GUIDE.md
echo ℹ️  To stop services: docker stop settimana-lafenice-container crociera-mediterraneo-container
echo ℹ️  To remove containers: docker rm settimana-lafenice-container crociera-mediterraneo-container
pause
