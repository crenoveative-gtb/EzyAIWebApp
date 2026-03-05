import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MarkdownRenderer from '../components/MarkdownRenderer';
import ThreadSidebar from '../components/ThreadSidebar';
import ImageUploadButton from '../components/ImageUploadButton';
import type { ApiResponse } from '../types';
import { get, post } from '../services/api';
import { subscribeDataSync } from '../lib/dataSync';
import { supportsVision } from '../utils/visionCapability';
import toast from 'react-hot-toast';

const HISTORY_STORAGE_KEY = 'ezyai_conversation_history';

type ProviderId = 'gemini' | 'openrouter' | 'groq' | 'aimlapi';

type ProviderStatus = 'ready' | 'missing' | 'unknown';

type ProviderStatusResponse = Record<ProviderId, { hasKey: boolean }>;

type ModelOption = {
  id: string;
  title: string;
  description: string;
  badges: { label: string; className: string }[];
};

type AiTestResult = {
  provider: ProviderId;
  model: string;
  text: string;
  usage?: any;
  latencyMs?: number;
};

type AgentStep = {
  step: number;
  thought?: string;
  action: string;
  args?: Record<string, any>;
  result?: any;
  error?: { status?: number; message?: string };
};

type AgentRunResult = {
  model: string;
  goal: string;
  done: boolean;
  summary: string;
  steps: AgentStep[];
  latencyMs?: number;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  model?: string;
  provider?: ProviderId;
};

type LegacyHistoryEntry = {
  id?: string;
  provider?: string;
  model?: string;
  preview?: string;
  timestamp?: string;
  messages?: Array<{ role?: string; content?: string }>;
};

const AI_TEST_PROVIDER_STORAGE_KEY = 'ai_test_provider';
const AI_TEST_SELECTED_MODELS_STORAGE_KEY = 'ai_test_selected_models';
const CHAT_INPUT_MAX_CHARS = 3000;

const providerPriority: ProviderId[] = ['openrouter', 'groq', 'gemini', 'aimlapi'];

const providerCards: Record<ProviderId, { title: string; subtitle: string; icon: string; iconBg: string; iconText: string }> = {
  gemini: {
    title: 'Google AI (Gemini + Claude via Vertex)',
    subtitle: 'เรียกผ่าน Gemini API และ Vertex Anthropic',
    icon: 'bi-stars',
    iconBg: 'bg-blue-50',
    iconText: 'text-blue-600'
  },
  openrouter: {
    title: 'OpenRouter',
    subtitle: 'รวมหลายโมเดล (OpenAI-compatible)',
    icon: 'bi-clouds',
    iconBg: 'bg-emerald-50',
    iconText: 'text-emerald-600'
  },
  groq: {
    title: 'Groq',
    subtitle: 'OpenAI-compatible endpoint',
    icon: 'bi-lightning-charge',
    iconBg: 'bg-amber-50',
    iconText: 'text-orange-600'
  },
  aimlapi: {
    title: 'Aimlapi',
    subtitle: 'OpenAI-compatible endpoint',
    icon: 'bi-lightning-charge-fill',
    iconBg: 'bg-purple-50',
    iconText: 'text-purple-600'
  }
};

const openrouterRecommended: ModelOption[] = [
  {
    id: 'google/gemini-2.0-flash-001:free',
    title: 'Gemini 2.0 Flash (free)',
    description: 'ฉลาดมาก, Context ใหญ่ 1 ล้าน token',
    badges: [
      { label: 'Free', className: 'badge bg-emerald-100 text-emerald-800' },
      { label: '1M ctx', className: 'badge bg-blue-100 text-blue-800' }
    ]
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    title: 'Llama 3.3 70B Instruct (free)',
    description: 'ประสิทธิภาพระดับ GPT-4',
    badges: [
      { label: 'Free', className: 'badge bg-emerald-100 text-emerald-800' },
      { label: '70B', className: 'badge bg-gray-100 text-gray-700' }
    ]
  },
  {
    id: 'mistralai/mistral-7b-instruct:free',
    title: 'Mistral 7B Instruct (free)',
    description: 'เร็วและเสถียร',
    badges: [
      { label: 'Free', className: 'badge bg-emerald-100 text-emerald-800' },
      { label: 'Fast', className: 'badge bg-amber-100 text-amber-800' }
    ]
  },
  {
    id: 'deepseek/deepseek-r1:free',
    title: 'DeepSeek R1 (free)',
    description: 'เก่งเรื่องการคิดวิเคราะห์และเขียนโค้ด',
    badges: [
      { label: 'Free', className: 'badge bg-emerald-100 text-emerald-800' },
      { label: 'Reasoning', className: 'badge bg-purple-100 text-purple-800' }
    ]
  }
];

const geminiRecommended: ModelOption[] = [
  {
    id: 'claude-sonnet-4-6',
    title: 'Claude Sonnet 4.6 (Vertex)',
    description: 'โมเดล Anthropic บน Vertex AI',
    badges: [{ label: 'Vertex', className: 'badge bg-indigo-100 text-indigo-800' }, { label: 'New', className: 'badge bg-rose-100 text-rose-800' }]
  },
  {
    id: 'gemini-2.5-flash',
    title: 'Gemini 2.5 Flash',
    description: 'เร็วและฉลาด เหมาะกับงานทั่วไป (Stable)',
    badges: [{ label: 'Stable', className: 'badge bg-green-100 text-green-800' }, { label: 'Fast', className: 'badge bg-amber-100 text-amber-800' }]
  },
  {
    id: 'gemini-2.5-flash-lite',
    title: 'Gemini 2.5 Flash-Lite',
    description: 'เบา ประหยัด throughput สูง (Stable)',
    badges: [{ label: 'Stable', className: 'badge bg-green-100 text-green-800' }, { label: 'Lite', className: 'badge bg-gray-100 text-gray-700' }]
  },
  {
    id: 'gemini-2.5-pro',
    title: 'Gemini 2.5 Pro',
    description: 'คุณภาพสูง เหมาะกับงานซับซ้อน reasoning (Stable)',
    badges: [{ label: 'Stable', className: 'badge bg-green-100 text-green-800' }, { label: 'Quality', className: 'badge bg-blue-100 text-blue-800' }]
  },
  {
    id: 'gemini-3-flash-preview',
    title: 'Gemini 3 Flash (Preview)',
    description: 'รุ่นใหม่ล่าสุด เร็วและฉลาดขึ้น',
    badges: [{ label: 'Preview', className: 'badge bg-purple-100 text-purple-800' }, { label: 'New', className: 'badge bg-rose-100 text-rose-800' }]
  },
  {
    id: 'gemini-3-pro-preview',
    title: 'Gemini 3 Pro (Preview)',
    description: 'รุ่นใหม่ล่าสุด สำหรับงาน agentic ซับซ้อน',
    badges: [{ label: 'Preview', className: 'badge bg-purple-100 text-purple-800' }, { label: 'New', className: 'badge bg-rose-100 text-rose-800' }]
  }
];

const defaultSelectedModels: Record<ProviderId, string> = {
  openrouter: openrouterRecommended[0].id,
  gemini: geminiRecommended[0].id,
  groq: '',
  aimlapi: ''
};

function isProviderId(value: unknown): value is ProviderId {
  return value === 'gemini' || value === 'openrouter' || value === 'groq' || value === 'aimlapi';
}

function getInitialProvider(): ProviderId {
  if (typeof window === 'undefined') return 'openrouter';
  try {
    const savedProvider = window.localStorage.getItem(AI_TEST_PROVIDER_STORAGE_KEY);
    return isProviderId(savedProvider) ? savedProvider : 'openrouter';
  } catch {
    return 'openrouter';
  }
}

function pickStoredModel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function getInitialSelectedModels(): Record<ProviderId, string> {
  if (typeof window === 'undefined') return { ...defaultSelectedModels };
  try {
    const saved = window.localStorage.getItem(AI_TEST_SELECTED_MODELS_STORAGE_KEY);
    if (!saved) return { ...defaultSelectedModels };
    const parsed = JSON.parse(saved) as Partial<Record<ProviderId, unknown>>;
    return {
      openrouter: pickStoredModel(parsed.openrouter, defaultSelectedModels.openrouter),
      gemini: pickStoredModel(parsed.gemini, defaultSelectedModels.gemini),
      groq: pickStoredModel(parsed.groq, defaultSelectedModels.groq),
      aimlapi: pickStoredModel(parsed.aimlapi, defaultSelectedModels.aimlapi)
    };
  } catch {
    return { ...defaultSelectedModels };
  }
}

function normalizeModelsResponse(payload: any): string[] {
  const items = payload?.data?.data || payload?.data || payload?.models || [];
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => item?.id || item?.name)
    .filter((value) => typeof value === 'string' && value.trim().length > 0);
}

function formatUsage(usage: any) {
  try {
    return JSON.stringify(usage, null, 2);
  } catch {
    return String(usage);
  }
}

function formatAgentResult(result: AgentRunResult): string {
  const lines: string[] = [];
  lines.push(`### Agent Summary`);
  lines.push(result.summary || (result.done ? 'Done' : 'Stopped before done'));
  lines.push('');
  lines.push(`- model: \`${result.model}\``);
  lines.push(`- done: \`${String(result.done)}\``);
  if (typeof result.latencyMs === 'number') {
    lines.push(`- latency: \`${result.latencyMs} ms\``);
  }
  lines.push('');
  lines.push(`### Steps`);
  if (!Array.isArray(result.steps) || result.steps.length === 0) {
    lines.push('- no steps returned');
    return lines.join('\n');
  }
  for (const item of result.steps) {
    lines.push(`- [${item.step}] ${item.action}${item.thought ? ` - ${item.thought}` : ''}`);
    if (item.error?.message) {
      lines.push(`  error: ${item.error.message}`);
    }
  }
  return lines.join('\n');
}

function isChatRole(value: unknown): value is 'user' | 'assistant' | 'system' {
  return value === 'user' || value === 'assistant' || value === 'system';
}

function isProviderName(value: unknown): value is ProviderId {
  return value === 'gemini' || value === 'openrouter' || value === 'groq' || value === 'aimlapi';
}

export default function AiTest() {
  const navigate = useNavigate();
  const [providerStatus, setProviderStatus] = useState<Record<ProviderId, ProviderStatus>>({
    gemini: 'unknown',
    openrouter: 'unknown',
    groq: 'unknown',
    aimlapi: 'unknown'
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settingsSyncTick, setSettingsSyncTick] = useState(0);
  const [conversationSyncTick, setConversationSyncTick] = useState(0);

  const [provider, setProvider] = useState<ProviderId>(() => getInitialProvider());
  const [expandedProvider, setExpandedProvider] = useState<ProviderId | null>(() => getInitialProvider());
  const [selectedModels, setSelectedModels] = useState<Record<ProviderId, string>>(() => getInitialSelectedModels());
  const [modelDropdownOpen, setModelDropdownOpen] = useState<Record<ProviderId, boolean>>({
    openrouter: false,
    gemini: false,
    groq: false,
    aimlapi: false
  });
  const [modelSearch, setModelSearch] = useState<Record<ProviderId, string>>({
    openrouter: '',
    gemini: '',
    groq: '',
    aimlapi: ''
  });
  const modelDropdownRefs = useRef<Record<ProviderId, HTMLDivElement | null>>({
    openrouter: null,
    gemini: null,
    groq: null,
    aimlapi: null
  });

  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [isSending, setIsSending] = useState(false);
  const [lastMeta, setLastMeta] = useState<AiTestResult | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [didAutoSelect, setDidAutoSelect] = useState(false);

  // New: System Prompt & Agent support
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [activeAgentName, setActiveAgentName] = useState<string | null>(null);

  // Thread management
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const localHistorySessionRef = useRef<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [hasSavedHistory, setHasSavedHistory] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [agentMaxSteps, setAgentMaxSteps] = useState(6);
  const [historyMigrated, setHistoryMigrated] = useState(false);
  const [isUsageVisible, setIsUsageVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeDataSync((detail) => {
      if (detail.topics.includes('settings') || detail.topics.includes('all')) {
        setSettingsSyncTick((prev) => prev + 1);
      }
      if (detail.topics.includes('conversations') || detail.topics.includes('all')) {
        setConversationSyncTick((prev) => prev + 1);
      }
    }, { topics: ['settings', 'conversations'] });
    return unsubscribe;
  }, []);

  // Load agent config or prompt prefill from sessionStorage
  useEffect(() => {
    try {
      const agentRaw = sessionStorage.getItem('ezyai_agent_config');
      if (agentRaw) {
        const cfg = JSON.parse(agentRaw);
        if (cfg.systemPrompt) { setSystemPrompt(cfg.systemPrompt); setShowSystemPrompt(true); }
        if (cfg.provider && isProviderId(cfg.provider)) setProvider(cfg.provider);
        if (cfg.temperature != null) setTemperature(cfg.temperature);
        if (cfg.maxTokens != null) setMaxTokens(cfg.maxTokens);
        if (cfg.agentName) setActiveAgentName(cfg.agentName);
        sessionStorage.removeItem('ezyai_agent_config');
      }
      const prefill = sessionStorage.getItem('ezyai_prefill_prompt');
      if (prefill) {
        setChatInput(prefill);
        sessionStorage.removeItem('ezyai_prefill_prompt');
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      setHasSavedHistory(Array.isArray(existing) && existing.length > 0);
    } catch {
      setHasSavedHistory(false);
    }
  }, []);

  useEffect(() => {
    if (!isChatExpanded) return;
    const originalOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsChatExpanded(false);
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isChatExpanded]);

  const adjustChatInputHeight = () => {
    const textarea = chatInputRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
    const maxHeight = lineHeight * 6;
    const nextHeight = Math.max(lineHeight, Math.min(textarea.scrollHeight, maxHeight));

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  useEffect(() => {
    if (isLoading) return;
    const frame = window.requestAnimationFrame(adjustChatInputHeight);
    return () => window.cancelAnimationFrame(frame);
  }, [chatInput, isLoading]);

  const saveToHistory = (messages: ChatMessage[], options: { silent?: boolean; historyId?: string } = {}) => {
    if (messages.length < 2) return;
    try {
      const savedMessages = messages.filter((m) => !m.isError).map((m) => ({ role: m.role, content: m.content }));
      if (savedMessages.length < 2) return;

      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const historyId = options.historyId
        || (activeConversationId ? `thread_${activeConversationId}` : null)
        || localHistorySessionRef.current
        || `chat_${Date.now()}`;

      if (!activeConversationId && !localHistorySessionRef.current && !options.historyId) {
        localHistorySessionRef.current = historyId;
      }

      const existingIndex = existing.findIndex((item: any) => item?.id === historyId);
      const existingBookmarked = existingIndex >= 0 ? !!existing[existingIndex]?.bookmarked : false;
      const entry = {
        id: historyId,
        provider,
        model: effectiveModel,
        preview: messages.find((m) => m.role === 'user')?.content?.slice(0, 100) || 'Chat',
        messages: savedMessages,
        timestamp: new Date().toISOString(),
        bookmarked: existingBookmarked,
      };
      if (existingIndex >= 0) {
        existing[existingIndex] = entry;
      } else {
        existing.push(entry);
      }
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(existing));
      setHasSavedHistory(true);
      if (!options.silent) toast.success('Saved to history!');
    } catch {
      if (!options.silent) toast.error('Failed to save');
    }
  };

  const migrateLegacyLocalHistoryToDb = async () => {
    if (historyMigrated) return;
    if (typeof window === 'undefined') return;

    try {
      const summary = await get<{ success: boolean; data?: { total?: number; conversations?: Array<any> } }>('/api/conversations?limit=1&offset=0');
      const total = typeof summary?.data?.total === 'number'
        ? summary.data.total
        : (Array.isArray(summary?.data?.conversations) ? summary.data.conversations.length : 0);

      if (total > 0) {
        setHistoryMigrated(true);
        return;
      }
    } catch {
      return;
    }

    let entries: LegacyHistoryEntry[] = [];
    try {
      const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      entries = Array.isArray(parsed) ? parsed : [];
    } catch {
      entries = [];
    }

    if (entries.length === 0) {
      setHistoryMigrated(true);
      return;
    }

    const sorted = [...entries]
      .filter((entry) => Array.isArray(entry.messages) && entry.messages.length > 0)
      .sort((a, b) => Date.parse(String(a.timestamp || '')) - Date.parse(String(b.timestamp || '')));

    if (sorted.length === 0) {
      setHistoryMigrated(true);
      return;
    }

    let migratedConversations = 0;
    for (const entry of sorted.slice(0, 50)) {
      const provider = isProviderName(entry.provider) ? entry.provider : 'openrouter';
      const model = typeof entry.model === 'string' && entry.model.trim() ? entry.model.trim() : 'legacy-model';
      const titleSeed = typeof entry.preview === 'string' && entry.preview.trim()
        ? entry.preview.trim()
        : `${provider} conversation`;
      const title = titleSeed.slice(0, 80);

      try {
        const created = await post<{ success: boolean; data?: { id?: string } }>('/api/conversations', {
          title,
          provider,
          model
        });
        const conversationId = created?.data?.id;
        if (!conversationId) continue;

        const messages = Array.isArray(entry.messages) ? entry.messages : [];
        for (const message of messages) {
          const role = isChatRole(message?.role) ? message.role : 'user';
          const content = typeof message?.content === 'string' ? message.content.trim() : '';
          if (!content) continue;
          await post('/api/messages', {
            conversation_id: conversationId,
            role,
            content
          });
        }
        migratedConversations += 1;
      } catch {
        // Skip failed record and continue.
      }
    }

    if (migratedConversations > 0) {
      toast.success(`Migrated ${migratedConversations} legacy conversation(s) to DB`);
    }
    setHistoryMigrated(true);
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success('Copied!');
  };

  const [remoteModels, setRemoteModels] = useState<Record<ProviderId, string[]>>({
    gemini: [],
    openrouter: [],
    groq: [],
    aimlapi: []
  });
  const [modelFetchError, setModelFetchError] = useState<Record<ProviderId, string | null>>({
    gemini: null,
    openrouter: null,
    groq: null,
    aimlapi: null
  });
  const [isLoadingModels, setIsLoadingModels] = useState<Record<ProviderId, boolean>>({
    gemini: false,
    openrouter: false,
    groq: false,
    aimlapi: false
  });

  const hasKey = useMemo(() => {
    return {
      gemini: providerStatus.gemini === 'ready',
      openrouter: providerStatus.openrouter === 'ready',
      groq: providerStatus.groq === 'ready',
      aimlapi: providerStatus.aimlapi === 'ready'
    } satisfies Record<ProviderId, boolean>;
  }, [providerStatus]);

  const getRecommendedModels = (id: ProviderId) => {
    if (id === 'openrouter') return openrouterRecommended;
    if (id === 'gemini') return geminiRecommended;
    return [];
  };

  const effectiveModel = useMemo(() => selectedModels[provider]?.trim() || '', [selectedModels, provider]);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const response = await get<ApiResponse<ProviderStatusResponse>>('/api/settings/ai-test/providers');
        const data = response.data;
        if (!response.success || !data) {
          throw new Error(response.error || 'ไม่สามารถโหลดสถานะ API key ได้');
        }
        setProviderStatus({
          gemini: data.gemini?.hasKey ? 'ready' : 'missing',
          openrouter: data.openrouter?.hasKey ? 'ready' : 'missing',
          groq: data.groq?.hasKey ? 'ready' : 'missing',
          aimlapi: data.aimlapi?.hasKey ? 'ready' : 'missing'
        });
      } catch (error: any) {
        setProviderStatus({
          gemini: 'unknown',
          openrouter: 'unknown',
          groq: 'unknown',
          aimlapi: 'unknown'
        });
        setLoadError(error?.message || 'โหลดข้อมูลไม่สำเร็จ');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [settingsSyncTick]);

  useEffect(() => {
    if (isLoading) return;
    void migrateLegacyLocalHistoryToDb();
  }, [isLoading, historyMigrated]);

  useEffect(() => {
    if (settingsSyncTick === 0) return;
    setRemoteModels({
      gemini: [],
      openrouter: [],
      groq: [],
      aimlapi: []
    });
    setModelFetchError({
      gemini: null,
      openrouter: null,
      groq: null,
      aimlapi: null
    });
  }, [settingsSyncTick]);

  useEffect(() => {
    if (didAutoSelect) return;
    if (providerStatus[provider] === 'ready') {
      setDidAutoSelect(true);
      return;
    }
    const firstReady = providerPriority.find((id) => providerStatus[id] === 'ready');
    if (firstReady) {
      setProvider(firstReady);
      setExpandedProvider(firstReady);
      setDidAutoSelect(true);
    }
  }, [providerStatus, didAutoSelect, provider]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(AI_TEST_PROVIDER_STORAGE_KEY, provider);
    } catch {
      // Ignore write errors (private mode / quota / blocked storage)
    }
  }, [provider]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(AI_TEST_SELECTED_MODELS_STORAGE_KEY, JSON.stringify(selectedModels));
    } catch {
      // Ignore write errors (private mode / quota / blocked storage)
    }
  }, [selectedModels]);

  useEffect(() => {
    setModelDropdownOpen({
      openrouter: false,
      gemini: false,
      groq: false,
      aimlapi: false
    });
  }, [expandedProvider]);

  useEffect(() => {
    const hasOpen = Object.values(modelDropdownOpen).some(Boolean);
    if (!hasOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const refs = modelDropdownRefs.current;
      const clickedInside = Object.values(refs).some((ref) => ref && ref.contains(target));
      if (clickedInside) return;
      setModelDropdownOpen({
        openrouter: false,
        gemini: false,
        groq: false,
        aimlapi: false
      });
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [modelDropdownOpen]);

  useEffect(() => {
    const fetchModels = async (target: ProviderId) => {
      if (target !== 'groq' && target !== 'aimlapi' && target !== 'openrouter' && target !== 'gemini') return;
      if (!hasKey[target]) return;
      if (remoteModels[target].length > 0) return;
      if (isLoadingModels[target]) return;
      if (modelFetchError[target]) return;

      try {
        setIsLoadingModels((prev) => ({ ...prev, [target]: true }));
        const response = await get<ApiResponse<any>>(`/api/settings/ai-test/${target}/models`);
        if (!response.success) {
          return;
        }
        const ids = normalizeModelsResponse(response.data);
        if (ids.length > 0) {
          setRemoteModels((prev) => ({ ...prev, [target]: ids }));
          setModelFetchError((prev) => ({ ...prev, [target]: null }));
          if (target === 'openrouter') {
            const preferred = openrouterRecommended.find((m) => ids.includes(m.id))?.id || ids[0];
            setSelectedModels((prev) => ({ ...prev, [target]: prev[target] && ids.includes(prev[target]) ? prev[target] : preferred }));
          } else if (target === 'gemini') {
            const preferred = geminiRecommended.find((m) => ids.includes(m.id))?.id || ids[0];
            setSelectedModels((prev) => ({ ...prev, [target]: prev[target] && ids.includes(prev[target]) ? prev[target] : preferred }));
          } else {
            setSelectedModels((prev) => (prev[target] && ids.includes(prev[target]) ? prev : { ...prev, [target]: ids[0] }));
          }
        }
      } catch (error: any) {
        const rawMsg: string = (typeof error?.response?.data?.error === 'string' ? error.response.data.error : error?.message) || '';
        const isQuota = rawMsg.toLowerCase().includes('quota') || rawMsg.toLowerCase().includes('resource_exhausted') || (error?.response?.status === 429);
        const message = isQuota
          ? 'Quota เกินกำหนด — ใช้รายการโมเดลมาตรฐานแทน'
          : rawMsg || 'ไม่สามารถโหลดรายชื่อโมเดลได้ — ใช้รายการโมเดลมาตรฐานแทน';
        setModelFetchError((prev) => ({ ...prev, [target]: message }));
      } finally {
        setIsLoadingModels((prev) => ({ ...prev, [target]: false }));
      }
    };

    void fetchModels('openrouter');
    void fetchModels('groq');
    void fetchModels('aimlapi');
    void fetchModels('gemini');
  }, [hasKey, isLoadingModels, remoteModels, modelFetchError]);

  const updateModel = (target: ProviderId, value: string) => {
    setSelectedModels((prev) => ({ ...prev, [target]: value }));
  };

  const retryFetchModels = (target: ProviderId) => {
    setModelFetchError((prev) => ({ ...prev, [target]: null }));
    setRemoteModels((prev) => ({ ...prev, [target]: [] }));
  };

  // Thread management functions
  const loadThread = async (conversationId: string) => {
    try {
      const response = await get<{ success: boolean; data: { conversation: any; messages: any[] } }>(`/api/conversations/${conversationId}`);
      if (response.success && response.data) {
        const { conversation, messages } = response.data;

        // Restore conversation state
        setProvider(conversation.provider as ProviderId);
        setExpandedProvider(conversation.provider as ProviderId);
        setSelectedModels(prev => ({ ...prev, [conversation.provider]: conversation.model }));
        if (conversation.system_prompt) {
          setSystemPrompt(conversation.system_prompt);
          setShowSystemPrompt(true);
        }
        if (conversation.agent_name) {
          setActiveAgentName(conversation.agent_name);
        }

        // Restore messages
        const chatMsgs: ChatMessage[] = messages
          .filter(m => m.role !== 'system')
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            provider: conversation.provider,
            model: conversation.model
          }));
        setChatMessages(chatMsgs);
        setActiveConversationId(conversationId);
      }
    } catch (error) {
      console.error('Failed to load thread:', error);
      toast.error('Failed to load conversation');
    }
  };

  const createOrUpdateConversation = async (userMessage: string): Promise<string> => {
    try {
      if (activeConversationId) {
        // Message insert endpoint already updates conversation.updated_at.
        return activeConversationId;
      }

      // Create new conversation
      const title = userMessage.slice(0, 50) + (userMessage.length > 50 ? '...' : '');
      const response = await post<{ success: boolean; data: { id: string } }>('/api/conversations', {
        title,
        provider,
        model: effectiveModel,
        system_prompt: systemPrompt.trim() || undefined,
        agent_name: activeAgentName || undefined
      });

      if (response.success && response.data) {
        const newId = response.data.id;
        setActiveConversationId(newId);
        setSearchParams({ thread: newId });
        return newId;
      }
    } catch (error) {
      console.error('Failed to create/update conversation:', error);
    }
    return activeConversationId || '';
  };

  const saveMessage = async (conversationId: string, role: 'user' | 'assistant', content: string, imageUrl?: string) => {
    try {
      await post('/api/messages', {
        conversation_id: conversationId,
        role,
        content,
        image_url: imageUrl || undefined
      });
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  };

  const handleNewChat = () => {
    setChatMessages([]);
    setChatInput('');
    setActiveConversationId(null);
    localHistorySessionRef.current = null;
    setSystemPrompt('');
    setActiveAgentName(null);
    setPendingImage(null);
    setIsUsageVisible(false);
    setSearchParams({});
  };

  const handleClearChat = () => {
    const hasContent = chatMessages.length > 0 || chatInput.trim().length > 0 || pendingImage !== null;
    setChatMessages([]);
    setChatInput('');
    setPendingImage(null);
    setLastMeta(null);
    setIsUsageVisible(false);
    if (hasContent) {
      toast.success('ล้างแชทแล้ว');
    } else {
      toast('ไม่มีข้อความให้ล้าง');
    }
  };

  const toggleChatExpanded = () => {
    setIsChatExpanded((prev) => {
      const next = !prev;
      if (next) {
        // Keep expanded mode focused on chat area only.
        setSidebarVisible(false);
      }
      return next;
    });
  };

  const openConversationHistory = () => {
    if (isChatExpanded) {
      setIsChatExpanded(false);
    }
    setSidebarVisible(true);
  };

  // Load thread from URL on mount/change
  useEffect(() => {
    const threadId = searchParams.get('thread');
    if (threadId && threadId !== activeConversationId) {
      loadThread(threadId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (conversationSyncTick === 0) return;
    if (!activeConversationId || isSending) return;
    void loadThread(activeConversationId);
  }, [conversationSyncTick, activeConversationId, isSending]);

  const handleSend = async () => {
    const canRunCurrentMode = agentMode ? hasKey.gemini : hasKey[provider];
    if (!canRunCurrentMode) {
      const message = agentMode
        ? 'Agent Mode ต้องใช้ Gemini/Vertex key (ไปที่ Settings → AI API Key)'
        : providerStatus[provider] === 'unknown'
          ? 'เชื่อมต่อ backend ไม่ได้ หรือระบบไม่ตอบกลับ'
          : 'ยังไม่ได้ใส่ API key สำหรับ provider นี้';
      setChatMessages((prev) => [...prev, { role: 'assistant', content: message, isError: true }]);
      return;
    }

    if (!agentMode && !effectiveModel) {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: 'กรุณาเลือก/กรอก model ก่อน', isError: true }]);
      return;
    }

    const trimmedPrompt = chatInput.trim();
    if (!trimmedPrompt) {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: 'กรุณาพิมพ์ข้อความก่อนส่ง', isError: true }]);
      return;
    }

    const outgoingMessages = [
      ...(systemPrompt.trim() ? [{ role: 'system' as const, content: systemPrompt.trim() }] : []),
      ...chatMessages
        .filter((m) => !m.isError)
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: trimmedPrompt }
    ];

    const userChatMessage: ChatMessage = { role: 'user', content: trimmedPrompt };
    const baseMessages = [...chatMessages, userChatMessage];
    setChatMessages(baseMessages);
    setChatInput('');

    // Auto-create/update conversation and save user message
    const conversationId = await createOrUpdateConversation(trimmedPrompt);
    if (conversationId) {
      await saveMessage(conversationId, 'user', trimmedPrompt, pendingImage || undefined);
      setPendingImage(null);
    }

    try {
      setIsSending(true);
      let assistantMessage = '';
      let responseModel = effectiveModel;

      if (agentMode) {
        const agentModel = provider === 'gemini'
          ? (effectiveModel || 'claude-sonnet-4-6')
          : (selectedModels.gemini?.trim() || 'claude-sonnet-4-6');
        const contextText = [
          systemPrompt.trim() ? `System prompt:\n${systemPrompt.trim()}` : '',
          chatMessages.length > 0
            ? `Recent messages:\n${chatMessages.slice(-8).map((m) => `${m.role}: ${m.content}`).join('\n')}`
            : ''
        ].filter(Boolean).join('\n\n');
        const response = await post<ApiResponse<AgentRunResult>>('/api/agent/run', {
          goal: trimmedPrompt,
          context: contextText || undefined,
          model: agentModel,
          max_steps: agentMaxSteps
        });
        const data = response.data;
        if (!response.success || !data) {
          throw new Error(response.error || 'Agent run ไม่สำเร็จ');
        }
        setLastMeta(null);
        assistantMessage = formatAgentResult(data);
        responseModel = data.model || agentModel;
      } else {
        const response = await post<ApiResponse<AiTestResult>>('/api/settings/ai-test/chat', {
          provider,
          model: effectiveModel,
          messages: outgoingMessages,
          system_prompt: systemPrompt.trim() || undefined,
          temperature,
          max_tokens: maxTokens
        });

        const data = response.data;
        if (!response.success || !data) {
          throw new Error(response.error || 'ทดสอบโมเดลไม่สำเร็จ');
        }
        setLastMeta(data);
        assistantMessage = data.text;
        responseModel = data.model || effectiveModel;
      }

      const nextMessages: ChatMessage[] = [
        ...baseMessages,
        { role: 'assistant', content: assistantMessage, provider, model: responseModel }
      ];
      setChatMessages(nextMessages);
      saveToHistory(nextMessages, { silent: true, historyId: conversationId ? `thread_${conversationId}` : undefined });

      // Save assistant message to DB
      if (conversationId) {
        await saveMessage(conversationId, 'assistant', assistantMessage);
      }
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'ทดสอบโมเดลไม่สำเร็จ';
      const nextMessages: ChatMessage[] = [
        ...baseMessages,
        { role: 'assistant', content: message, isError: true, provider, model: effectiveModel }
      ];
      setChatMessages(nextMessages);
      saveToHistory(nextMessages, { silent: true, historyId: conversationId ? `thread_${conversationId}` : undefined });
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500"></span>
          <span>กำลังโหลด...</span>
        </div>
      </div>
    );
  }

  const hasVisionSupport = supportsVision(provider, effectiveModel);

  return (
    <div className="flex gap-0 h-[calc(100dvh-58px)] overflow-hidden -mx-6 -my-6">
      {/* Thread Sidebar with smooth transition */}
      <div className={`flex-shrink-0 transition-all duration-300 ease-in-out ${sidebarVisible ? 'w-80 opacity-100' : 'w-0 opacity-0 overflow-hidden'
        }`}>
        <ThreadSidebar
          activeThreadId={activeConversationId}
          onNewChat={handleNewChat}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with sidebar toggle */}
        {!isChatExpanded && (
        <div className="px-6 h-[70px] border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                สนทนากับโมเดลที่คุณตั้งค่า API key แล้ว
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsUsageVisible((prev) => !prev)}
                disabled={!lastMeta?.usage}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${isUsageVisible
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={lastMeta?.usage ? (isUsageVisible ? 'ซ่อน usage' : 'แสดง usage') : 'ยังไม่มี usage'}
              >
                <i className="bi bi-activity text-xs"></i>
                <span>usage</span>
              </button>
              {(activeConversationId !== null || (hasSavedHistory && chatMessages.length >= 2)) && (
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-medium hover:bg-gray-50 transition-colors"
                  title="เริ่มแชทใหม่"
                >
                  <i className="bi bi-plus-circle text-xs"></i>
                  <span>New Chat</span>
                </button>
              )}
              <button
                onClick={() => setSidebarVisible(!sidebarVisible)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${sidebarVisible
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                title={sidebarVisible ? "ซ่อนประวัติสนทนา" : "แสดงประวัติสนทนา"}
              >
                <i className={`bi ${sidebarVisible ? 'bi-clock-history' : 'bi-clock'} text-xs`}></i>
                <span>ประวัติสนทนา</span>
              </button>
            </div>
            </div>
          </div>
        )}

        {/* Scrollable content area */}
        <div className={`flex-1 ${isChatExpanded ? 'overflow-hidden p-0' : 'overflow-y-auto px-6 py-4'}`}>
          <div className={isChatExpanded ? 'h-full' : 'space-y-6'}>

            {/* Active Agent indicator */}
            {!isChatExpanded && activeAgentName && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-50 border border-purple-100 animate-fade-in">
                <i className="bi bi-robot text-purple-600"></i>
                <span className="text-xs font-medium text-purple-700">Agent: {activeAgentName}</span>
                <button onClick={() => { setActiveAgentName(null); setSystemPrompt(''); }} className="ml-auto text-xs text-purple-500 hover:text-purple-700">
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
            )}

            {!isChatExpanded && loadError && (
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
                {loadError} (เช็คว่า backend ทำงานที่ `localhost:3000`)
              </div>
            )}

            <div className={`${isChatExpanded ? 'h-full' : 'grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in-up delay-100'}`}>
              {!isChatExpanded && (
              <div className="lg:col-span-5 xl:col-span-4">
                <div className="sticky top-0 lg:h-[calc(100vh-170px)] overflow-y-auto pr-1 space-y-4">
                  <div className="bg-white rounded-2xl border border-gray-200 overflow-visible">
                    <div className="p-4 border-b border-gray-100">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">Providers</h3>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 space-y-2">
                      {(['openrouter', 'groq', 'gemini', 'aimlapi'] as ProviderId[]).map((id) => {
                        const meta = providerCards[id];
                        const status = providerStatus[id];
                        const enabled = status === 'ready';
                        const isSelected = provider === id;
                        const isExpanded = expandedProvider === id;
                        const recommended = getRecommendedModels(id);
                        const selectedValue = selectedModels[id];
                        const remoteList = remoteModels[id];
                        const isOpenrouter = id === 'openrouter';
                        const isGemini = id === 'gemini';
                        const isGroqAiml = id === 'groq' || id === 'aimlapi';
                        const hasRemoteList = (isGroqAiml || isOpenrouter) && remoteList.length > 0;
                        const openrouterRecommendedAvailable = isOpenrouter && hasRemoteList
                          ? recommended.filter((m) => remoteList.includes(m.id))
                          : recommended;
                        const selectOptions = isOpenrouter
                          ? (hasRemoteList ? remoteList : recommended.map((m) => m.id))
                          : isGemini
                            ? (remoteModels[id].length > 0 ? remoteModels[id] : recommended.map((m) => m.id))
                            : (hasRemoteList ? remoteList : []);

                        const normalizedSelectedValue = selectOptions.length > 0
                          ? (selectOptions.includes(selectedValue) ? selectedValue : selectOptions[0])
                          : selectedValue;
                        const searchValue = modelSearch[id];
                        const filteredModels = selectOptions.filter((modelId) =>
                          modelId.toLowerCase().includes(searchValue.trim().toLowerCase())
                        );

                        return (
                          <div
                            key={id}
                            className={`rounded-2xl border transition-all ${isSelected
                              ? 'border-indigo-200 bg-indigo-50/30'
                              : 'border-gray-200 bg-white'
                              } ${enabled ? '' : 'opacity-80'}`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setProvider(id);
                                setExpandedProvider((prev) => (prev === id ? null : id));
                              }}
                              className="w-full text-left p-4"
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-xl ${meta.iconBg} flex items-center justify-center`}>
                                  <i className={`bi ${meta.icon} ${meta.iconText} text-lg`}></i>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-gray-900 truncate">{meta.title}</div>
                                      <div className="text-xs text-gray-500 mt-0.5">{meta.subtitle}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={enabled ? 'badge badge-success' : status === 'unknown' ? 'badge bg-rose-100 text-rose-700' : 'badge bg-gray-100 text-gray-600'}>
                                        {enabled ? 'พร้อมใช้งาน' : status === 'unknown' ? 'เชื่อมต่อไม่ได้' : 'ยังไม่ได้ใส่'}
                                      </span>
                                      <span className="text-gray-400">
                                        <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`}></i>
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="px-4 pb-4">
                                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-gray-700">Model Selector</span>
                                    {enabled ? (
                                      <span className="text-xs text-gray-400">เลือกโมเดลสำหรับ provider นี้</span>
                                    ) : (
                                      <span className="text-xs text-amber-600">ยังไม่ได้ใส่ API key</span>
                                    )}
                                  </div>

                                  {(isOpenrouter || isGemini || hasRemoteList) && (
                                    <>
                                      <div className="relative" ref={(node) => { modelDropdownRefs.current[id] = node; }}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!enabled) return;
                                            setModelDropdownOpen((prev) => ({
                                              openrouter: id === 'openrouter' ? !prev.openrouter : false,
                                              gemini: id === 'gemini' ? !prev.gemini : false,
                                              groq: id === 'groq' ? !prev.groq : false,
                                              aimlapi: id === 'aimlapi' ? !prev.aimlapi : false
                                            }));
                                            setModelSearch((prev) => ({ ...prev, [id]: '' }));
                                          }}
                                          disabled={!enabled}
                                          className="input-field input-field-sm flex items-center justify-between gap-2"
                                        >
                                          <span className={normalizedSelectedValue ? 'text-gray-900' : 'text-gray-400'}>
                                            {normalizedSelectedValue || 'เลือกโมเดล'}
                                          </span>
                                          <i
                                            className={`bi ${modelDropdownOpen[id] ? 'bi-chevron-up' : 'bi-chevron-down'} text-gray-400`}
                                          ></i>
                                        </button>

                                        {modelDropdownOpen[id] && (
                                          <div className="absolute z-30 mt-2 w-full rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
                                            <div className="p-2 border-b border-gray-100">
                                              <div className="relative">
                                                <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                                <input
                                                  className="input-field input-field-sm pl-8"
                                                  placeholder="ค้นหาโมเดล"
                                                  value={searchValue}
                                                  onChange={(event) => setModelSearch((prev) => ({ ...prev, [id]: event.target.value }))}
                                                  disabled={!enabled}
                                                />
                                              </div>
                                            </div>
                                            <div className="max-h-60 overflow-y-auto">
                                              {selectOptions.length === 0 ? (
                                                <div className="px-4 py-3 text-sm text-gray-500">ยังไม่มีรายชื่อโมเดล</div>
                                              ) : filteredModels.length === 0 ? (
                                                <div className="px-4 py-3 text-sm text-gray-500">ไม่พบโมเดลที่ค้นหา</div>
                                              ) : (
                                                filteredModels.map((modelId) => {
                                                  const isSelectedModel = modelId === normalizedSelectedValue;
                                                  return (
                                                    <button
                                                      key={modelId}
                                                      type="button"
                                                      onClick={() => {
                                                        updateModel(id, modelId);
                                                        setModelDropdownOpen({
                                                          openrouter: false,
                                                          gemini: false,
                                                          groq: false,
                                                          aimlapi: false
                                                        });
                                                        setModelSearch((prev) => ({ ...prev, [id]: '' }));
                                                      }}
                                                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                                                    >
                                                      <span className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full ${isSelectedModel ? 'bg-indigo-500' : 'bg-gray-300'}`}></span>
                                                        <span className={isSelectedModel ? 'font-semibold text-indigo-700' : 'text-gray-700'}>
                                                          {modelId}
                                                        </span>
                                                      </span>
                                                    </button>
                                                  );
                                                })
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      {isOpenrouter && hasRemoteList && openrouterRecommendedAvailable.length === 0 && (
                                        <div className="text-xs text-rose-600">
                                          โมเดลที่แนะนำไม่รองรับใน key นี้ — กรุณาเลือกจากรายการใน dropdown
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {isGroqAiml && (
                                    <>
                                      {!hasRemoteList && (
                                        <input
                                          value={selectedValue}
                                          onChange={(event) => updateModel(id, event.target.value)}
                                          disabled={!enabled}
                                          className="input-field input-field-sm"
                                          placeholder="พิมพ์ชื่อโมเดล (เช่น llama-3.1-70b-versatile)"
                                        />
                                      )}

                                      {isLoadingModels[id] && (
                                        <div className="text-xs text-gray-500 flex items-center gap-2">
                                          <i className="bi bi-arrow-repeat animate-spin"></i>
                                          กำลังโหลดรายชื่อโมเดล...
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {modelFetchError[id] && (
                                    <div className="text-xs text-rose-600 flex items-center justify-between">
                                      <span>{modelFetchError[id]}</span>
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          retryFetchModels(id);
                                        }}
                                        className="text-rose-600 hover:text-rose-800 font-medium"
                                      >
                                        ลองอีกครั้ง
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* System Prompt (collapsible) */}
                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                      className="w-full text-left p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <i className="bi bi-terminal text-gray-500"></i>
                        <span className="text-sm font-semibold text-gray-900">System Prompt</span>
                        {systemPrompt.trim() && <span className="w-2 h-2 rounded-full bg-indigo-500"></span>}
                      </div>
                      <i className={`bi bi-chevron-${showSystemPrompt ? 'up' : 'down'} text-gray-400 text-sm`}></i>
                    </button>
                    {showSystemPrompt && (
                      <div className="px-4 pb-4">
                        <textarea
                          value={systemPrompt}
                          onChange={(e) => setSystemPrompt(e.target.value)}
                          className="input-modern text-sm font-mono min-h-[80px] resize-y"
                          placeholder="You are a helpful assistant..."
                        />
                        <p className="text-[10px] text-gray-400 mt-1">คำสั่งระบบที่จะส่งก่อนทุกข้อความ</p>
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <div className="p-5 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900">Run Settings</h3>
                      <p className="text-xs text-gray-500 mt-1">ตั้งค่าพารามิเตอร์สำหรับการทดสอบ</p>
                    </div>

                    <div className="p-5 space-y-4">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold text-gray-800">Agent Mode</div>
                            <div className="text-[11px] text-gray-500">ใช้ tool loop สำหรับงานพัฒนาโค้ดหลายสเต็ป</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAgentMode((prev) => !prev)}
                            className={`inline-flex h-7 w-12 items-center rounded-full transition-colors ${agentMode ? 'bg-indigo-600' : 'bg-gray-300'}`}
                            aria-label="Toggle Agent mode"
                          >
                            <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${agentMode ? 'translate-x-6' : 'translate-x-1'}`}></span>
                          </button>
                        </div>
                        {agentMode && (
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-gray-700">Agent max steps</label>
                              <input
                                type="number"
                                min={1}
                                max={10}
                                step={1}
                                value={agentMaxSteps}
                                onChange={(e) => setAgentMaxSteps(Number(e.target.value))}
                                className="input-field"
                              />
                            </div>
                            <div className="flex items-end">
                              <div className="text-[11px] text-gray-500">
                                Agent จะใช้ model ฝั่ง Gemini/Vertex และรัน tool อัตโนมัติใน workspace
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs">
                        <span className="text-gray-500">Model ที่เลือก</span>
                        <span className="font-medium text-gray-700">{effectiveModel || '—'}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-gray-700">Temperature</label>
                          <input
                            type="number"
                            min={0}
                            max={2}
                            step={0.1}
                            value={temperature}
                            onChange={(e) => setTemperature(Number(e.target.value))}
                            className="input-field"
                            disabled={!hasKey[provider]}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-gray-700">Max tokens</label>
                          <input
                            type="number"
                            min={64}
                            max={8192}
                            step={64}
                            value={maxTokens}
                            onChange={(e) => setMaxTokens(Number(e.target.value))}
                            className="input-field"
                            disabled={!hasKey[provider]}
                          />
                        </div>
                      </div>

                      {((agentMode && !hasKey.gemini) || (!agentMode && !hasKey[provider])) && (
                        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
                          {agentMode
                            ? (!hasKey.gemini
                              ? 'Agent Mode ต้องมี Gemini/Vertex key (ไปที่ Settings → AI API Key ก่อน)'
                              : 'พร้อมใช้งาน')
                            : (providerStatus[provider] === 'unknown'
                              ? 'เชื่อมต่อ backend ไม่ได้ (เช็คว่า backend ทำงานที่ :3000)'
                              : 'ยังไม่ได้ใส่ API key สำหรับ provider นี้ (ไปที่ Settings → AI API Key ก่อน)')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              )}

              <div className={`${isChatExpanded ? 'h-full w-full bg-white p-4 lg:p-6' : 'lg:col-span-7 xl:col-span-8 space-y-6'}`}>
                <div className={`bg-white rounded-2xl border border-gray-200 overflow-hidden ${isChatExpanded ? 'h-full flex flex-col' : chatMessages.length === 0 ? 'lg:h-[calc(100dvh-170px)] flex flex-col' : ''}`}>
                  <div className={`p-5 space-y-4 ${isChatExpanded || chatMessages.length === 0 ? 'h-full flex flex-col min-h-0' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge bg-indigo-100 text-indigo-800">{provider}</span>
                        <span className="badge bg-gray-100 text-gray-700">{effectiveModel || '—'}</span>
                        {agentMode && <span className="badge bg-violet-100 text-violet-800">agent</span>}
                        {lastMeta?.usage && <span className="badge bg-emerald-100 text-emerald-800">usage</span>}
                      </div>
                      {isChatExpanded ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsUsageVisible((prev) => !prev)}
                            disabled={!lastMeta?.usage}
                            className={`inline-flex h-8 min-w-[104px] items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${isUsageVisible
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title={lastMeta?.usage ? (isUsageVisible ? 'ซ่อน usage' : 'แสดง usage') : 'ยังไม่มี usage'}
                          >
                            <i className="bi bi-activity text-xs"></i>
                            <span>usage</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleNewChat}
                            className="inline-flex h-8 min-w-[104px] items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            title="เริ่มแชทใหม่"
                          >
                            <i className="bi bi-plus-circle text-xs"></i>
                            <span>New Chat</span>
                          </button>
                          <button
                            type="button"
                            onClick={openConversationHistory}
                            className="inline-flex h-8 min-w-[104px] items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            title="เปิดประวัติสนทนา"
                          >
                            <i className="bi bi-clock-history text-xs"></i>
                            <span>ประวัติสนทนา</span>
                          </button>
                          <button
                            type="button"
                            onClick={toggleChatExpanded}
                            className="inline-flex h-8 min-w-[104px] items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            title="ย่อกลับขนาดเดิม"
                          >
                            <i className="bi bi-fullscreen-exit"></i>
                            <span>ย่อกลับ</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={toggleChatExpanded}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          title="ขยายเต็มจอ"
                        >
                          <i className="bi bi-arrows-fullscreen"></i>
                          <span>ขยาย</span>
                        </button>
                      )}
                    </div>

                    <div className={`rounded-2xl border border-gray-200 bg-gray-50 p-4 overflow-y-auto space-y-3 ${isChatExpanded || chatMessages.length === 0 ? 'flex-1 min-h-0' : 'h-[360px]'}`}>
                      {chatMessages.length === 0 ? (
                        <div className="text-sm text-gray-500">ยังไม่มีข้อความ — พิมพ์ข้อความเพื่อเริ่มแชท</div>
                      ) : (
                        chatMessages.map((message, index) => (
                          <div
                            key={`${message.role}-${index}`}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`${message.role === 'user' ? 'max-w-[80%]' : 'w-full max-w-full'} rounded-2xl px-4 py-3 text-sm ${message.role === 'assistant' && !message.isError ? 'whitespace-normal' : 'whitespace-pre-wrap'} ${message.role === 'user'
                                ? 'bg-indigo-600 text-white'
                                : message.isError
                                  ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                  : 'bg-white text-gray-800 border border-gray-200'
                                }`}
                            >
                              {message.role === 'user' ? (
                                <div className="whitespace-pre-wrap break-words">{message.content}</div>
                              ) : message.isError ? (
                                <div className="whitespace-pre-wrap break-words">{message.content}</div>
                              ) : (
                                <MarkdownRenderer content={message.content} />
                              )}
                              <div className="flex items-center gap-1.5 mt-2">
                                {message.role === 'assistant' && message.model && (
                                  <span className="text-[11px] text-gray-400">model: {message.model}</span>
                                )}
                                <div className="flex items-center gap-0.5 ml-auto">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); copyMessage(message.content); }}
                                    className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors px-1 py-0.5 rounded"
                                    title="Copy"
                                  >
                                    <i className="bi bi-clipboard"></i>
                                  </button>
                                  {message.role === 'assistant' && !message.isError && (
                                    <>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          // Find the user message right before this assistant message
                                          const userMsg = chatMessages.slice(0, index).reverse().find(m => m.role === 'user');
                                          if (userMsg) {
                                            setChatInput(userMsg.content);
                                            toast('Prompt restored — click Send to re-generate', { icon: '🔄' });
                                          }
                                        }}
                                        className="text-[11px] text-gray-400 hover:text-indigo-600 transition-colors px-1 py-0.5 rounded"
                                        title="Re-generate"
                                      >
                                        <i className="bi bi-arrow-repeat"></i>
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const btn = e.currentTarget;
                                          btn.classList.add('text-emerald-500');
                                          toast.success('Rated 👍');
                                        }}
                                        className="text-[11px] text-gray-400 hover:text-emerald-500 transition-colors px-1 py-0.5 rounded"
                                        title="Good response"
                                      >
                                        <i className="bi bi-hand-thumbs-up"></i>
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const btn = e.currentTarget;
                                          btn.classList.add('text-red-500');
                                          toast('Rated 👎', { icon: '📝' });
                                        }}
                                        className="text-[11px] text-gray-400 hover:text-red-500 transition-colors px-1 py-0.5 rounded"
                                        title="Poor response"
                                      >
                                        <i className="bi bi-hand-thumbs-down"></i>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-[5px] rounded-2xl border border-gray-200 bg-white overflow-hidden">
                      <div className="px-5 py-4">
                        <textarea
                          ref={chatInputRef}
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value.slice(0, CHAT_INPUT_MAX_CHARS))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              handleSend();
                            }
                          }}
                          rows={1}
                          className="w-full resize-none border-0 bg-transparent text-[14px] leading-5 text-gray-800 placeholder:text-gray-500 focus:outline-none focus:ring-0"
                          placeholder="Send a message"
                        />
                      </div>
                      <div className="border-t border-gray-200 bg-gray-50/40 px-4 py-0 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[13px]">
                          <div className="inline-flex items-center gap-1.5 text-gray-700">
                            {hasVisionSupport && activeConversationId ? (
                              <ImageUploadButton
                                conversationId={activeConversationId}
                                onImageUploaded={(url) => setPendingImage(url)}
                                disabled={isSending}
                              />
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="text-gray-300 p-2 rounded-lg cursor-not-allowed"
                                title={effectiveModel ? 'Text-only model' : 'กรุณาเลือกโมเดลก่อน'}
                              >
                                <i className="bi bi-paperclip text-lg"></i>
                              </button>
                            )}
                            <span>Attach</span>
                          </div>
                          <span className="h-5 w-px bg-gray-200"></span>
                          <button
                            type="button"
                            onClick={() => navigate('/prompts')}
                            className="inline-flex items-center gap-1.5 text-gray-700 hover:text-gray-900 transition-colors"
                          >
                            <i className="bi bi-braces-asterisk"></i>
                            <span>Browse Prompts</span>
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleClearChat}
                            className="text-xs px-3 py-1.5 rounded-lg text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                          >
                            ล้างแชท
                          </button>
                          <div className="text-[12px] text-gray-500">
                            {chatInput.length.toLocaleString()} / {CHAT_INPUT_MAX_CHARS.toLocaleString()}
                          </div>
                          <button
                            type="button"
                            onClick={handleSend}
                            disabled={isSending || chatInput.trim().length === 0}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Send message"
                          >
                            <i className={`bi ${isSending ? 'bi-arrow-repeat animate-spin' : 'bi-send'} text-sm`}></i>
                          </button>
                        </div>
                      </div>
                    </div>

                    {isUsageVisible && lastMeta?.usage && (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
                        <div className="font-medium text-gray-600 mb-2">usage</div>
                        <pre className="whitespace-pre-wrap break-words leading-relaxed">
                          {formatUsage(lastMeta.usage)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
