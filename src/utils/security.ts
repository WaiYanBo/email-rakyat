

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


const MAX_INPUT_LENGTH = 500;
const MAX_LONG_INPUT_LENGTH = 2000;

export function sanitizeInput(input: string, maxLength = MAX_INPUT_LENGTH): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .trim()
    .slice(0, maxLength)
    .replace(/<[^>]*>/g, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/\0/g, '');
}

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

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}


export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailPattern = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  return emailPattern.test(email.trim()) && email.length <= 254;
}

export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const phonePattern = /^[\d\s\-+()]{7,20}$/;
  return phonePattern.test(phone.trim());
}

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

export function isValidName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const namePattern = /^[\p{L}\s'\-\.]{2,100}$/u;
  return namePattern.test(name.trim());
}


interface RateLimitRecord {
  count: number;
  resetTime: number;
  blockedUntil?: number;
}

const requestCounts = new Map<string, RateLimitRecord>();

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
    record.blockedUntil = now + 120_000;
    return false;
  }

  record.count++;
  return true;
}

export function isLoginAllowed(identifier: string): boolean {
  return isRequestAllowed(`login:${identifier}`, 5, 15 * 60_000);
}

export function clearRateLimit(identifier: string): void {
  requestCounts.delete(`login:${identifier}`);
}


export function generateCSRFToken(): string {
  try {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }
}

export function validateCSRFToken(token: string, sessionToken: string): boolean {
  if (!token || !sessionToken) return false;
  if (token.length !== sessionToken.length) return false;

  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ sessionToken.charCodeAt(i);
  }
  return mismatch === 0;
}


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
  if (MALICIOUS_UA_PATTERNS.some((p) => ua.includes(p))) return true;
  if (GENERIC_BOT_PATTERNS.some((p) => ua.includes(p))) return true;
  return false;
}

export function isMaliciousToolUA(userAgent: string): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return MALICIOUS_UA_PATTERNS.some((p) => ua.includes(p));
}


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


export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}


export function parseSafeAmount(input: unknown): number {
  if (typeof input === 'number') return isFinite(input) && input >= 0 ? input : 0;
  if (typeof input !== 'string') return 0;
  const cleaned = input.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
