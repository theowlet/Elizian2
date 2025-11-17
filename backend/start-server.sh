#!/bin/bash

# ============================================
# ELIZIAN BACKEND PROCESS MANAGER
# Auto-restart script for development
# ============================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="/Users/nishantverma/Documents/KIWITY/technical documents/ElizianAppExpo/backend"
MAX_RESTARTS=10
RESTART_DELAY=2

# Environment variables
export PORT=5001
export NODE_ENV=development
export LOG_OTP=true
export DB_USER=postgres
export DB_HOST=localhost
export DB_NAME=elizian
export DB_PASSWORD=postgres
export DB_PORT=5432
export JWT_SECRET=abcdefghijklmnopqrstuvwxyz123456

# Counters
restart_count=0
start_time=$(date +%s)

echo -e "${BLUE}🚀 Starting Elizian Backend Process Manager${NC}"
echo -e "${BLUE}📁 Working Directory: ${BACKEND_DIR}${NC}"
echo -e "${BLUE}🔄 Max Restarts: ${MAX_RESTARTS}${NC}"
echo -e "${BLUE}⏱️  Restart Delay: ${RESTART_DELAY}s${NC}"
echo ""

# Function to start the server
start_server() {
    echo -e "${GREEN}🔄 Starting backend server (Attempt $((restart_count + 1)))${NC}"
    echo -e "${YELLOW}⏰ $(date)${NC}"
    
    cd "$BACKEND_DIR" || exit 1
    
    # Start the server
    node server.js &
    SERVER_PID=$!
    
    echo -e "${GREEN}✅ Server started with PID: ${SERVER_PID}${NC}"
    
    # Wait for the process to finish
    wait $SERVER_PID
    EXIT_CODE=$?
    
    echo -e "${RED}❌ Server exited with code: ${EXIT_CODE}${NC}"
    echo -e "${YELLOW}⏰ $(date)${NC}"
    
    return $EXIT_CODE
}

# Function to check if port is available
check_port() {
    if lsof -Pi :5001 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${YELLOW}⚠️  Port 5001 is already in use${NC}"
        echo -e "${YELLOW}🔍 Killing existing processes on port 5001...${NC}"
        lsof -ti:5001 | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
}

# Main loop
while [ $restart_count -lt $MAX_RESTARTS ]; do
    check_port
    start_server
    
    restart_count=$((restart_count + 1))
    
    if [ $restart_count -lt $MAX_RESTARTS ]; then
        echo -e "${YELLOW}⏳ Waiting ${RESTART_DELAY} seconds before restart...${NC}"
        sleep $RESTART_DELAY
        echo ""
    fi
done

echo -e "${RED}💀 Maximum restart attempts (${MAX_RESTARTS}) reached${NC}"
echo -e "${RED}🛑 Process manager shutting down${NC}"

# Calculate uptime
end_time=$(date +%s)
uptime=$((end_time - start_time))
echo -e "${BLUE}📊 Total uptime: ${uptime} seconds${NC}"
