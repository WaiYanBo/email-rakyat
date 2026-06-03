import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { isValidEmail, isLoginAllowed, clearRateLimit } from '../utils/security';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';

export default function LoginAuth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const { lang } = usePortalLanguage();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // ── 1. Input validation ──────────────────────────────────────────────
    const trimmedEmail = email.trim().toLowerCase();

    if (!isValidEmail(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!password || password.length < 1) {
      setError('Please enter your password.');
      return;
    }

    // ── 2. Client-side rate limiting ─────────────────────────────────────
    if (!isLoginAllowed(trimmedEmail)) {
      setError('Too many login attempts. Please wait 15 minutes before trying again.');
      return;
    }

    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (authError) {
        const newCount = attemptCount + 1;
        setAttemptCount(newCount);

        // ── 3. Generic error message (no user enumeration) ───────────────
        // Never reveal whether email or password was wrong specifically.
        // Also avoid leaking account-existence information.
        if (
          authError.message.includes('Invalid login credentials') ||
          authError.message.includes('invalid_credentials') ||
          authError.message.includes('Email not confirmed') ||
          authError.message.includes('user not found')
        ) {
          setError('Invalid email or password.');
        } else if (authError.message.includes('rate')) {
          setError('Too many attempts. Please try again later.');
        } else {
          // Avoid leaking raw Supabase error messages
          setError('Login failed. Please try again.');
        }

        // Show remaining attempts warning after 3 failures
        if (newCount >= 3) {
          setError(`Invalid email or password. ${5 - newCount} attempt(s) remaining.`);
        }
      } else if (data?.user) {
        clearRateLimit(trimmedEmail); // Reset on success
        window.location.href = '/portal';
      }
    } catch (_err) {
      // Do NOT log sensitive details to console in production
      setError('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    // FIX: Changed w-full to w-[90%] on mobile, adjusted padding (p-6 md:p-8)
    <div className="w-[90%] md:w-full max-w-md mx-auto p-6 md:p-8 bg-white dark:bg-gray-900/80 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl transition-colors duration-300">
      <div className="text-center mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-black text-teal-800 dark:text-white uppercase tracking-wider mb-2 transition-colors">
          {t('login', 'title', lang)}
        </h2>
        <p className="text-xs md:text-sm text-teal-600/80 dark:text-gray-400 transition-colors">
          {t('login', 'subtitle', lang)}
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-5 md:space-y-6" noValidate>
        <div>
          <label htmlFor="login-email" className="block text-xs md:text-sm font-bold text-teal-900 dark:text-gray-300 mb-1.5 md:mb-2 uppercase tracking-wide transition-colors">
            {t('login', 'email', lang)}
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            maxLength={254}
            className="w-full px-4 py-2.5 md:py-3 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-teal-500 dark:focus:border-yellow-500 focus:ring-1 focus:ring-teal-500 dark:focus:ring-yellow-500 text-sm text-gray-900 dark:text-white transition-all placeholder-gray-400 dark:placeholder-gray-600 shadow-inner"
            required
            aria-required="true"
            aria-label="Email address"
          />
        </div>

        <div>
          <label htmlFor="login-password" className="block text-xs md:text-sm font-bold text-teal-900 dark:text-gray-300 mb-1.5 md:mb-2 uppercase tracking-wide transition-colors">
            {t('login', 'password', lang)}
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            maxLength={128}
            className="w-full px-4 py-2.5 md:py-3 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-teal-500 dark:focus:border-yellow-500 focus:ring-1 focus:ring-teal-500 dark:focus:ring-yellow-500 text-sm text-gray-900 dark:text-white transition-all placeholder-gray-400 dark:placeholder-gray-600 shadow-inner"
            required
            aria-required="true"
            aria-label="Password"
          />
        </div>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/50 rounded-lg text-red-600 dark:text-red-400 text-xs md:text-sm font-medium text-center transition-colors"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          id="login-submit-btn"
          disabled={loading}
          className="w-full py-2.5 md:py-3 px-4 bg-teal-600 hover:bg-teal-500 dark:bg-yellow-500 dark:hover:bg-yellow-400 text-white dark:text-black font-black text-sm md:text-base uppercase tracking-widest rounded-lg transition-all duration-300 shadow-md disabled:opacity-50 disabled:cursor-not-allowed mt-2"
        >
          {loading ? t('login', 'processing', lang) : t('login', 'loginBtn', lang)}
        </button>
      </form>
    </div>
  );
}