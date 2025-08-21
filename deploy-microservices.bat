@echo off
REM Deploy script for Event Form Suite Microservices
REM This script builds and deploys the microservices architecture

echo =====================================
echo Event Form Suite - Microservices Deploy
echo =====================================

echo.
echo [1/6] Checking prerequisites...

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
echo [2/6] Setting up PostgreSQL environment...

REM Check if .env file exists, if not create from template
if not exist ".env" (
    echo Creating .env file from template...
    if exist "config\production.env.template" (
        copy "config\production.env.template" ".env" >nul
        echo ✓ .env file created from template
        echo ⚠️  Please review and update .env file with your actual SMTP settings
    ) else (
        echo ⚠️  Template file not found. Creating basic .env...
        (
            echo DATABASE_URL=postgresql://event_form_db_9l7w_user:Rce3dgqN8ODeNS9ej7J4BVboQjuMuhnv@dpg-d2ji79re5dus73954560-a/event_form_db_9l7w
            echo NODE_ENV=production
            echo ADMIN_PASSWORD=admin123
            echo CALCULATION_DATE=2025-07-12
        ) > .env
        echo ✓ Basic .env file created
    )
) else (
    echo ✓ .env file already exists
)

REM Verify DATABASE_URL is set
findstr /B "DATABASE_URL=" .env >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ⚠️  Adding DATABASE_URL to .env file...
    echo DATABASE_URL=postgresql://event_form_db_9l7w_user:Rce3dgqN8ODeNS9ej7J4BVboQjuMuhnv@dpg-d2ji79re5dus73954560-a/event_form_db_9l7w >> .env
) else (
    echo ✓ DATABASE_URL configured
)

echo.
echo [3/6] Stopping existing containers...
docker-compose -f docker-compose.microservices.yml down

echo.
echo [4/6] Building microservice images...
docker-compose -f docker-compose.microservices.yml build --no-cache

echo.
echo [5/6] Starting microservices...
docker-compose -f docker-compose.microservices.yml up -d

echo.
echo [6/6] Checking service health...
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