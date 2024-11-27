#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# ===========================
# Load Environment Variables
# ===========================
if [ -f .env ]; then
    # Export variables from .env, ignoring empty lines and comments
    export $(grep -v '^#' .env | xargs)
else
    echo ".env file not found! Please create a .env file with the necessary variables."
    exit 1
fi

# ===========================
# Configuration Variables
# ===========================

# API Base URL
BASE_URL=${BASE_URL:-http://localhost:5000}

# Test User Details
# Generate a unique email by appending a timestamp
UNIQUE_EMAIL="testuser+$(date +%s)@example.com"
TEST_PASSWORD=${TEST_PASSWORD:-Password123}
FIRST_NAME=${FIRST_NAME:-John}
LAST_NAME=${LAST_NAME:-Doe}
STATE=${STATE:-CA}
ZIPCODE=${ZIPCODE:-90001}

# Email Account Credentials for OTP Retrieval
EMAIL_ADDRESS=${EMAIL_ADDRESS}
EMAIL_PASSWORD=${EMAIL_PASSWORD}
IMAP_SERVER=${IMAP_SERVER}
IMAP_PORT=${IMAP_PORT:-993}

# Sender email to filter OTP emails
SENDER_EMAIL=${SENDER_EMAIL:-no-reply@yourdomain.com}

# ===========================
# Utility Functions
# ===========================

# Function to log responses
log_response() {
    local step="$1"
    local response="$2"
    echo "===== $step Response ====="
    echo "$response" | jq .
    echo "============================"
}

# Check if jq is installed
if ! command -v jq &> /dev/null
then
    echo "jq could not be found. Please install jq before running the script."
    echo "For NixOS: nix-env -iA nixpkgs.jq"
    exit 1
fi

# Check if curl is installed
if ! command -v curl &> /dev/null
then
    echo "curl could not be found. Please install curl before running the script."
    echo "For NixOS: nix-env -iA nixpkgs.curl"
    exit 1
fi

# Check if openssl is installed
if ! command -v openssl &> /dev/null
then
    echo "openssl could not be found. Please install openssl before running the script."
    echo "For NixOS: nix-env -iA nixpkgs.openssl"
    exit 1
fi

# Function to get the latest UID from the search results
get_latest_uid() {
    echo "$IMAP_RESPONSE" | grep -Eo 'UID [0-9]+' | awk '{print $2}' | sort -n | tail -n1
}

# Function to register user
register_user() {
    echo "=== Step 1: Registering a New User ==="
    
    # Send registration request
    REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/users/register" \
      -H "Content-Type: application/json" \
      -d "{
            \"email\": \"$UNIQUE_EMAIL\",
            \"password\": \"$TEST_PASSWORD\",
            \"first_name\": \"$FIRST_NAME\",
            \"last_name\": \"$LAST_NAME\",
            \"state\": \"$STATE\",
            \"zipcode\": \"$ZIPCODE\"
          }")
    
    log_response "Register User" "$REGISTER_RESPONSE"
    
    if echo "$REGISTER_RESPONSE" | grep -q "User registered successfully"; then
        echo "User registration successful. OTP sent to $UNIQUE_EMAIL."
    else
        echo "User registration failed: $(echo "$REGISTER_RESPONSE" | jq -r '.error')"
        exit 1
    fi
}

# Function to connect to IMAP and retrieve the latest OTP
retrieve_otp() {
    echo "=== Step 2: Retrieving OTP from Email ==="
    
    # Connect to IMAP server and login using openssl
    # Fetch emails from the sender and get the latest one
    IMAP_RESPONSE=$(openssl s_client -crlf -quiet -connect "$IMAP_SERVER:$IMAP_PORT" <<EOF
a LOGIN $EMAIL_ADDRESS $EMAIL_PASSWORD
a SELECT INBOX
a SEARCH FROM "$SENDER_EMAIL"
a FETCH \$(get_latest_uid) BODY[TEXT]
a LOGOUT
EOF
)
    
    # Debug: Print the IMAP response
    # Uncomment the next line for debugging purposes
    # echo "$IMAP_RESPONSE"
    
    # Extract the UID of the latest email
    LATEST_UID=$(get_latest_uid)
    
    if [ -z "$LATEST_UID" ]; then
        echo "No emails found from $SENDER_EMAIL."
        exit 1
    fi
    
    # Fetch the body of the latest email
    EMAIL_BODY=$(echo "$IMAP_RESPONSE" | sed -n "/UID $LATEST_UID/,/^a LOGOUT/p" | sed '1,4d' | sed '/^a LOGOUT/d')
    
    # Debug: Print the email body
    # Uncomment the next line for debugging purposes
    # echo "Email Body: $EMAIL_BODY"
    
    # Extract the OTP using regex (assuming it's a 6-digit number)
    OTP=$(echo "$EMAIL_BODY" | grep -oE '\b[0-9]{6}\b' | head -n1)
    
    if [ -z "$OTP" ]; then
        echo "Failed to extract OTP from the email."
        exit 1
    fi
    
    echo "OTP Retrieved: $OTP"
    export OTP
}

# Function to verify OTP
verify_otp() {
    echo "=== Step 3: Verifying OTP ==="
    VERIFY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/users/verify-otp" \
      -H "Content-Type: application/json" \
      -d "{
            \"email\": \"$UNIQUE_EMAIL\",
            \"otp\": \"$OTP\"
          }")
    
    log_response "Verify OTP" "$VERIFY_RESPONSE"
    
    if echo "$VERIFY_RESPONSE" | grep -q "Email verified successfully"; then
        echo "OTP verification successful."
        TOKEN=$(echo "$VERIFY_RESPONSE" | jq -r '.token')
    else
        echo "OTP verification failed: $(echo "$VERIFY_RESPONSE" | jq -r '.error')"
        exit 1
    fi
}

# Function to login user
login_user() {
    echo "=== Step 4: Logging in After Verification ==="
    LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/users/login" \
      -H "Content-Type: application/json" \
      -d "{
            \"email\": \"$UNIQUE_EMAIL\",
            \"password\": \"$TEST_PASSWORD\"
          }")
    
    log_response "Login User" "$LOGIN_RESPONSE"
    
    if echo "$LOGIN_RESPONSE" | grep -q "Login successful"; then
        echo "Login successful."
        LOGIN_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')
    else
        echo "Login failed: $(echo "$LOGIN_RESPONSE" | jq -r '.error')"
        exit 1
    fi
}

# Function to fetch user profile
fetch_profile() {
    echo "=== Step 5: Fetching User Profile ==="
    PROFILE_RESPONSE=$(curl -s -X GET "$BASE_URL/api/users/profile" \
      -H "Authorization: Bearer $LOGIN_TOKEN")
    
    log_response "Fetch User Profile" "$PROFILE_RESPONSE"
    
    if echo "$PROFILE_RESPONSE" | grep -q "profile"; then
        echo "User profile fetched successfully:"
        echo "$PROFILE_RESPONSE" | jq '.profile'
    else
        echo "Fetching profile failed: $(echo "$PROFILE_RESPONSE" | jq -r '.error')"
        exit 1
    fi
}

# Function to resend OTP (optional)
resend_otp() {
    echo "=== Step 6: Resending OTP ==="
    RESEND_RESPONSE=$(curl -s -X POST "$BASE_URL/api/users/resend-otp" \
      -H "Content-Type: application/json" \
      -d "{
            \"email\": \"$UNIQUE_EMAIL\"
          }")
    
    log_response "Resend OTP" "$RESEND_RESPONSE"
    
    if echo "$RESEND_RESPONSE" | grep -q "OTP has been resent"; then
        echo "OTP has been resent to $UNIQUE_EMAIL."
        echo "Retrieving the new OTP..."
        retrieve_otp
        echo "=== Step 7: Verifying Resent OTP ==="
        VERIFY_RESEND_RESPONSE=$(curl -s -X POST "$BASE_URL/api/users/verify-otp" \
          -H "Content-Type: application/json" \
          -d "{
                \"email\": \"$UNIQUE_EMAIL\",
                \"otp\": \"$OTP\"
              }")
        
        log_response "Verify Resent OTP" "$VERIFY_RESEND_RESPONSE"
        
        if echo "$VERIFY_RESEND_RESPONSE" | grep -q "Email verified successfully"; then
            echo "Resent OTP verification successful."
        else
            echo "Resent OTP verification failed: $(echo "$VERIFY_RESEND_RESPONSE" | jq -r '.error')"
            exit 1
        fi
    else
        echo "Resend OTP failed: $(echo "$RESEND_RESPONSE" | jq -r '.error')"
        exit 1
    fi
}

# ===========================
# Execute Test Workflow
# ===========================

# Register User
register_user

# Wait for the email to arrive (adjust the sleep duration as needed)
echo "Waiting for OTP email to arrive..."
sleep 10

# Retrieve OTP from Email
retrieve_otp

# Verify OTP
verify_otp

# Login User
login_user

# Fetch User Profile
fetch_profile

# Optional: Resend OTP
echo -n "Do you want to test resending the OTP? (y/n): "
read RESPOND

if [[ "$RESPOND" == "y" || "$RESPOND" == "Y" ]]; then
    resend_otp
else
    echo "Skipping OTP resend test."
fi

echo "=== Test Workflow Completed Successfully ==="
