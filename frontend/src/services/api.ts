import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import { supabase } from '../lib/supabase';
import { emitDataSync, mapApiChangeToTopics } from '../lib/dataSync';

const configuredApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : '';

const api: AxiosInstance = axios.create({
  // Default to same-origin so `/api/*` can go through Vite proxy in local dev.
  baseURL: configuredApiUrl || runtimeOrigin || undefined,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json'
  }
});

let cachedAccessToken: string | null = null;
let inflightAccessTokenPromise: Promise<string | null> | null = null;

void supabase.auth
  .getSession()
  .then(({ data }) => {
    cachedAccessToken = data.session?.access_token ?? null;
  })
  .catch(() => {
    cachedAccessToken = null;
  });

supabase.auth.onAuthStateChange((_event, session) => {
  cachedAccessToken = session?.access_token ?? null;
});

async function resolveAccessToken(): Promise<string | null> {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }

  if (inflightAccessTokenPromise) {
    return inflightAccessTokenPromise;
  }

  inflightAccessTokenPromise = supabase.auth
    .getSession()
    .then(({ data }) => {
      cachedAccessToken = data.session?.access_token ?? null;
      return cachedAccessToken;
    })
    .catch((error) => {
      const message = String(error?.message || '').toLowerCase();
      const isLockTimeout = message.includes('lockmanager') || message.includes('auth-token') || message.includes('timed out');
      if (!isLockTimeout) {
        console.warn('[api] Could not resolve Supabase session token:', error?.message || error);
      }
      return cachedAccessToken;
    })
    .finally(() => {
      inflightAccessTokenPromise = null;
    });

  return inflightAccessTokenPromise;
}

api.interceptors.request.use(async (config) => {
  const token = await resolveAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (config.headers.Authorization) {
    delete config.headers.Authorization;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const serverMessage = (error.response?.data as { error?: string; message?: string } | undefined)?.error
        || (error.response?.data as { error?: string; message?: string } | undefined)?.message;

      if (serverMessage) {
        return Promise.reject(new Error(serverMessage));
      }

      if (!error.response) {
        const endpointHint = configuredApiUrl || `${runtimeOrigin}/api`;
        return Promise.reject(
          new Error(`เชื่อมต่อ backend ไม่ได้ (ตรวจสอบ backend และ API URL: ${endpointHint})`)
        );
      }
    }

    return Promise.reject(error);
  }
);

export async function get<T>(url: string, config?: AxiosRequestConfig) {
  const response = await api.get<T>(url, config);
  return response.data;
}

export async function post<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
  const response = await api.post<T>(url, data, config);
  const topics = mapApiChangeToTopics('POST', url);
  if (topics.length > 0) {
    emitDataSync(topics, 'api', `POST ${url}`);
  }
  return response.data;
}

export async function put<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
  const response = await api.put<T>(url, data, config);
  const topics = mapApiChangeToTopics('PUT', url);
  if (topics.length > 0) {
    emitDataSync(topics, 'api', `PUT ${url}`);
  }
  return response.data;
}

export async function del<T>(url: string, config?: AxiosRequestConfig) {
  const response = await api.delete<T>(url, config);
  const topics = mapApiChangeToTopics('DELETE', url);
  if (topics.length > 0) {
    emitDataSync(topics, 'api', `DELETE ${url}`);
  }
  return response.data;
}

export default api;
