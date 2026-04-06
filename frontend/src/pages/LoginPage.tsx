import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../hooks/useAuth';
import { api, ApiError } from '../services/api';
import { Mail, User, KeyRound, Loader2, ArrowRight } from 'lucide-react';
import { useTranslation } from '../i18n/I18nContext';

export default function LoginPage() {
  const [authMethod, setAuthMethod] = useState<'main' | 'otp-email' | 'otp-verify'>('main');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [department, setDepartment] = useState('');
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (isAuthenticated) {
    navigate('/');
    return null;
  }

  const handleGoogleSuccess = async (credentialResponse: any) => {
    if (!credentialResponse.credential) return;
    setLoading(true);
    setError('');

    try {
      const result = await api.googleAuth(credentialResponse.credential);
      if (result.error) {
        setError(result.reason || result.error);
        return;
      }
      login(result.token, result.email, result.name, result.refreshToken);
      navigate('/');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Google sign-in failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await api.validateEmail(email.trim().toLowerCase(), name.trim());
      if (result.valid) {
        setDepartment(result.department || '');
        setAuthMethod('otp-verify');
      } else {
        setError(result.reason || 'Email not allowed');
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to validate email. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await api.verifyOtp(email.trim().toLowerCase(), otp.trim(), name.trim());
      if (result.verified) {
        login(result.token, email.trim().toLowerCase(), name.trim(), result.refreshToken);
        navigate('/');
      } else {
        setError(result.reason || 'Invalid OTP');
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to verify OTP. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-2 dark:text-white">{t('app.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400 text-center mb-8">{t('login.title')}</p>

        {authMethod === 'main' && (
          <div className="space-y-5">
            {/* Google Sign-In (Primary) */}
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Google sign-in failed')}
                text="signin_with"
                shape="rectangular"
                size="large"
                width="350"
                logo_alignment="left"
              />
            </div>

            {loading && (
              <div className="flex justify-center">
                <Loader2 size={20} className="animate-spin text-primary-500" />
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>
            )}

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-white dark:bg-gray-800 text-gray-400">or</span>
              </div>
            </div>

            {/* OTP Fallback */}
            <button
              onClick={() => { setAuthMethod('otp-email'); setError(''); }}
              className="w-full flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <Mail size={18} />
              Sign in with Email OTP
            </button>

            <p className="text-xs text-gray-400 text-center">
              Use your university Google account for one-click access.
              <br />
              OTP available as a fallback option.
            </p>
          </div>
        )}

        {authMethod === 'otp-email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Keval Patel"
                  required
                  className="w-full pl-10 pr-4 py-2.5 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">University Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="23itub017@ddu.ac.in"
                  required
                  className="w-full pl-10 pr-4 py-2.5 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !name}
              className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              {t('login.otp')}
            </button>

            <button
              type="button"
              onClick={() => { setAuthMethod('main'); setError(''); }}
              className="w-full text-sm text-gray-500 hover:text-primary-600"
            >
              ← Back to sign in options
            </button>
          </form>
        )}

        {authMethod === 'otp-verify' && (
          <form onSubmit={handleOtpSubmit} className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
              <p className="text-blue-700 dark:text-blue-300">
                OTP sent to <strong>{email}</strong>
              </p>
              {department && (
                <p className="text-blue-600 dark:text-blue-400 mt-1">Department: {department}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Enter OTP</label>
              <div className="relative">
                <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  required
                  maxLength={6}
                  className="w-full pl-10 pr-4 py-2.5 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-center text-lg tracking-widest bg-white dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {t('login.verify')}
            </button>

            <button
              type="button"
              onClick={() => { setAuthMethod('otp-email'); setOtp(''); setError(''); }}
              className="w-full text-sm text-gray-500 hover:text-primary-600"
            >
              ← Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
