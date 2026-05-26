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
      console.error('Supabase Auth Error:', error);
      
      // Provide specific error messages
      if (error.message.includes('Invalid login credentials')) {
        setError('❌ Email atau kata laluan tidak betul. Sila periksa semula.');
      } else if (error.message.includes('Email not confirmed')) {
        setError('⚠️ Sila sahkan e-mel anda terlebih dahulu.');
      } else if (error.message.includes('User already exists')) {
        setError('❌ Pengguna sudah wujud. Sila log masuk.');
      } else if (error.message.includes('Unable to validate email')) {
        setError('❌ Format e-mel tidak sah.');
      } else {
        setError(`⚠️ Ralat: ${error.message}`);
      }
    } else if (data?.user) {
      console.log('Login successful:', data.user.email);
      window.location.href = '/portal'; 
    }
    
    setLoading(false);
  };

  return (
    // FIX: Changed w-full to w-[90%] on mobile, adjusted padding (p-6 md:p-8)
    <div className="w-[90%] md:w-full max-w-md mx-auto p-6 md:p-8 bg-white dark:bg-gray-900/80 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl transition-colors duration-300">
      <div className="text-center mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-black text-teal-800 dark:text-white uppercase tracking-wider mb-2 transition-colors">
          Staff Portal
        </h2>
        <p className="text-xs md:text-sm text-teal-600/80 dark:text-gray-400 transition-colors">
          Please log in to continue
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-5 md:space-y-6">
        <div>
          <label className="block text-xs md:text-sm font-bold text-teal-900 dark:text-gray-300 mb-1.5 md:mb-2 uppercase tracking-wide transition-colors">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 md:py-3 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-teal-500 dark:focus:border-yellow-500 focus:ring-1 focus:ring-teal-500 dark:focus:ring-yellow-500 text-sm text-gray-900 dark:text-white transition-all placeholder-gray-400 dark:placeholder-gray-600 shadow-inner"
            required
          />
        </div>

        <div>
          <label className="block text-xs md:text-sm font-bold text-teal-900 dark:text-gray-300 mb-1.5 md:mb-2 uppercase tracking-wide transition-colors">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 md:py-3 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-teal-500 dark:focus:border-yellow-500 focus:ring-1 focus:ring-teal-500 dark:focus:ring-yellow-500 text-sm text-gray-900 dark:text-white transition-all placeholder-gray-400 dark:placeholder-gray-600 shadow-inner"
            required
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/50 rounded-lg text-red-600 dark:text-red-400 text-xs md:text-sm font-medium text-center transition-colors">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 md:py-3 px-4 bg-teal-600 hover:bg-teal-500 dark:bg-yellow-500 dark:hover:bg-yellow-400 text-white dark:text-black font-black text-sm md:text-base uppercase tracking-widest rounded-lg transition-all duration-300 shadow-md disabled:opacity-50 disabled:cursor-not-allowed mt-2"
        >
          {loading ? 'Processing...' : 'Log In'}
        </button>
      </form>
    </div>
  );
}