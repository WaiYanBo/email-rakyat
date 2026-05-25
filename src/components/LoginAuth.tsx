import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function LoginAuth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError('Log masuk gagal. Sila semak e-mel dan kata laluan anda.');
    } else {
      window.location.href = '/portal/dashboard'; 
    }
    
    setLoading(false);
  };

  return (
    <div className="w-full max-w-md mx-auto p-8 bg-white dark:bg-gray-900/80 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl transition-colors duration-300 animate-fade-in">
      <div className="text-center mb-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <h2 className="text-2xl font-black text-teal-800 dark:text-white uppercase tracking-wider mb-2 transition-colors">
          Portal Kakitangan
        </h2>
        <p className="text-sm text-teal-600/80 dark:text-gray-400 transition-colors">
          Sila log masuk untuk meneruskan
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-6">
        <div className="animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <label className="block text-sm font-bold text-teal-900 dark:text-gray-300 mb-2 uppercase tracking-wide transition-colors">
            E-mel
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@contoh.com"
            autoComplete="email"
            className="w-full px-4 py-3 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-teal-500 dark:focus:border-yellow-500 focus:ring-1 focus:ring-teal-500 dark:focus:ring-yellow-500 text-gray-900 dark:text-white transition-all placeholder-gray-400 dark:placeholder-gray-600 shadow-inner"
            required
          />
        </div>

        <div className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <label className="block text-sm font-bold text-teal-900 dark:text-gray-300 mb-2 uppercase tracking-wide transition-colors">
            Kata Laluan
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="w-full px-4 py-3 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-teal-500 dark:focus:border-yellow-500 focus:ring-1 focus:ring-teal-500 dark:focus:ring-yellow-500 text-gray-900 dark:text-white transition-all placeholder-gray-400 dark:placeholder-gray-600 shadow-inner"
            required
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/50 rounded-lg text-red-600 dark:text-red-400 text-sm font-medium text-center transition-colors animate-fade-in">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-500 dark:bg-yellow-500 dark:hover:bg-yellow-400 text-white dark:text-black font-black uppercase tracking-widest rounded-lg transition-all duration-300 shadow-[0_0_20px_rgba(13,148,136,0.2)] hover:shadow-[0_0_30px_rgba(13,148,136,0.4)] dark:shadow-[0_0_20px_rgba(234,179,8,0.15)] dark:hover:shadow-[0_0_30px_rgba(234,179,8,0.3)] disabled:opacity-50 disabled:cursor-not-allowed animate-fade-in"
          style={{ animationDelay: '0.25s' }}
        >
          {loading ? 'Memproses...' : 'Log Masuk'}
        </button>
      </form>
    </div>
  );
}