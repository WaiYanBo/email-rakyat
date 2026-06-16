# Security Hardening Implementation

## Overview
This document outlines all security enhancements implemented to protect against crawlers, bots, and malicious attacks.

---

## 1. 🤖 Crawler & Bot Protection

### Enhanced robots.txt
**Location:** `public/robots.txt`

- **Blocked Crawlers:**
  - Ahrefs Bot (AhrefsBot)
  - Semrush Bot (SemrushBot)
  - DotBot
  - MJ12bot
  - Mojeek Bot
  - Yandex Bot
  - Senti Bot
  - Facebook External Hit

- **Rate Limiting:**
  - Legitimate bots (Google, Bing, DuckDuckGo): 2-second crawl delay
  - Unknown bots: 5-second crawl delay
  - Portal/admin paths: Fully disallowed

---

## 2. 🛡️ Security Headers (Netlify)

**Location:** `netlify.toml`

### Critical Headers Implemented:

| Header | Purpose | Value |
|--------|---------|-------|
| `X-Frame-Options` | Prevents clickjacking | `DENY` |
| `X-Content-Type-Options` | Blocks MIME sniffing | `nosniff` |
| `X-XSS-Protection` | XSS attack protection | `1; mode=block` |
| `Referrer-Policy` | Referrer privacy | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Disable sensitive features | Geolocation, camera, microphone blocked |
| `Strict-Transport-Security` | Force HTTPS | 1 year max-age, subdomains included |
| `Content-Security-Policy` | XSS & injection prevention | Strict policy (see below) |

### Content Security Policy (CSP)
```
default-src 'self'
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://www.googletagmanager.com
style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://fonts.googleapis.com
img-src 'self' data: blob: https:
font-src 'self' data: https://fonts.gstatic.com
worker-src 'self' blob:
connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co https://api.supabase.co https://translate.googleapis.com https://unpkg.com https://cdn.jsdelivr.net https://www.google-analytics.com
frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com
frame-ancestors 'none'
object-src 'none'
```

---

## 3. 🚨 Malicious Path Blocking (Netlify)

**Location:** `netlify.toml`

Automatically returns **404** for:
- `.env*` files
- `/wp-admin/` paths
- `/wp-login/` paths
- `.git/` directories
- `/config/` directories

---

## 4. 🔐 Input Validation & Sanitization

**Location:** `src/utils/security.ts`

### Available Functions:

#### sanitizeInput()
Removes dangerous HTML/JavaScript patterns:
- Strips `< > " ' ` ; characters
- Removes event handlers (onclick, etc)
- Blocks javascript: protocol
- Max 1000 characters

```typescript
import { sanitizeInput } from '@/utils/security';

const cleanInput = sanitizeInput(userInput);
```

#### isValidEmail()
Validates email with RFC 5321 compliance:
```typescript
if (isValidEmail(email)) {
  // Process email
}
```

#### isValidPhoneNumber()
Validates phone numbers (7-15 characters):
```typescript
if (isValidPhoneNumber(phone)) {
  // Process phone
}
```

---

## 5. ⏱️ Rate Limiting

**Location:** `src/utils/security.ts`

### isRequestAllowed()
Prevents brute force and DDoS attacks:

```typescript
import { isRequestAllowed } from '@/utils/security';

// Check if request is allowed (100 requests per 60 seconds per IP)
if (isRequestAllowed(ipAddress, 100, 60000)) {
  // Process request
} else {
  // Return 429 Too Many Requests
}
```

**Parameters:**
- `identifier`: IP address or user ID
- `limit`: Max requests (default: 100)
- `windowMs`: Time window in milliseconds (default: 60000)

---

## 6. 🤔 Bot Detection

**Location:** `src/utils/security.ts`

### isSuspiciousUserAgent()
Detects and blocks known malicious user agents:

```typescript
import { isSuspiciousUserAgent } from '@/utils/security';

const userAgent = req.headers['user-agent'];
if (isSuspiciousUserAgent(userAgent)) {
  // Return 403 Forbidden
}
```

**Detected Threats:**
- Generic bots (bot, crawler, spider, scraper)
- Development tools (curl, wget, python, java, node)
- Penetration testing tools (sqlmap, nikto, nessus, burp, zap)
- Reconnaissance tools (nmap, masscan, shodan)

---

## 7. 🔀 CORS & Origin Validation

**Location:** `src/utils/security.ts`

### isAllowedOrigin()
Validates request origins for CORS:

```typescript
import { isAllowedOrigin } from '@/utils/security';

const allowedOrigins = [
  'https://e-rakyat.com',
  'https://app.e-rakyat.com'
];

if (isAllowedOrigin(req.headers.origin, allowedOrigins)) {
  // Process request
} else {
  // Return 403 Forbidden
}
```

---

## 8. 🛡️ CSRF Protection

**Location:** `src/utils/security.ts`

### generateCSRFToken()
Generates secure random tokens:

```typescript
import { generateCSRFToken } from '@/utils/security';

const token = generateCSRFToken();
// Store in session and return to client
```

### validateCSRFToken()
Validates tokens with timing-safe comparison:

```typescript
import { validateCSRFToken } from '@/utils/security';

if (validateCSRFToken(userToken, sessionToken)) {
  // Process form submission
}
```

---

## 9. 📊 Implementation Checklist

### Already Implemented ✅
- [x] Enhanced robots.txt with bot blocking
- [x] Security headers in netlify.toml
- [x] Malicious path blocking
- [x] Input sanitization functions
- [x] Email & phone validation
- [x] Rate limiting system
- [x] Bot detection
- [x] CORS validation
- [x] CSRF token generation

### Recommended Additional Steps ⚠️
- [ ] Integrate rate limiting in Supabase RLS policies
- [ ] Add rate limiting middleware to Supabase functions
- [ ] Implement CAPTCHA on login page (optional)
- [ ] Set up monitoring/alerting for suspicious activity
- [ ] Regular security audits (monthly)
- [ ] Keep dependencies updated

---

## 10. 🚀 Usage Examples

### In React Components
```typescript
import { sanitizeInput, isValidEmail } from '@/utils/security';

export default function LoginForm() {
  const handleSubmit = (e) => {
    e.preventDefault();
    const email = sanitizeInput(e.target.email.value);
    
    if (!isValidEmail(email)) {
      alert('Invalid email format');
      return;
    }
    // Process login
  };
}
```

### In Supabase Policies
Already configured with Row-Level Security (RLS):
- User authentication required
- Role-based access control
- Data isolation by user

---

## 11. 📈 Monitoring

### What to Watch For:
1. **Crawler Activity:** Check Netlify logs for 403/404 errors from suspicious bots
2. **Rate Limit Violations:** Monitor for repeated 429 responses
3. **Invalid Input:** Track sanitization rejections
4. **CORS Violations:** Log rejected origins

### Log Files:
- Netlify Analytics: `https://app.netlify.com/sites/[your-site]/analytics`
- Supabase Logs: `https://app.supabase.io/project/[your-project]/logs/explorer`

---

## 12. 🔄 Update Policy

Security measures should be updated quarterly:
- Review blocked bot list
- Update CSP policies
- Audit dependencies for vulnerabilities
- Review access logs for patterns

---

## 📞 Support

For security concerns or questions, contact your IT administrator or the development team.

**Last Updated:** May 26, 2026
**Status:** ✅ Fully Implemented
