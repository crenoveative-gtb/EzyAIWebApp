import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

type AuthMode = 'login' | 'signup';

export default function AuthPage() {
  const { user, loading, isConfigured, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const nextPath = useMemo(() => {
    const next = searchParams.get('next');
    if (!next || !next.startsWith('/')) {
      return '/dashboard';
    }
    return next;
  }, [searchParams]);

  useEffect(() => {
    const message = searchParams.get('error_description') ?? searchParams.get('error');
    if (message) {
      toast.error(decodeURIComponent(message));
    }
  }, [searchParams]);

  if (!loading && user) {
    return <Navigate to={nextPath} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isConfigured) {
      toast.error('Supabase ยังไม่ได้ตั้งค่า');
      return;
    }

    if (password.length < 8) {
      toast.error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      toast.error('รหัสผ่านยืนยันไม่ตรงกัน');
      return;
    }

    try {
      setSubmitting(true);

      if (mode === 'login') {
        await signIn(email, password);
        toast.success('เข้าสู่ระบบสำเร็จ');
        navigate(nextPath, { replace: true });
      } else {
        const result = await signUp(email, password);

        if (result.emailConfirmationRequired) {
          toast.success('สมัครสำเร็จ กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ');
          setMode('login');
          setPassword('');
          setConfirmPassword('');
        } else {
          toast.success('สมัครสมาชิกและเข้าสู่ระบบเรียบร้อย');
          navigate(nextPath, { replace: true });
        }
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white/95 border border-white shadow-xl shadow-indigo-100/50 backdrop-blur p-6 sm:p-7">
        <div className="text-center">
          <div className="mx-auto mb-3 w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-md">
            <i className="bi bi-shield-lock text-lg"></i>
          </div>
          <h1 className="text-xl font-bold text-gray-900">EzyAIAgent Auth</h1>
          <p className="mt-1 text-sm text-gray-500">
            เข้าสู่ระบบด้วยอีเมลเพื่อใช้งานระบบ
          </p>
        </div>

        {!isConfigured && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            ยังไม่ได้ตั้งค่า `VITE_SUPABASE_URL` หรือ `VITE_SUPABASE_PUBLISHABLE_KEY`
          </div>
        )}

        <div className="mt-6 flex rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              mode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              mode === 'signup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            สมัครสมาชิก
          </button>
        </div>

        <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Email</label>
            <input
              type="email"
              autoComplete="email"
              className="input-field"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Password</label>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="input-field"
              placeholder="อย่างน้อย 8 ตัวอักษร"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Confirm Password</label>
              <input
                type="password"
                autoComplete="new-password"
                className="input-field"
                placeholder="ยืนยันรหัสผ่าน"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || loading || !isConfigured}
            className="w-full btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting
              ? 'กำลังดำเนินการ...'
              : mode === 'login'
                ? 'Login'
                : 'สร้างบัญชี'}
          </button>
        </form>
      </div>
    </div>
  );
}

