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

    // This talks to the Supabase backend we just set up
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError('Log masuk gagal. Sila semak e-mel dan kata laluan anda.');
    } else {
      // Redirect the user to the portal dashboard
      window.location.href = '/portal/dashboard'; 
    }
    
    setLoading(false);
  };

  return (
    <div className="w-full max-w-md mx-auto p-8 bg-gray-900/80 backdrop-blur-md rounded-2xl border border-gray-800 shadow-2xl">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-black text-white uppercase tracking-wider mb-2">Portal Kakitangan</h2>
        <p className="text-sm text-gray-400">Sila log masuk untuk meneruskan</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-6">
        <div>
          <label className="block text-sm font-bold text-gray-300 mb-2 uppercase tracking-wide">
            E-mel
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-black/50 border border-gray-700 rounded-lg focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 text-white transition-colors"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-300 mb-2 uppercase tracking-wide">
            Kata Laluan
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-black/50 border border-gray-700 rounded-lg focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 text-white transition-colors"
            required
          />
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm font-medium text-center">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase tracking-widest rounded-lg transition-all duration-300 shadow-[0_0_20px_rgba(234,179,8,0.15)] hover:shadow-[0_0_30px_rgba(234,179,8,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Memproses...' : 'Log Masuk'}
        </button>
      </form>
    </div>
  );
}