# Rate Limiting Documentation

## Overview

The Fulqrom Hub API implements rate limiting to protect against abuse, brute force attacks, and resource exhaustion. Rate limits are applied using `express-rate-limit` middleware.

## Rate Limit Tiers

### 1. General API Limiter (Default)
**Applied to:** All `/api/*` endpoints
**Limit:** 100 requests per 15 minutes per IP
**Exempt:** Admin and Super Admin users

```javascript
// Applied globally in server.js
app.use('/api', apiLimiter);
```

**Response when exceeded:**
```json
{
  "success": false,
  "message": "Too many requests from this IP, please try again after 15 minutes.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": "15 minutes"
}
```

**Headers returned:**
- `RateLimit-Limit`: Maximum requests allowed
- `RateLimit-Remaining`: Requests remaining in current window
- `RateLimit-Reset`: Unix timestamp when limit resets

---

### 2. Authentication Limiter (Strict)
**Applied to:** `/api/auth/login`
**Limit:** 5 requests per 15 minutes per IP
**Purpose:** Prevent brute force attacks

```javascript
// Applied in routes/auth.js
router.post('/login', authLimiter, ...);
```

**Special behavior:**
- Only counts failed login attempts
- Successful logins don't count toward limit (`skipSuccessfulRequests: true`)

---

### 3. Upload Limiter
**Applied to:** Document upload endpoints
**Limit:** 50 uploads per hour per IP
**Purpose:** Prevent storage abuse

```javascript
// Applied in routes/documents.js
router.post('/', uploadLimiter, ...);
router.post('/:id/versions', uploadLimiter, ...);
```

**Protected endpoints:**
- `POST /api/documents` (new document upload)
- `POST /api/documents/:id/versions` (version upload)

---

### 4. Public Limiter (Lenient)
**Applied to:** Public endpoints (health checks, registration)
**Limit:** 30 requests per 15 minutes per IP

```javascript
// Applied in server.js
app.get('/health', publicLimiter, ...);
```

---

### 5. Critical Operations Limiter (Very Strict)
**Applied to:** High-risk operations
**Limit:** 3 requests per hour per IP
**Purpose:** Prevent abuse of sensitive operations

**Use for:**
- Password reset requests
- MFA removal
- User deletion
- Account recovery

```javascript
// Example usage
router.delete('/users/:id/mfa', criticalLimiter, ...);
```

---

## Rate Limit Bypass

### Admin Users
Users with `Admin` or `Super Admin` roles automatically bypass the general API rate limiter:

```javascript
skip: (req) => {
  return req.user?.role_ids?.some(role =>
    role?.name === 'Super Admin' || role?.name === 'Admin'
  );
}
```

**Note:** Auth limiter is NOT bypassed (even admins must respect login attempt limits)

---

## Testing Rate Limits

### Using cURL
```bash
# Test general API limiter (100 requests/15min)
for i in {1..101}; do
  curl -H "Cookie: sid=your_session" http://localhost:30001/api/customers
done
# 101st request returns 429 Too Many Requests

# Test auth limiter (5 attempts/15min)
for i in {1..6}; do
  curl -X POST http://localhost:30001/api/auth/login \
    -H "Authorization: Bearer invalid_token"
done
# 6th request returns 429 Too Many Requests
```

### Using Postman
1. Create a collection with the endpoint to test
2. Use Collection Runner with 150 iterations
3. Check response codes (should see 429 after limit)

---

## Production Considerations

### Redis Store (Recommended for Multi-Instance)

For production deployments with multiple API instances (load balanced), use Redis store:

```bash
npm install rate-limit-redis
```

```javascript
// middleware/rateLimiter.js
const RedisStore = require('rate-limit-redis');
const { createClient } = require('redis');

const redisClient = createClient({
  url: process.env.REDIS_URL
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:api:',
  }),
  // ... other options
});
```

**Benefits:**
- Shared rate limit state across all instances
- Persistent limits (survive server restarts)
- Better performance for high-traffic APIs

---

### Environment Variables

Add these to `.env` for configurable limits:

```env
# Rate Limiting Configuration
RATE_LIMIT_ENABLED=true
RATE_LIMIT_API_MAX=100
RATE_LIMIT_API_WINDOW_MS=900000
RATE_LIMIT_AUTH_MAX=5
RATE_LIMIT_AUTH_WINDOW_MS=900000
RATE_LIMIT_UPLOAD_MAX=50
RATE_LIMIT_UPLOAD_WINDOW_MS=3600000
```

Update `middleware/rateLimiter.js`:

```javascript
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_API_MAX) || 100,
  // ...
});
```

---

## Monitoring

### Log Rate Limit Events

```javascript
const apiLimiter = rateLimit({
  // ... existing config
  handler: (req, res) => {
    console.warn(`Rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});
```

### Metrics (Prometheus/Datadog)

Track rate limit metrics:
- Total requests blocked
- IPs exceeding limits
- Endpoints with most blocks
- Average requests per IP

---

## Client-Side Handling

### Respect Rate Limit Headers

```typescript
// Frontend API client
async function apiRequest(url: string) {
  const response = await fetch(url);

  if (response.status === 429) {
    const retryAfter = response.headers.get('RateLimit-Reset');
    const resetTime = new Date(parseInt(retryAfter) * 1000);

    throw new Error(`Rate limit exceeded. Try again at ${resetTime}`);
  }

  return response.json();
}
```

### Exponential Backoff

```typescript
async function retryRequest(url: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await apiRequest(url);
    } catch (error) {
      if (error.message.includes('Rate limit')) {
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

---

## Security Best Practices

1. **Trust Proxy Settings**
   ```javascript
   // server.js
   app.set('trust proxy', 1); // Trust first proxy (Nginx, CloudFlare)
   ```

2. **IP-based vs User-based Limiting**
   - Current: IP-based (simpler, works for unauthenticated endpoints)
   - Future: Add user-based limits for authenticated endpoints

3. **Adjust Limits by Environment**
   ```javascript
   const apiMax = process.env.NODE_ENV === 'production' ? 100 : 1000;
   ```

4. **Monitor for Abuse**
   - Set up alerts for IPs hitting limits repeatedly
   - Block malicious IPs at firewall/WAF level

---

## Troubleshooting

### "Rate limit exceeded" for legitimate users

**Cause:** Shared IP addresses (corporate NAT, VPN)
**Solution:** Increase limits or implement user-based limits

### Rate limits not working in development

**Cause:** Multiple dev instances or proxy misconfiguration
**Solution:** Check `trust proxy` settings

### Limits reset unexpectedly

**Cause:** Server restarts (in-memory store)
**Solution:** Use Redis store for production

---

## Summary

| Limiter | Endpoints | Limit | Window | Bypass |
|---------|-----------|-------|--------|--------|
| **apiLimiter** | `/api/*` | 100 | 15 min | Admin |
| **authLimiter** | `/auth/login` | 5 | 15 min | None |
| **uploadLimiter** | Document uploads | 50 | 1 hour | None |
| **publicLimiter** | `/health`, etc. | 30 | 15 min | None |
| **criticalLimiter** | Sensitive ops | 3 | 1 hour | None |

**Status:** ✅ Implemented
**Version:** 1.0.0
**Last Updated:** January 2025
