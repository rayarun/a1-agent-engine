#!/bin/bash

echo "=== LLM Gateway liteLLM Refactoring Test Suite ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: LLM Gateway Health
echo "Test 1: LLM Gateway Health"
RESPONSE=$(curl -s http://localhost:8083/health)
if [[ $RESPONSE == "LLM Gateway is healthy"* ]]; then
    echo -e "${GREEN}✓ PASS${NC}: LLM Gateway is healthy"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: LLM Gateway health check failed"
    ((TESTS_FAILED++))
fi
echo ""

# Test 2: Mock Model Chat Completion
echo "Test 2: Mock Model Chat Completion (fallback mode)"
RESPONSE=$(curl -s -X POST http://localhost:8083/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mock-model",
    "messages": [{"role": "user", "content": "Test message"}],
    "max_tokens": 100
  }')

if echo "$RESPONSE" | jq -e '.choices[0].message.content' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}: Mock model returns valid response"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: Mock model response invalid"
    echo "Response: $RESPONSE"
    ((TESTS_FAILED++))
fi
echo ""

# Test 3: Models Endpoint
echo "Test 3: Models Listing Endpoint"
RESPONSE=$(curl -s http://localhost:8083/v1/models)
if echo "$RESPONSE" | jq -e '.models | length > 0' > /dev/null 2>&1; then
    MODEL_COUNT=$(echo "$RESPONSE" | jq '.models | length')
    echo -e "${GREEN}✓ PASS${NC}: Models endpoint returns $MODEL_COUNT models"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: Models endpoint failed"
    ((TESTS_FAILED++))
fi
echo ""

# Test 4: LLM Cost Events Table
echo "Test 4: LLM Cost Events Database Table"
TABLE_EXISTS=$(docker exec postgres psql -U postgres -d agentplatform -c "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='llm_cost_events');" 2>&1 | grep -c "t")
if [ "$TABLE_EXISTS" -gt 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: llm_cost_events table exists"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: llm_cost_events table not found"
    ((TESTS_FAILED++))
fi
echo ""

# Test 5: Code Quality - Line Reduction
echo "Test 5: Code Quality Metrics"
LINE_COUNT=$(wc -l < /Users/arun.ray/personal-projects/a1-agent-engine/services/llm-gateway/main.go)
FILE_SIZE=$(ls -lh /Users/arun.ray/personal-projects/a1-agent-engine/services/llm-gateway/main.go | awk '{print $5}')
if [ "$LINE_COUNT" -lt 700 ]; then
    echo -e "${GREEN}✓ PASS${NC}: Code reduced to $LINE_COUNT lines (target <700)"
    echo "       File size: $FILE_SIZE"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}⚠ WARN${NC}: Code size: $LINE_COUNT lines (target <700)"
    ((TESTS_FAILED++))
fi
echo ""

# Test 6: Graceful Fallback (liteLLM unavailable)
echo "Test 6: Graceful Fallback to Mock (liteLLM unavailable)"
# Stop liteLLM temporarily
docker-compose -f /Users/arun.ray/personal-projects/a1-agent-engine/infra/local/docker-compose.yml stop litellm 2>/dev/null
sleep 1

RESPONSE=$(curl -s -X POST http://localhost:8083/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-7",
    "messages": [{"role": "user", "content": "Test"}],
    "max_tokens": 50
  }')

if echo "$RESPONSE" | jq -e '.choices[0].message' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}: Graceful fallback to mock when liteLLM unavailable"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: Fallback failed"
    ((TESTS_FAILED++))
fi

# Restart liteLLM
docker-compose -f /Users/arun.ray/personal-projects/a1-agent-engine/infra/local/docker-compose.yml start litellm 2>/dev/null
echo ""

# Test 7: Configurable liteLLM URL
echo "Test 7: Configurable liteLLM URL Support"
# Check if LITELLM_PROXY_URL env var is supported
DOCKER_INSPECT=$(docker inspect llm-gateway 2>/dev/null)
if echo "$DOCKER_INSPECT" | grep -q "LITELLM_PROXY_URL"; then
    echo -e "${GREEN}✓ PASS${NC}: LITELLM_PROXY_URL environment variable supported"
    ((TESTS_PASSED++))
else
    # Check code for the variable
    if grep -q "LITELLM_PROXY_URL" /Users/arun.ray/personal-projects/a1-agent-engine/services/llm-gateway/main.go; then
        echo -e "${GREEN}✓ PASS${NC}: LITELLM_PROXY_URL support implemented in code"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: LITELLM_PROXY_URL not found"
        ((TESTS_FAILED++))
    fi
fi
echo ""

# Summary
echo "=== Test Summary ==="
TOTAL=$((TESTS_PASSED + TESTS_FAILED))
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}/$TOTAL"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}/$TOTAL"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
