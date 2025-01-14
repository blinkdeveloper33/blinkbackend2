curl -X POST http://localhost:5001/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alejandro@blinkfinances.com",
    "password": "Valeria@190400"
  }'


{"success":true,"message":"Login successful.","token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjcwNDcyNSwiZXhwIjoxNzM2NzA4MzI1fQ.iP2eWHeRuJpxS40R-PkwswhzWSvJRFBooy5brN7-1Wo","userId":"ed4880ac-7aaf-4493-9cda-8e8a0f100394"}%                                                             
alejandro@Valerias-MacBook-Air blinkbackend2 % 



curl -X GET "http://localhost:5001/api/blink-advances/user/ed4880ac-7aaf-4493-9cda-8e8a0f100394" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjcwNDcyNSwiZXhwIjoxNzM2NzA4MzI1fQ.iP2eWHeRuJpxS40R-PkwswhzWSvJRFBooy5brN7-1Wo","userId":"ed4880ac-7aaf-4493-9cda-8e8a0f100394" \
-H "Content-Type: application/json"








# Cash Flow Trends Analysis


curl -X GET "http://localhost:5001/api/cash-flow/trends?timeFrame=LAST_WEEK" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjY5ODYxOSwiZXhwIjoxNzM2NzAyMjE5fQ.TNdTHNsnXJXpvZ8zuRm_RkXQsDggtuqkWOtfjsi5ZNw" \
-H "Content-Type: application/json"

curl -X GET "http://localhost:5001/api/cash-flow/trends?timeFrame=LAST_MONTH" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjY5ODYxOSwiZXhwIjoxNzM2NzAyMjE5fQ.TNdTHNsnXJXpvZ8zuRm_RkXQsDggtuqkWOtfjsi5ZNw" \
-H "Content-Type: application/json"

curl -X GET "http://localhost:5001/api/cash-flow/trends?timeFrame=LAST_QUARTER" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjY5ODYxOSwiZXhwIjoxNzM2NzAyMjE5fQ.TNdTHNsnXJXpvZ8zuRm_RkXQsDggtuqkWOtfjsi5ZNw" \
-H "Content-Type: application/json"

curl -X GET "http://localhost:5001/api/cash-flow/trends?timeFrame=LAST_YEAR" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjY5ODYxOSwiZXhwIjoxNzM2NzAyMjE5fQ.TNdTHNsnXJXpvZ8zuRm_RkXQsDggtuqkWOtfjsi5ZNw" \
-H "Content-Type: application/json"

# Financial Health Score

## Last Week
```bash
curl -X GET "http://localhost:5001/api/cash-flow/health-score?timeFrame=LAST_WEEK" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjY5ODYxOSwiZXhwIjoxNzM2NzAyMjE5fQ.TNdTHNsnXJXpvZ8zuRm_RkXQsDggtuqkWOtfjsi5ZNw" \
-H "Content-Type: application/json"
```

## Last Month
```bash
curl -X GET "http://localhost:5001/api/cash-flow/health-score?timeFrame=LAST_MONTH" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjY5ODYxOSwiZXhwIjoxNzM2NzAyMjE5fQ.TNdTHNsnXJXpvZ8zuRm_RkXQsDggtuqkWOtfjsi5ZNw" \
-H "Content-Type: application/json"
```

## Last Quarter
```bash
curl -X GET "http://localhost:5001/api/cash-flow/health-score?timeFrame=LAST_QUARTER" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjY5ODYxOSwiZXhwIjoxNzM2NzAyMjE5fQ.TNdTHNsnXJXpvZ8zuRm_RkXQsDggtuqkWOtfjsi5ZNw" \
  -H "Content-Type: application/json"
```

## Last Year
```bash
curl -X GET "http://localhost:5001/api/cash-flow/health-score?timeFrame=LAST_YEAR" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjY5ODYxOSwiZXhwIjoxNzM2NzAyMjE5fQ.TNdTHNsnXJXpvZ8zuRm_RkXQsDggtuqkWOtfjsi5ZNw" \
-H "Content-Type: application/json"
```

# Income Source Analysis

## Last Week
```bash
curl -X GET "http://localhost:5001/api/cash-flow/income-analysis?timeFrame=LAST_WEEK" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjY5ODYxOSwiZXhwIjoxNzM2NzAyMjE5fQ.TNdTHNsnXJXpvZ8zuRm_RkXQsDggtuqkWOtfjsi5ZNw" \
-H "Content-Type: application/json"
```

## Last Month
```bash
curl -X GET "http://localhost:5001/api/cash-flow/income-analysis?timeFrame=LAST_MONTH" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjY5ODYxOSwiZXhwIjoxNzM2NzAyMjE5fQ.TNdTHNsnXJXpvZ8zuRm_RkXQsDggtuqkWOtfjsi5ZNw" \
-H "Content-Type: application/json"
```

## Last Quarter
```bash
curl -X GET "http://localhost:5001/api/cash-flow/income-analysis?timeFrame=LAST_QUARTER" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjY5ODYxOSwiZXhwIjoxNzM2NzAyMjE5fQ.TNdTHNsnXJXpvZ8zuRm_RkXQsDggtuqkWOtfjsi5ZNw" \
-H "Content-Type: application/json"
```

## Last Year
```bash
curl -X GET "http://localhost:5001/api/cash-flow/income-analysis?timeFrame=LAST_YEAR" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjY5ODYxOSwiZXhwIjoxNzM2NzAyMjE5fQ.TNdTHNsnXJXpvZ8zuRm_RkXQsDggtuqkWOtfjsi5ZNw" \
-H "Content-Type: application/json"
```

# Expense Analysis

## Last Week
```bash
curl -X GET "http://localhost:5001/api/cash-flow/expense-analysis?timeFrame=LAST_WEEK" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjY5ODYxOSwiZXhwIjoxNzM2NzAyMjE5fQ.TNdTHNsnXJXpvZ8zuRm_RkXQsDggtuqkWOtfjsi5ZNw" \
-H "Content-Type: application/json"
```

## Last Month
```bash
curl -X GET "http://localhost:5001/api/cash-flow/expense-analysis?timeFrame=LAST_MONTH" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjY5ODYxOSwiZXhwIjoxNzM2NzAyMjE5fQ.TNdTHNsnXJXpvZ8zuRm_RkXQsDggtuqkWOtfjsi5ZNw" \
-H "Content-Type: application/json"
```

## Last Quarter
```bash
curl -X GET "http://localhost:5001/api/cash-flow/expense-analysis?timeFrame=LAST_QUARTER" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVkNDg4MGFjLTdhYWYtNDQ5My05Y2RhLThlOGEwZjEwMDM5NCIsImlhdCI6MTczNjY5ODYxOSwiZXhwIjoxNzM2NzAyMjE5fQ.TNdTHNsnXJXpvZ8zuRm_RkXQsDggtuqkWOtfjsi5ZNw" \
-H "Content-Type: application/json"
```

## Last Year
```bash
curl -X GET "http://localhost:5001/api/cash-flow/expense-analysis?timeFrame=LAST_YEAR" \
-H "Authorization: Bearer YOUR_TOKEN" \
-H "Content-Type: application/json"
```

# Cash Flow Forecast

## Last Week
```bash
curl -X GET "http://localhost:5001/api/cash-flow/forecast?timeFrame=LAST_WEEK" \
-H "Authorization: Bearer YOUR_TOKEN" \
-H "Content-Type: application/json"
```

## Last Month
```bash
curl -X GET "http://localhost:5001/api/cash-flow/forecast?timeFrame=LAST_MONTH" \
-H "Authorization: Bearer YOUR_TOKEN" \
-H "Content-Type: application/json"
```

## Last Quarter
```bash
curl -X GET "http://localhost:5001/api/cash-flow/forecast?timeFrame=LAST_QUARTER" \
-H "Authorization: Bearer YOUR_TOKEN" \
-H "Content-Type: application/json"
```

## Last Year
```bash
curl -X GET "http://localhost:5001/api/cash-flow/forecast?timeFrame=LAST_YEAR" \
-H "Authorization: Bearer YOUR_TOKEN" \
-H "Content-Type: application/json"
```

Note: Replace `YOUR_TOKEN` with a valid JWT token obtained from the login endpoint.
