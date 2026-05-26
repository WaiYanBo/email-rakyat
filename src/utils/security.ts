/**
 * Comprehensive Security Utility Functions
 * Protects against XSS, injection attacks, crawler abuse, and malicious input
 */

/**
 * YOUTUBE VIDEO VALIDATION
 */

export function isValidYouTubeVideoId(videoId: string): boolean {
  if (!videoId || typeof videoId !== 'string') {
    return false;
  }
  
  const youtubeIdPattern = /^[a-zA-Z0-9_-]{11}$/;
  return youtubeIdPattern.test(videoId);
}

export function sanitizeYouTubeVideoId(videoId: string): string {
  if (!videoId || typeof videoId !== 'string') {
    return '';
  }
  
  const sanitized = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  return sanitized.length === 11 ? sanitized : '';
}

export function buildYouTubeEmbedUrl(videoId: string, startTime: number = 0): string {
  const validId = isValidYouTubeVideoId(videoId) ? videoId : sanitizeYouTubeVideoId(videoId);
  
  if (!validId) {
    return '';
  }
  
  const safeStartTime = Math.max(0, Math.floor(startTime));
  return `https://www.youtube-nocookie.com/embed/${validId}?autoplay=1&start=${safeStartTime}&rel=0&modestbranding=1`;
}

/**
 * INPUT SANITIZATION & VALIDATION
 */

/**
 * Sanitizes string input to prevent XSS attacks
 * Removes dangerous HTML/JavaScript patterns
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  return input
    .trim()
    .replace(/[<>"'`;]/g, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/javascript:/gi, '')
    .slice(0, 1000);
}

/**
 * Validates email format with strict rules
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return emailPattern.test(email) && email.length <= 254;
}

/**
 * Validates phone number format
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') {
    return false;
  }
  
  const phonePattern = /^[\d\s\-\+\(\)]{7,15}$/;
  return phonePattern.test(phone);
}

/**
 * RATE LIMITING & THROTTLING
 */

const requestCounts = new Map<string, { count: number; resetTime: number }>();

/**
 * Check if request exceeds rate limit
 */
export function isRequestAllowed(identifier: string, limit: number = 100, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = requestCounts.get(identifier);
  
  if (!record || now >= record.resetTime) {
    requestCounts.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (record.count >= limit) {
    return false;
  }
  
  record.count++;
  return true;
}

/**
 * BOT DETECTION
 */

/**
 * Detects suspicious User-Agent strings
 */
export function isSuspiciousUserAgent(userAgent: string): boolean {
  if (!userAgent) {
    return true;
  }
  
  const suspiciousBots = [
    'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget',
    'python', 'java', 'node', 'perl', 'ruby', 'php',
    'sqlmap', 'nikto', 'masscan', 'nessus', 'openvas',
    'ahrefsbot', 'semrushbot', 'mj12bot', 'yandexbot',
    'nmap', 'masscan', 'shodan', 'zap', 'burp'
  ];
  
  const lowerUA = userAgent.toLowerCase();
  return suspiciousBots.some(bot => lowerUA.includes(bot));
}

/**
 * Validates if origin is allowed (CORS)
 */
export function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (!origin) {
    return false;
  }
  
  try {
    const originUrl = new URL(origin);
    return allowedOrigins.some(allowed => {
      const allowedUrl = new URL(allowed);
      return originUrl.hostname === allowedUrl.hostname;
    });
  } catch {
    return false;
  }
}

/**
 * CSRF PROTECTION
 */

/**
 * Generates a CSRF token
 */
export function generateCSRFToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Validates CSRF token
 */
export function validateCSRFToken(token: string, sessionToken: string): boolean {
  if (!token || !sessionToken) {
    return false;
  }
  
  return token.split('').every((char, i) => char === sessionToken[i]);
}
