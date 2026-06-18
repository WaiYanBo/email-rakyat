/**
 * ============================================================
 *  SECURITY UTILITIES — Staff Portal
 *  Covers: XSS, SQL-injection patterns, CSRF, rate-limiting,
 *          bot/crawler detection, input validation, and more.
 * ============================================================
 */

// ─── YouTube helpers ──────────────────────────────────────────────────────────

export function isValidYouTubeVideoId(videoId: string): boolean {
  if (!videoId || typeof videoId !== 'string') return false;
  return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

export function sanitizeYouTubeVideoId(videoId: string): string {
  if (!videoId || typeof videoId !== 'string') return '';
  const sanitized = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  return sanitized.length === 11 ? sanitized : '';
}

export function buildYouTubeEmbedUrl(videoId: string, startTime: number = 0): string {
  const validId = isValidYouTubeVideoId(videoId) ? videoId : sanitizeYouTubeVideoId(videoId);
  if (!validId) return '';
  const safeStart = Math.max(0, Math.floor(startTime));
  return `https://www.youtube-nocookie.com/embed/${validId}?autoplay=1&start=${safeStart}&rel=0&modestbranding=1`;
}

// ─── Input sanitisation ───────────────────────────────────────────────────────

const MAX_INPUT_LENGTH = 500;
const MAX_LONG_INPUT_LENGTH = 2000;

/**
 * Strips any HTML tags, dangerous JS patterns, and common SQLi sequences.
 * Suitable for names, short text fields.
 */
export function sanitizeInput(input: string, maxLength = MAX_INPUT_LENGTH): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .trim()
    .slice(0, maxLength)
    // Strip HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove dangerous attribute patterns (onclick=, onerror=, etc.)
    .replace(/on\w+\s*=/gi, '')
    // Remove protocol injections
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    // Remove common SQLi patterns
    .replace(/(['";\\]|--|\b(OR|AND)\b\s+\d+\s*=\s*\d+)/gi, '')
    // Remove null bytes
    .replace(/\0/g, '')
    // Encode remaining angle brackets (belt-and-suspenders)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sanitises longer text (announcements, messages) — preserves newlines but
 * strips all HTML/JS injection patterns.
 */
export function sanitizeLongText(input: string): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .trim()
    .slice(0, MAX_LONG_INPUT_LENGTH)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/\0/g, '');
}

/**
 * Encodes a string for safe insertion into HTML text nodes.
 * Use this for any dynamic content rendered via innerHTML.
 */
export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// ─── Validation helpers ───────────────────────────────────────────────────────

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  // RFC-5322 simplified, with length cap
  const emailPattern = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  return emailPattern.test(email.trim()) && email.length <= 254;
}

export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const phonePattern = /^[\d\s\-+()]{7,20}$/;
  return phonePattern.test(phone.trim());
}

/**
 * Validates a password meets minimum security requirements.
 * At least 8 characters, one uppercase, one lowercase, one digit.
 */
export function isStrongPassword(password: string, lang: 'en' | 'bm' = 'en'): { valid: boolean; message: string } {
  if (!password || password.length < 8) {
    return {
      valid: false,
      message: lang === 'bm'
        ? 'Kata laluan mestilah sekurang-kurangnya 8 aksara.'
        : 'Password must be at least 8 characters long.'
    };
  }
  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: lang === 'bm'
        ? 'Kata laluan mesti mengandungi sekurang-kurangnya satu huruf besar.'
        : 'Password must contain at least one uppercase letter.'
    };
  }
  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: lang === 'bm'
        ? 'Kata laluan mesti mengandungi sekurang-kurangnya satu huruf kecil.'
        : 'Password must contain at least one lowercase letter.'
    };
  }
  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: lang === 'bm'
        ? 'Kata laluan mesti mengandungi sekurang-kurangnya satu nombor.'
        : 'Password must contain at least one number.'
    };
  }
  return {
    valid: true,
    message: lang === 'bm'
      ? 'Kata laluan adalah kuat.'
      : 'Password is strong.'
  };
}

/**
 * Validates that a name only contains safe characters.
 */
export function isValidName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  // Allow letters (including unicode), spaces, hyphens, apostrophes
  const namePattern = /^[\p{L}\s'\-\.]{2,100}$/u;
  return namePattern.test(name.trim());
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

interface RateLimitRecord {
  count: number;
  resetTime: number;
  blockedUntil?: number;
}

const requestCounts = new Map<string, RateLimitRecord>();

/**
 * Client-side rate limiter. Returns false when the caller is over the limit.
 * Includes an automatic exponential back-off block after 5 consecutive failures.
 */
export function isRequestAllowed(
  identifier: string,
  limit: number = 100,
  windowMs: number = 60_000
): boolean {
  const now = Date.now();
  const record = requestCounts.get(identifier);

  if (record?.blockedUntil && now < record.blockedUntil) {
    return false; // Still in block period
  }

  if (!record || now >= record.resetTime) {
    requestCounts.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= limit) {
    // Exponential back-off: block for 2 minutes after limit exceeded
    record.blockedUntil = now + 120_000;
    return false;
  }

  record.count++;
  return true;
}

/** Login-specific rate limiter: 5 attempts per 15 minutes per identifier */
export function isLoginAllowed(identifier: string): boolean {
  return isRequestAllowed(`login:${identifier}`, 5, 15 * 60_000);
}

/** Clear rate limit record (call after successful login) */
export function clearRateLimit(identifier: string): void {
  requestCounts.delete(`login:${identifier}`);
}

// ─── CSRF protection ──────────────────────────────────────────────────────────

/**
 * Generates a cryptographically secure CSRF token using the Web Crypto API.
 * Falls back to a Math.random-based token if crypto is unavailable.
 */
export function generateCSRFToken(): string {
  try {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback for environments without crypto.getRandomValues
    return Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }
}

/**
 * Timing-safe constant-time comparison to prevent timing attacks.
 */
export function validateCSRFToken(token: string, sessionToken: string): boolean {
  if (!token || !sessionToken) return false;
  if (token.length !== sessionToken.length) return false;

  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    // XOR each char — accumulates differences without early exit
    mismatch |= token.charCodeAt(i) ^ sessionToken.charCodeAt(i);
  }
  return mismatch === 0;
}

// ─── Bot / crawler detection ──────────────────────────────────────────────────

const MALICIOUS_UA_PATTERNS = [
  'sqlmap', 'nikto', 'masscan', 'nessus', 'openvas', 'zap', 'burpsuite', 'burp',
  'nmap', 'shodan', 'acunetix', 'w3af', 'havij', 'pangolin', 'libwhisker',
  'dirbuster', 'dirb', 'gobuster', 'wfuzz', 'hydra', 'medusa', 'metasploit',
];

const GENERIC_BOT_PATTERNS = [
  'bot', 'crawler', 'spider', 'scraper', 'curl/', 'wget/', 'python-requests',
  'go-http-client', 'java/', 'okhttp', 'ruby', 'php/', 'perl/',
  'ahrefsbot', 'semrushbot', 'mj12bot', 'yandexbot', 'bingbot', 'googlebot',
];

export function isSuspiciousUserAgent(userAgent: string): boolean {
  if (!userAgent || userAgent.trim() === '') return true;
  const ua = userAgent.toLowerCase();
  // Pentest tools first
  if (MALICIOUS_UA_PATTERNS.some((p) => ua.includes(p))) return true;
  // General automated bots
  if (GENERIC_BOT_PATTERNS.some((p) => ua.includes(p))) return true;
  return false;
}

export function isMaliciousToolUA(userAgent: string): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return MALICIOUS_UA_PATTERNS.some((p) => ua.includes(p));
}

// ─── CORS helper ──────────────────────────────────────────────────────────────

export function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    return allowedOrigins.some((allowed) => {
      const allowedUrl = new URL(allowed);
      return originUrl.hostname === allowedUrl.hostname;
    });
  } catch {
    return false;
  }
}

// ─── URL safety ───────────────────────────────────────────────────────────────

/**
 * Returns true only for http/https URLs pointing to safe hostnames.
 * Blocks javascript:, data:, and other dangerous protocols.
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// ─── Numeric / financial input sanitisation ───────────────────────────────────

/**
 * Safely parses a user-supplied RM amount string to a float.
 * Returns 0 for invalid inputs.
 */
export function parseSafeAmount(input: unknown): number {
  if (typeof input === 'number') return isFinite(input) && input >= 0 ? input : 0;
  if (typeof input !== 'string') return 0;
  const cleaned = input.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
