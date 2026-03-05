import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import CommandPalette from '../components/CommandPalette';
import WelcomeModal from '../components/WelcomeModal';
import { useAuth } from '../context/AuthContext';

interface NavItem {
  label: string;
  icon: string;
  path: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', icon: 'bi-grid-1x2', path: '/dashboard' },
    ]
  },
  {
    title: 'AI Tools',
    items: [
      { label: 'Chat Core', icon: 'bi-chat-dots', path: '/ai-core' },
      { label: 'Image Gen', icon: 'bi-image', path: '/image-gen' },
      { label: 'Video/Audio Summarize', icon: 'bi-camera-video', path: '/media-summarize' },
      { label: 'Content Re-purpose', icon: 'bi-share', path: '/content-repurpose' },
      { label: 'Edu Tutor', icon: 'bi-mortarboard', path: '/education-tutor' },
      { label: 'Compare', icon: 'bi-layout-split', path: '/compare' },
      { label: 'Agents', icon: 'bi-robot', path: '/agents' },
      { label: 'Prompts', icon: 'bi-bookmark-star', path: '/prompts' },
    ]
  },
  {
    title: 'Settings',
    items: [
      { label: 'API Keys', icon: 'bi-key', path: '/settings/api-keys' },
      { label: 'History', icon: 'bi-clock-history', path: '/history' },
    ]
  }
];

export default function MainLayout() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('ezyai_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Apply dark mode class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('ezyai_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCmdPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success('ออกจากระบบแล้ว');
      navigate('/auth', { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ไม่สามารถออกจากระบบได้';
      toast.error(message);
    }
  };

  const userEmail = user?.email ?? 'Unknown User';
  const avatarChar = userEmail.charAt(0).toUpperCase();

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-950' : 'bg-[#f8f9fc]'} transition-colors duration-300`}>
      {/* ── Header ── */}
      <header className={`sticky top-0 z-30 border-b ${darkMode ? 'border-gray-800 bg-gray-900/80' : 'border-gray-200/60 bg-white/80'} backdrop-blur-xl transition-colors duration-300`}>
        <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <i className={`bi ${mobileMenuOpen ? 'bi-x-lg' : 'bi-list'} text-lg ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}></i>
            </button>
            {/* Collapse button (desktop) */}
            <button
              className="hidden lg:flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 transition-colors"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              <i className={`bi ${sidebarCollapsed ? 'bi-layout-sidebar-inset' : 'bi-layout-sidebar'} text-lg text-gray-500`}></i>
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200/50">
                <i className="bi bi-stars text-white text-sm"></i>
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900 leading-tight">EzyAIAgent</h1>
                <p className="text-[10px] text-gray-400 leading-none">AI Platform 2026</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Command Palette trigger */}
            <button
              onClick={() => setCmdPaletteOpen(true)}
              className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors ${darkMode ? 'border-gray-700 text-gray-400 hover:bg-gray-800' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
            >
              <i className="bi bi-search text-xs"></i>
              <span>Search</span>
              <kbd className={`px-1.5 py-0.5 text-[10px] font-mono rounded ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>⌘K</kbd>
            </button>
            {/* Dark Mode toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 ${darkMode ? 'bg-gray-800 hover:bg-gray-700 text-yellow-400' : 'hover:bg-gray-100 text-gray-500'}`}
            >
              <i className={`bi ${darkMode ? 'bi-sun-fill' : 'bi-moon-fill'} text-base`}></i>
            </button>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Online
            </span>
            <div className="hidden md:flex items-center rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 max-w-[220px]">
              <span className="truncate" title={userEmail}>
                {userEmail}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${darkMode ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            >
              <i className="bi bi-box-arrow-right"></i>
              Logout
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shadow-md">
              {avatarChar}
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* ── Mobile Overlay ── */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* ── Sidebar ── */}
        <aside
          className={`
            fixed top-[57px] left-0 z-50 h-[calc(100vh-57px)] border-r
            transition-all duration-300 ease-in-out overflow-y-auto custom-scrollbar
            lg:sticky lg:top-[57px]
            ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200/60'}
            ${mobileMenuOpen ? 'translate-x-0 w-64 shadow-2xl' : '-translate-x-full w-64 lg:translate-x-0'}
            ${sidebarCollapsed ? 'lg:w-[68px]' : 'lg:w-60'}
          `}
        >
          <nav className="p-3 space-y-5">
            {navSections.map((section) => (
              <div key={section.title}>
                {!sidebarCollapsed && (
                  <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {section.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200
                        ${sidebarCollapsed ? 'justify-center' : ''}
                        ${isActive
                          ? `${darkMode ? 'bg-indigo-900/40 text-indigo-300' : 'bg-indigo-50 text-indigo-700'} shadow-sm`
                          : `${darkMode ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <i className={`bi ${item.icon} text-base ${isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600'} transition-colors`}></i>
                          {!sidebarCollapsed && <span>{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Main Content ── */}
        <main className={`flex-1 min-w-0 transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-0' : 'lg:ml-0'}`}>
          <div className="mx-auto max-w-[1400px] p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette isOpen={cmdPaletteOpen} onClose={() => setCmdPaletteOpen(false)} />

      {/* Welcome Onboarding */}
      <WelcomeModal />
    </div>
  );
}
