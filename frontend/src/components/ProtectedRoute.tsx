import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute() {
  const { user, loading, isConfigured } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="rounded-xl bg-white border border-gray-200 px-6 py-5 shadow-sm text-gray-600 text-sm">
          กำลังตรวจสอบสิทธิ์การเข้าใช้งาน...
        </div>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md rounded-2xl bg-white border border-red-100 px-6 py-5 shadow-sm">
          <h2 className="text-base font-semibold text-red-600">Supabase ยังไม่ได้ตั้งค่า</h2>
          <p className="mt-2 text-sm text-gray-600">
            กรุณาตั้งค่า `VITE_SUPABASE_URL` และ `VITE_SUPABASE_PUBLISHABLE_KEY` ในไฟล์ environment ของ frontend
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/auth?next=${encodeURIComponent(next)}`} replace />;
  }

  return <Outlet />;
}

