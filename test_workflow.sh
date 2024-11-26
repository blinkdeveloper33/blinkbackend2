#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Function to print messages with colors
function echo_info {
  echo -e "\033[1;34m$1\033[0m"
}

function echo_success {
  echo -e "\033[1;32m$1\033[0m"
}

function echo_error {
  echo -e "\033[1;31m$1\033[0m"
}

# Variables
BASE_URL="http://localhost:5000"
EMAIL="testuser4@example.com" # Use a unique email to avoid conflicts
PASSWORD="Password1234"
FIRST_NAME="Pablo"
LAST_NAME="Neruda"
STATE="FL"
ZIPCODE="90001"
WEBHOOK_URL="https://your-webhook-url.com" # Replace with your actual webhook URL

# Step 1: Register User
echo_info "Registering User..."
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/users/register" \
  -H "Content-Type: application/json" \
  -d "{
        \"email\": \"$EMAIL\",
        \"password\": \"$PASSWORD\",
        \"first_name\": \"$FIRST_NAME\",
        \"last_name\": \"$LAST_NAME\",
        \"state\": \"$STATE\",
        \"zipcode\": \"$ZIPCODE\"
      }")

# Check if registration was successful
if echo "$REGISTER_RESPONSE" | jq -e '.token' > /dev/null; then
  TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.token')
  echo_success "User registered successfully. Token obtained."
else
  ERROR_MSG=$(echo "$REGISTER_RESPONSE" | jq -r '.error // .message')
  echo_error "Registration failed: $ERROR_MSG"
  exit 1
fi

# Step 2: Login User
echo_info "Logging in User..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/users/login" \
  -H "Content-Type: application/json" \
  -d "{
        \"email\": \"$EMAIL\",
        \"password\": \"$PASSWORD\"
      }")

if echo "$LOGIN_RESPONSE" | jq -e '.token' > /dev/null; then
  TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')
  echo_success "User logged in successfully. Token updated."
else
  ERROR_MSG=$(echo "$LOGIN_RESPONSE" | jq -r '.error // .message')
  echo_error "Login failed: $ERROR_MSG"
  exit 1
fi

# Step 3: Fetch User Profile
echo_info "Fetching User Profile..."
PROFILE_RESPONSE=$(curl -s -X GET "$BASE_URL/api/users/profile" \
  -H "Authorization: Bearer $TOKEN")

if echo "$PROFILE_RESPONSE" | jq -e '.profile.id' > /dev/null; then
  USER_ID=$(echo "$PROFILE_RESPONSE" | jq -r '.profile.id')
  echo_success "User ID obtained: $USER_ID"
else
  ERROR_MSG=$(echo "$PROFILE_RESPONSE" | jq -r '.error // .message')
  echo_error "Fetching profile failed: $ERROR_MSG"
  exit 1
fi

# Step 4: Generate Sandbox Public Token
echo_info "Generating Sandbox Public Token..."
SANDBOX_RESPONSE=$(curl -s -X POST "$BASE_URL/api/plaid/sandbox/public_token/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
        \"institution_id\": \"ins_109508\",
        \"initial_products\": [\"transactions\"],
        \"webhook\": \"$WEBHOOK_URL\"
      }")

if echo "$SANDBOX_RESPONSE" | jq -e '.public_token' > /dev/null; then
  PUBLIC_TOKEN=$(echo "$SANDBOX_RESPONSE" | jq -r '.public_token')
  echo_success "Public Token obtained: $PUBLIC_TOKEN"
else
  ERROR_MSG=$(echo "$SANDBOX_RESPONSE" | jq -r '.error // .message')
  echo_error "Generating public token failed: $ERROR_MSG"
  exit 1
fi

# Step 5: Exchange Public Token for Access Token
echo_info "Exchanging Public Token for Access Token..."
EXCHANGE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/plaid/exchange_public_token" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
        \"publicToken\": \"$PUBLIC_TOKEN\",
        \"userId\": \"$USER_ID\"
      }")

if echo "$EXCHANGE_RESPONSE" | jq -e '.success' > /dev/null && [ "$(echo "$EXCHANGE_RESPONSE" | jq -r '.success')" = "true" ]; then
  BANK_ACCOUNT_ID=$(echo "$EXCHANGE_RESPONSE" | jq -r '.accounts[0].id') # UUID from bank_accounts table
  echo_success "Access Token exchanged successfully. Bank Account ID: $BANK_ACCOUNT_ID"
else
  ERROR_MSG=$(echo "$EXCHANGE_RESPONSE" | jq -r '.error // .message')
  echo_error "Exchanging public token failed: $ERROR_MSG"
  exit 1
fi

# Step 6: Synchronize Transactions
echo_info "Synchronizing Transactions..."
SYNC_RESPONSE=$(curl -s -X POST "$BASE_URL/api/plaid/sync" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
        \"userId\": \"$USER_ID\"
      }")

# Check if synchronization was successful
if echo "$SYNC_RESPONSE" | jq -e '.success' > /dev/null && [ "$(echo "$SYNC_RESPONSE" | jq -r '.success')" = "true" ]; then
  ADDED=$(echo "$SYNC_RESPONSE" | jq -r '.stats.added')
  MODIFIED=$(echo "$SYNC_RESPONSE" | jq -r '.stats.modified')
  REMOVED=$(echo "$SYNC_RESPONSE" | jq -r '.stats.removed')
  echo_success "Transactions synchronized successfully. Added: $ADDED, Modified: $MODIFIED, Removed: $REMOVED"
else
  # Capture detailed error message
  ERROR_MSG=$(echo "$SYNC_RESPONSE" | jq -r '.error // .message // "Unknown error"')
  DETAILS=$(echo "$SYNC_RESPONSE" | jq -r '.details // empty')
  echo_error "Synchronizing transactions failed: $ERROR_MSG"
  
  # Optionally, display additional details if available
  if [ "$DETAILS" != "null" ] && [ -n "$DETAILS" ]; then
    echo_error "Details: $DETAILS"
  fi
  
  exit 1
fi

# Step 7: Retrieve Transactions
echo_info "Retrieving Transactions..."
TRANSACTIONS_RESPONSE=$(curl -s -X POST "$BASE_URL/api/plaid/get_transactions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
        \"userId\": \"$USER_ID\",
        \"bankAccountId\": \"$BANK_ACCOUNT_ID\",
        \"startDate\": \"2023-01-01\",
        \"endDate\": \"2023-12-31\",
        \"page\": 1,
        \"limit\": 50
      }")

# Check if transactions were retrieved successfully
if echo "$TRANSACTIONS_RESPONSE" | jq -e '.transactions' > /dev/null; then
  TOTAL_TRANSACTIONS=$(echo "$TRANSACTIONS_RESPONSE" | jq '.transactions | length')
  echo_success "Retrieved $TOTAL_TRANSACTIONS transactions."
  
  # Optionally, print transactions
  echo "$TRANSACTIONS_RESPONSE" | jq '.transactions[] | {id, amount, date, description}'
else
  # Capture detailed error message
  ERROR_MSG=$(echo "$TRANSACTIONS_RESPONSE" | jq -r '.error // .message // "Unknown error"')
  echo_error "Retrieving transactions failed: $ERROR_MSG"
  exit 1
fi

echo_info "API Test Workflow Completed Successfully!"
