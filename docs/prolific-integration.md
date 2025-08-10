# Prolific Integration Implementation

## Overview

This document describes the complete implementation of Prolific API integration for participant management, including automatic approval and rejection based on screening results.

## Architecture

### Database Schema Updates

The `Participant` model has been extended with:
- `prolificSubmissionId`: Unique identifier for the Prolific submission
- `rejectionReason`: Text explaining why a participant was rejected
- `rejectedAt`: Timestamp of rejection

### API Endpoints

#### 1. `/api/prolific/session` (POST)
**Purpose**: Initialize Prolific participant session
- Stores `prolificSubmissionId` from the session parameter
- Creates or updates participant record
- Assigns tasks based on experiment evaluation mode

#### 2. `/api/prolific/reject` (POST)
**Purpose**: Reject failed screening participants
- Updates participant status to 'screening_failed'
- Records rejection reason and timestamp
- Makes PATCH request to Prolific API: `/api/v1/submissions/{submission_id}/transition`
- Graceful fallback if Prolific API is unavailable

#### 3. `/api/prolific/approve` (POST)
**Purpose**: Approve successful participants (for future use)
- Updates participant status to 'completed'
- Makes PATCH request to Prolific API for approval
- Can be used when participants complete the full study

### Screening Flow Integration

#### Anonymous Users
- **Pass**: Redirect directly to first available task
- **Fail**: Show failure message with "Return to Home" button

#### Prolific Users
- **Pass**: Redirect directly to first available task
- **Fail**: 
  1. Mark participant as rejected in database
  2. Call Prolific API to reject submission
  3. Show rejection message (no home button)

## Organization Configuration

Prolific API keys are now configured per-organization:

1. Navigate to your organization settings page: `/{organizationSlug}/settings`
2. Go to the "Integrations" tab
3. Enter your Prolific API key
4. Save the settings

Get your API key from: Prolific workspace settings → Integrations → API tokens

**Note**: Each organization must have its own Prolific API key configured. There is no global fallback.

## Prolific API Details

### Request Format
```bash
PATCH https://api.prolific.com/api/v1/submissions/{submission_id}/transition/
Authorization: Token {api_key}
Content-Type: application/json

{
  "action": "REJECT",  // or "APPROVE"
  "reason": "Failed screening requirements - did not meet minimum task threshold"
}
```

### Response Handling
- **Success**: 200 OK with updated submission data
- **Error**: Appropriate HTTP status with error details
- **Fallback**: Always marks participant locally even if API fails

## Error Handling

### Robust Fallback Strategy
1. **Primary**: Update local database status
2. **Secondary**: Attempt Prolific API call
3. **Fallback**: Continue with local status if API fails

### Logging
- All API calls are logged with participant and submission IDs
- Errors include full response details for debugging
- Success responses include confirmation data

### Status Responses
API returns detailed status information:
```json
{
  "success": true,
  "message": "Participant rejected successfully via Prolific API",
  "prolificApiCalled": true,
  "prolificResponse": { ... }
}
```

## Security Considerations

### API Key Protection
- Environment variable only (never committed)
- Server-side only (not exposed to client)
- Proper error handling doesn't leak key details

### Validation
- Participant ID validation before API calls
- Prolific user verification before rejection
- Proper error boundaries to prevent crashes

### Rate Limiting
- Prolific API has rate limits (implement backoff if needed)
- Local fallback ensures user experience isn't affected

## Testing Considerations

### Development Testing
- Use sandbox/test Prolific workspace
- Mock API responses for unit tests
- Test both success and failure scenarios

### Production Validation
- Monitor API response rates
- Track rejection success rates
- Alert on API failures

## Migration Notes

To activate this functionality:
1. Run database migration to add new fields
2. Configure Prolific API key in your organization settings
3. Remove `as any` casts once migration is complete
4. Test with sandbox Prolific workspace first

## Future Enhancements

### Automatic Approval
- Call `/api/prolific/approve` when participants complete studies
- Integrate with study completion detection

### Batch Operations
- Handle multiple rejections/approvals efficiently
- Implement retry logic for failed API calls

### Analytics
- Track rejection rates by screening criteria
- Monitor API performance and reliability