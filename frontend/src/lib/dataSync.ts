import type { RealtimeChannel } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabase';

export type SyncTopic = 'settings' | 'conversations' | 'image_history' | 'library' | 'all';
type SyncSource = 'api' | 'realtime' | 'manual';

export interface DataSyncEventDetail {
  topics: SyncTopic[];
  source: SyncSource;
  reason?: string;
  at: string;
}

const DATA_SYNC_EVENT = 'ezyai:data-sync';
const DATA_SCHEMA = 'EzyAIAgent';

function canUseWindow() {
  return typeof window !== 'undefined';
}

function normalizeTopics(topics: SyncTopic[] | SyncTopic): SyncTopic[] {
  const list = Array.isArray(topics) ? topics : [topics];
  if (list.includes('all')) return ['all'];
  return Array.from(new Set(list));
}

function parseUrlPath(url: string): string {
  if (!url) return '';
  if (url.startsWith('/')) return url;
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

export function emitDataSync(topics: SyncTopic[] | SyncTopic, source: SyncSource = 'manual', reason?: string) {
  if (!canUseWindow()) return;
  const detail: DataSyncEventDetail = {
    topics: normalizeTopics(topics),
    source,
    reason,
    at: new Date().toISOString()
  };
  window.dispatchEvent(new CustomEvent<DataSyncEventDetail>(DATA_SYNC_EVENT, { detail }));
}

export function subscribeDataSync(
  listener: (detail: DataSyncEventDetail) => void,
  options?: { topics?: SyncTopic[] }
) {
  if (!canUseWindow()) return () => {};

  const allowedTopics = options?.topics ? normalizeTopics(options.topics) : null;
  const acceptsAll = !!allowedTopics?.includes('all');

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<DataSyncEventDetail>).detail;
    if (!detail) return;
    if (allowedTopics && !acceptsAll) {
      const matched = detail.topics.some((topic) => allowedTopics.includes(topic) || topic === 'all');
      if (!matched) return;
    }
    listener(detail);
  };

  window.addEventListener(DATA_SYNC_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(DATA_SYNC_EVENT, handler as EventListener);
  };
}

export function mapApiChangeToTopics(method: string, url: string): SyncTopic[] {
  const normalizedMethod = method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) {
    return [];
  }

  const path = parseUrlPath(url);
  if (!path) return [];

  if (path.startsWith('/api/settings/api-keys/reveal')) {
    return [];
  }
  if (path.startsWith('/api/settings/api-keys')) {
    return ['settings'];
  }
  if (path.startsWith('/api/conversations') || path.startsWith('/api/messages')) {
    return ['conversations'];
  }
  if (path.startsWith('/api/settings/image-gen') || path.startsWith('/api/settings/pollo')) {
    return ['image_history'];
  }
  if (path.startsWith('/api/prompt-library') || path.startsWith('/api/agents')) {
    return ['library'];
  }

  return [];
}

export function setupRealtimeDataSync(userId: string) {
  if (!isSupabaseConfigured || !userId) {
    return () => {};
  }

  const channels: RealtimeChannel[] = [];
  const filter = `user_id=eq.${userId}`;

  const watchTable = (table: string, topics: SyncTopic[]) => {
    const channel = supabase
      .channel(`sync:${table}:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: DATA_SCHEMA,
          table,
          filter
        },
        () => {
          emitDataSync(topics, 'realtime', `${table} changed`);
        }
      )
      .subscribe();

    channels.push(channel);
  };

  watchTable('api_keys_store_v2', ['settings']);
  watchTable('conversations', ['conversations']);
  watchTable('messages', ['conversations']);
  watchTable('image_generations', ['image_history']);
  watchTable('prompt_library_items', ['library']);
  watchTable('agent_profiles', ['library']);

  return () => {
    for (const channel of channels) {
      void supabase.removeChannel(channel);
    }
  };
}
