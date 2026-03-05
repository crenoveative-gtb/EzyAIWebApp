import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

const shouldRedirectToAppRoot =
  typeof window !== 'undefined' && window.location.pathname === '/';

if (shouldRedirectToAppRoot) {
  window.location.replace(
    `${window.location.origin}/EzyAIAgent/settings/api-keys${window.location.search}${window.location.hash}`
  );
}

const basename =
  typeof window !== 'undefined' && window.location.pathname.startsWith('/EzyAIAgent')
    ? '/EzyAIAgent'
    : '/';

if (!shouldRedirectToAppRoot) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AuthProvider>
        <BrowserRouter basename={basename}>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                borderRadius: '12px',
                background: '#111827',
                color: '#f9fafb'
              }
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </StrictMode>
  );
}
