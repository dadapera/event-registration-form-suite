@echo off
REM Deploy script for Event Form Suite Microservices
REM This script builds and deploys the microservices architecture

echo =====================================
echo Event Form Suite - Microservices Deploy
echo =====================================

echo.
echo [1/5] Checking prerequisites...

REM Check if Docker is running
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Docker is not running or not installed.
    echo Please start Docker Desktop and try again.
    pause
    exit /b 1
)

REM Check if docker-compose exists
docker-compose --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: docker-compose is not installed or not available.
    echo Please install Docker Compose and try again.
    pause
    exit /b 1
)

echo Docker is running ✓
echo Docker Compose is available ✓

echo.
echo [2/5] Stopping existing containers...
docker-compose -f docker-compose.microservices.yml down

echo.
echo [3/5] Building microservice images...
docker-compose -f docker-compose.microservices.yml build --no-cache

echo.
echo [4/5] Starting microservices...
docker-compose -f docker-compose.microservices.yml up -d

echo.
echo [5/5] Checking service health...
timeout /t 10 /nobreak >nul

REM Check individual service health
echo Checking form-crociera-fiordi...
curl -f http://localhost:3000/crociera-fiordi/ >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   ✓ Crociera Fiordi service is healthy
) else (
    echo   ✗ Crociera Fiordi service is not responding
)

echo Checking form-crociera-mediterraneo...
curl -f http://localhost:3000/crociera-mediterraneo/ >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   ✓ Crociera Mediterraneo service is healthy
) else (
    echo   ✗ Crociera Mediterraneo service is not responding
)

echo Checking form-tour-capitali...
curl -f http://localhost:3000/tour-capitali/ >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   ✓ Tour Capitali service is healthy
) else (
    echo   ✗ Tour Capitali service is not responding
)

echo.
echo =====================================
echo Deployment Complete!
echo =====================================
echo.
echo Access your form instances at:
echo   Crociera Fiordi:      http://localhost:3000/crociera-fiordi/
echo   Crociera Mediterraneo: http://localhost:3000/crociera-mediterraneo/
echo   Tour Capitali:        http://localhost:3000/tour-capitali/
echo.
echo Admin panels:
echo   Crociera Fiordi:      http://localhost:3000/crociera-fiordi/admin
echo   Crociera Mediterraneo: http://localhost:3000/crociera-mediterraneo/admin
echo   Tour Capitali:        http://localhost:3000/tour-capitali/admin
echo.
echo To view logs: docker-compose -f docker-compose.microservices.yml logs -f
echo To stop:      docker-compose -f docker-compose.microservices.yml down
echo.
pause 