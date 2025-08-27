#!/bin/bash

echo "Starting PAN KYC Verification System..."

# Check if PostgreSQL is running
echo "Checking PostgreSQL..."
if ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    echo "PostgreSQL is not running. Please start PostgreSQL first."
    exit 1
fi

# Check if Redis is running
echo "Checking Redis..."
if ! redis-cli ping > /dev/null 2>&1; then
    echo "Redis is not running. Please start Redis first."
    exit 1
fi

# Start backend
echo "Starting backend server..."
cd backend
npm install
npm run dev &
BACKEND_PID=$!

# Wait for backend to start
sleep 5

# Start frontend
echo "Starting frontend server..."
cd ../frontend
npm install
npm start &
FRONTEND_PID=$!

echo "PAN KYC System is starting..."
echo "Backend: http://localhost:3001"
echo "Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for user to stop
wait
