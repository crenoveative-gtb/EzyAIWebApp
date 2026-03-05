import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import toast from 'react-hot-toast';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { get, post } from '../services/api';
import { subscribeDataSync } from '../lib/dataSync';
import type { ApiResponse } from '../types';

type ProviderId = 'gemini' | 'openrouter' | 'groq' | 'aimlapi';
type ProviderStatus = 'ready' | 'missing' | 'unknown';
type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  model?: string;
  isError?: boolean;
}

interface LearnerProfile {
  examGoal: string;
  focusTopics: string;
  weakTopics: string;
  learningStyle: 'visual' | 'auditory' | 'reading' | 'kinesthetic' | 'mixed';
  responseLanguage: 'th' | 'en' | 'bilingual';
}

interface TutorConfig {
  mode: 'socratic' | 'hybrid' | 'exam';
  difficulty: number;
  temperature: number;
  maxTokens: number;
}

interface TutorInsights {
  readiness: number;
  engagement: number;
  nextFocus: string;
  confusionFlags: string[];
  tasks: string[];
  lastCheckQuestion: string;
}

interface TutorMeta {
  readiness_score?: unknown;
  engagement_score?: unknown;
  next_focus?: unknown;
  confusion_flags?: unknown;
  recommended_tasks?: unknown;
  check_question?: unknown;
}

interface ProviderStatusResponse {
  [key: string]: {
    hasKey?: boolean;
  };
}

interface TutorResult {
  provider: ProviderId;
  model: string;
  text: string;
}

const PROVIDERS: ProviderId[] = ['openrouter', 'groq', 'gemini', 'aimlapi'];
const META_REGEX = /<TUTOR_META>([\s\S]*?)<\/TUTOR_META>/i;
const CHAT_INPUT_MAX = 3000;

const PROFILE_STORAGE_KEY = 'ezyai_edu_tutor_profile_v1';
const CONFIG_STORAGE_KEY = 'ezyai_edu_tutor_config_v1';
const PROVIDER_STORAGE_KEY = 'ezyai_edu_tutor_provider_v1';
const MODEL_STORAGE_KEY = 'ezyai_edu_tutor_model_v1';

const defaultProfile: LearnerProfile = {
  examGoal: 'TCAS / Entrance',
  focusTopics: 'คณิตศาสตร์, ภาษาอังกฤษ',
  weakTopics: 'พีชคณิต, Reading',
  learningStyle: 'mixed',
  responseLanguage: 'th'
};

const defaultConfig: TutorConfig = {
  mode: 'socratic',
  difficulty: 3,
  temperature: 0.35,
  maxTokens: 900
};

const defaultModels: Record<ProviderId, string> = {
  openrouter: 'google/gemini-2.0-flash-001:free',
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.5-flash',
  aimlapi: 'gpt-4o-mini'
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isProviderId(value: unknown): value is ProviderId {
  return value === 'gemini' || value === 'openrouter' || value === 'groq' || value === 'aimlapi';
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // noop
  }
}

function parseLooseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0)
    )
  );
}

function parseTutorMeta(raw: string): TutorMeta | null {
  const normalized = raw
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim();
  if (!normalized) return null;
  try {
    return JSON.parse(normalized) as TutorMeta;
  } catch {
    return null;
  }
}

function extractTutorMeta(text: string): { cleanText: string; meta: TutorMeta | null } {
  const match = text.match(META_REGEX);
  if (!match) return { cleanText: text.trim(), meta: null };
  return {
    cleanText: text.replace(META_REGEX, '').trim(),
    meta: parseTutorMeta(match[1])
  };
}

function collectRecentAssistantQuestions(messages: ChatMessage[]): string[] {
  const questions: string[] = [];
  for (let index = messages.length - 1; index >= 0 && questions.length < 4; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') continue;
    const candidates = message.content
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^[-*\d.)\s]+/, ''))
      .filter((line) => line.length > 0 && (line.includes('?') || line.endsWith('ไหม')));
    for (const question of candidates) {
      if (!questions.includes(question)) questions.push(question);
      if (questions.length >= 4) break;
    }
  }
  return questions.slice(0, 4);
}

function buildModeContract(config: TutorConfig): string[] {
  if (config.mode === 'exam') {
    return [
      'Response contract (Exam Drill):',
      '- Give a short drill set (2-3 items max) matched to difficulty.',
      '- Keep answer key hidden unless learner requests "เฉลย".',
      '- End with exactly 1 check question.'
    ];
  }
  if (config.mode === 'hybrid') {
    return [
      'Response contract (Hybrid):',
      '- Give a concise explanation (max 6 lines) then 1 guided practice.',
      '- Add only the most important formula/rule if needed.',
      '- End with exactly 1 check question.'
    ];
  }
  return [
    'Response contract (Socratic):',
    '- If learner answer is correct: acknowledge in 1 short line and move to a harder question.',
    '- If learner answer is incorrect: give exactly 1 hint, then ask learner to retry.',
    '- Ask exactly 1 next question (not 2-3 questions at once).',
    '- Keep each reply concise (around 80-180 words).'
  ];
}

function sanitizeTutorReply(text: string, mode: TutorConfig['mode'], fallbackQuestion: string): string {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd());

  const seen = new Set<string>();
  const cleanedLines: string[] = [];
  for (const line of lines) {
    const normalized = line.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!normalized) {
      if (cleanedLines[cleanedLines.length - 1] !== '') cleanedLines.push('');
      continue;
    }
    const duplicateKey = normalized.replace(/[^a-z0-9\u0E00-\u0E7F\s?]/gi, '').trim();
    if (duplicateKey.length >= 16 && seen.has(duplicateKey)) continue;
    seen.add(duplicateKey);
    cleanedLines.push(line);
  }

  let cleaned = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (mode === 'socratic' && cleaned.length > 1300) {
    cleaned = cleaned.slice(0, 1300).trimEnd();
  }
  if (cleaned && !/[?？]/.test(cleaned)) {
    const question = fallbackQuestion.trim();
    const questionLine = question ? (/[?？]$/.test(question) ? question : `${question}?`) : 'ช่วยตอบคำถามเช็กความเข้าใจต่ออีก 1 ข้อได้ไหม?';
    cleaned = `${cleaned}\n\nคำถามเช็กความเข้าใจ: ${questionLine}`;
  }
  return cleaned;
}

function buildTutorSystemPrompt(
  profile: LearnerProfile,
  config: TutorConfig,
  insights: TutorInsights,
  recentMessages: ChatMessage[]
): string {
  const languageInstruction =
    profile.responseLanguage === 'th'
      ? 'ตอบภาษาไทย'
      : profile.responseLanguage === 'en'
        ? 'ตอบภาษาอังกฤษ'
        : 'ตอบแบบ bilingual Thai + English';

  const recentQuestions = collectRecentAssistantQuestions(recentMessages);
  const lastLearnerMessage = [...recentMessages].reverse().find((message) => message.role === 'user')?.content.trim() || '';
  const modeContract = buildModeContract(config);

  return [
    'You are Ezy Adaptive Tutor, a personal exam coach.',
    languageInstruction,
    `Target exam: ${profile.examGoal}`,
    `Focus topics: ${profile.focusTopics}`,
    `Weak topics: ${profile.weakTopics}`,
    `Learning style: ${profile.learningStyle}`,
    `Teaching mode: ${config.mode}, difficulty: ${config.difficulty}/5`,
    `Current readiness: ${insights.readiness}, engagement: ${insights.engagement}`,
    `Current next focus: ${insights.nextFocus || 'choose the most urgent topic'}`,
    `Recent assistant questions (avoid repeating): ${recentQuestions.length > 0 ? recentQuestions.join(' | ') : 'none'}`,
    `Latest learner message (do not echo verbatim): ${lastLearnerMessage.slice(0, 220) || 'none'}`,
    'Rules:',
    '1) Always include exactly one understanding-check question in each reply.',
    '2) Never repeat learner text verbatim and never restate the same idea twice.',
    '3) Prefer step-by-step coaching over long lecture.',
    '4) Use concise Markdown. No JSON body and no code fence.',
    ...modeContract,
    'Append metadata at the end exactly in this format:',
    '<TUTOR_META>{"readiness_score":0-100,"engagement_score":0-100,"next_focus":"...","confusion_flags":["..."],"recommended_tasks":["..."],"check_question":"..."}</TUTOR_META>',
    'Metadata must be valid JSON and not in code fence.'
  ].join('\n');
}

function mergeInsights(current: TutorInsights, meta: TutorMeta | null, userText: string): TutorInsights {
  const readiness = parseLooseNumber(meta?.readiness_score);
  const engagement = parseLooseNumber(meta?.engagement_score);
  const nextFocus = typeof meta?.next_focus === 'string' ? meta.next_focus.trim() : '';
  const checkQuestion = typeof meta?.check_question === 'string' ? meta.check_question.trim() : '';
  const confusionFlags = normalizeStringList(meta?.confusion_flags);
  const tasks = normalizeStringList(meta?.recommended_tasks);

  return {
    readiness: readiness === null ? clamp(current.readiness + (userText.length > 70 ? 2 : -1), 0, 100) : clamp(Math.round(readiness), 0, 100),
    engagement: engagement === null ? clamp(current.engagement + (userText.includes('?') ? 2 : 1), 0, 100) : clamp(Math.round(engagement), 0, 100),
    nextFocus: nextFocus || current.nextFocus,
    confusionFlags: Array.from(new Set([...confusionFlags, ...current.confusionFlags])).slice(0, 5),
    tasks: Array.from(new Set([...tasks, ...current.tasks])).slice(0, 5),
    lastCheckQuestion: checkQuestion || current.lastCheckQuestion
  };
}

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function EduTutorPage() {
  const [providerStatus, setProviderStatus] = useState<Record<ProviderId, ProviderStatus>>({
    gemini: 'unknown',
    openrouter: 'unknown',
    groq: 'unknown',
    aimlapi: 'unknown'
  });
  const [provider, setProvider] = useState<ProviderId>(() => {
    const stored = readStorage<string>(PROVIDER_STORAGE_KEY, 'openrouter');
    return isProviderId(stored) ? stored : 'openrouter';
  });
  const [selectedModel, setSelectedModel] = useState<Record<ProviderId, string>>(() => {
    const stored = readStorage<Partial<Record<ProviderId, string>>>(MODEL_STORAGE_KEY, {});
    return {
      openrouter: stored.openrouter?.trim() || defaultModels.openrouter,
      groq: stored.groq?.trim() || defaultModels.groq,
      gemini: stored.gemini?.trim() || defaultModels.gemini,
      aimlapi: stored.aimlapi?.trim() || defaultModels.aimlapi
    };
  });

  const [profile, setProfile] = useState<LearnerProfile>(() =>
    readStorage<LearnerProfile>(PROFILE_STORAGE_KEY, defaultProfile)
  );
  const [config, setConfig] = useState<TutorConfig>(() =>
    readStorage<TutorConfig>(CONFIG_STORAGE_KEY, defaultConfig)
  );
  const [insights, setInsights] = useState<TutorInsights>({
    readiness: 48,
    engagement: 68,
    nextFocus: 'พื้นฐานที่ยังไม่แม่น',
    confusionFlags: [],
    tasks: [],
    lastCheckQuestion: ''
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const effectiveModel = selectedModel[provider]?.trim() || '';
  const hasProviderKey = providerStatus[provider] === 'ready';

  const refreshProviderStatus = async () => {
    try {
      const response = await get<ApiResponse<ProviderStatusResponse>>('/api/settings/ai-test/providers');
      if (!response.success || !response.data) {
        throw new Error(response.error || 'โหลดสถานะ provider ไม่สำเร็จ');
      }

      const nextStatus = PROVIDERS.reduce<Record<ProviderId, ProviderStatus>>((acc, id) => {
        acc[id] = response.data?.[id]?.hasKey ? 'ready' : 'missing';
        return acc;
      }, {} as Record<ProviderId, ProviderStatus>);

      setProviderStatus(nextStatus);
      const firstReady = PROVIDERS.find((id) => nextStatus[id] === 'ready');
      setProvider((prev) => (nextStatus[prev] === 'ready' ? prev : (firstReady ?? prev)));
      setLoadError(null);
    } catch (error: any) {
      setLoadError(error?.message || 'ไม่สามารถเชื่อมต่อ provider ได้');
    }
  };

  const quickPrompts = useMemo(() => {
    const target = insights.nextFocus || profile.focusTopics || 'หัวข้อที่กำลังสอบ';
    return [
      `ช่วยวัดพื้นฐานเรื่อง ${target} ด้วยคำถาม 3 ข้อก่อนเฉลย`,
      `ขอ mini test 5 ข้อในหัวข้อ ${target} พร้อม hint ทีละขั้น`,
      `ช่วยวางแผนติว 7 วันสำหรับ ${target}`,
      `ถามฉันแบบ Socratic ต่อเนื่องจนกว่าจะมั่นใจว่าเข้าใจ ${target}`
    ];
  }, [insights.nextFocus, profile.focusTopics]);

  const suggestedTasks = useMemo(() => {
    if (insights.tasks.length > 0) return insights.tasks;
    const focus = insights.nextFocus || profile.focusTopics.split(',')[0]?.trim() || 'หัวข้อหลัก';
    return [
      `ทบทวน ${focus} 20 นาที`,
      'ทำโจทย์ 5 ข้อแบบจับเวลา',
      'สรุปจุดผิดพลาดเป็น bullet',
      'ทำซ้ำอีก 3 ข้อเพื่อตอกย้ำความเข้าใจ'
    ];
  }, [insights.tasks, insights.nextFocus, profile.focusTopics]);

  useEffect(() => {
    void refreshProviderStatus();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeDataSync(() => {
      void refreshProviderStatus();
    }, { topics: ['settings'] });
    return unsubscribe;
  }, []);

  useEffect(() => {
    writeStorage(PROFILE_STORAGE_KEY, profile);
  }, [profile]);

  useEffect(() => {
    writeStorage(CONFIG_STORAGE_KEY, config);
  }, [config]);

  useEffect(() => {
    writeStorage(PROVIDER_STORAGE_KEY, provider);
  }, [provider]);

  useEffect(() => {
    writeStorage(MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending]);

  const applyProfile = () => {
    const nextFocus = profile.weakTopics.split(',')[0]?.trim() || profile.focusTopics.split(',')[0]?.trim() || 'พื้นฐาน';
    setInsights((prev) => ({
      ...prev,
      nextFocus,
      tasks: [`ทำโจทย์พื้นฐานหัวข้อ ${nextFocus} 5 ข้อ`, 'ขอคำถามเช็กความเข้าใจเพิ่มเติมจาก Tutor']
    }));
    toast.success('อัปเดตโปรไฟล์การติวแล้ว');
  };

  const resetSession = () => {
    setMessages([]);
    setChatInput('');
    setInsights((prev) => ({ ...prev, readiness: 48, engagement: 68, confusionFlags: [], tasks: [] }));
  };

  const pushAssistant = (content: string, isError = false) => {
    setMessages((prev) => [
      ...prev,
      {
        id: createMessageId(),
        role: 'assistant',
        content,
        createdAt: new Date().toISOString(),
        model: effectiveModel,
        isError
      }
    ]);
  };

  const handleSend = async () => {
    if (isSending) return;
    if (!hasProviderKey) {
      pushAssistant('Provider นี้ยังไม่พร้อมใช้งาน กรุณาตั้งค่า API key ก่อน', true);
      return;
    }
    if (!effectiveModel) {
      pushAssistant('กรุณาระบุ model ก่อนส่งข้อความ', true);
      return;
    }

    const trimmed = chatInput.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString()
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setChatInput('');

    const recentMessages = nextMessages.slice(-12);
    const systemPrompt = buildTutorSystemPrompt(profile, config, insights, recentMessages);
    const outgoingMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...recentMessages.map((m) => ({ role: m.role, content: m.content }))
    ];

    const effectiveTemperature = config.mode === 'socratic' ? Math.min(config.temperature, 0.45) : config.temperature;
    const effectiveMaxTokens = config.mode === 'socratic' ? Math.min(config.maxTokens, 900) : config.maxTokens;
    const frequencyPenalty = config.mode === 'socratic' ? 0.45 : 0.3;
    const presencePenalty = config.mode === 'exam' ? 0.1 : 0.2;

    try {
      setIsSending(true);
      const response = await post<ApiResponse<TutorResult>>('/api/settings/ai-test/chat', {
        provider,
        model: effectiveModel,
        messages: outgoingMessages,
        system_prompt: systemPrompt,
        temperature: effectiveTemperature,
        max_tokens: effectiveMaxTokens,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'ไม่สามารถสนทนากับ Tutor ได้');
      }

      const { cleanText, meta } = extractTutorMeta(response.data.text || '');
      const checkQuestion =
        typeof meta?.check_question === 'string' && meta.check_question.trim()
          ? meta.check_question.trim()
          : insights.lastCheckQuestion || `ช่วยตอบคำถามในหัวข้อ ${insights.nextFocus || 'นี้'} ต่อได้ไหม`;
      const polishedText = sanitizeTutorReply(cleanText, config.mode, checkQuestion);
      pushAssistant(polishedText || 'ผมพร้อมช่วยต่อ ลองตอบคำถามเช็กความเข้าใจได้เลย');
      setInsights((prev) => mergeInsights(prev, meta, trimmed));
    } catch (error: any) {
      pushAssistant(error?.response?.data?.error || error?.message || 'ส่งข้อความไม่สำเร็จ', true);
    } finally {
      setIsSending(false);
    }
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const canSend = chatInput.trim().length > 0 && !isSending;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-sky-50 to-emerald-50 p-6 shadow-sm dark:border-indigo-900/40 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-gray-800 dark:text-indigo-300">
              <i className="bi bi-mortarboard-fill"></i>
              AI Tutor - Adaptive Learning
            </div>
            <h1 className="mt-3 text-2xl font-bold text-gray-900 dark:text-gray-100">ติวเตอร์ส่วนตัวสำหรับเตรียมสอบ</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              เน้นถามเช็กความเข้าใจ (Socratic) ก่อนเฉลย และปรับแผนติวตามจุดอ่อนแบบเรียลไทม์
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-200">
              Providers พร้อมใช้: {PROVIDERS.filter((id) => providerStatus[id] === 'ready').length}/4
            </span>
            <span className="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">Mode: {config.mode}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="space-y-4 xl:col-span-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Learner Profile</h2>
              <button
                type="button"
                onClick={applyProfile}
                className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300"
              >
                Apply
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">เป้าหมายสอบ</label>
                <input
                  value={profile.examGoal}
                  onChange={(event) => setProfile((prev) => ({ ...prev, examGoal: event.target.value }))}
                  className="input-field input-field-sm"
                  placeholder="เช่น IELTS / TCAS / Certificate"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">วิชาที่โฟกัส</label>
                <input
                  value={profile.focusTopics}
                  onChange={(event) => setProfile((prev) => ({ ...prev, focusTopics: event.target.value }))}
                  className="input-field input-field-sm"
                  placeholder="คณิตศาสตร์, ภาษาอังกฤษ"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">หัวข้อที่ยังไม่แม่น</label>
                <textarea
                  value={profile.weakTopics}
                  onChange={(event) => setProfile((prev) => ({ ...prev, weakTopics: event.target.value }))}
                  className="input-field input-field-sm min-h-[72px] resize-y"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Learning Style</label>
                  <select
                    value={profile.learningStyle}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, learningStyle: event.target.value as LearnerProfile['learningStyle'] }))
                    }
                    className="input-field input-field-sm"
                  >
                    <option value="mixed">Mixed</option>
                    <option value="visual">Visual</option>
                    <option value="auditory">Auditory</option>
                    <option value="reading">Reading/Writing</option>
                    <option value="kinesthetic">Hands-on</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Language</label>
                  <select
                    value={profile.responseLanguage}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, responseLanguage: event.target.value as LearnerProfile['responseLanguage'] }))
                    }
                    className="input-field input-field-sm"
                  >
                    <option value="th">Thai</option>
                    <option value="en">English</option>
                    <option value="bilingual">Bilingual</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Tutor Controls</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Mode</label>
                  <select
                    value={config.mode}
                    onChange={(event) => setConfig((prev) => ({ ...prev, mode: event.target.value as TutorConfig['mode'] }))}
                    className="input-field input-field-sm"
                  >
                    <option value="socratic">Socratic</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="exam">Exam Drill</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Difficulty</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={config.difficulty}
                    onChange={(event) => setConfig((prev) => ({ ...prev, difficulty: clamp(Number(event.target.value) || 1, 1, 5) }))}
                    className="input-field input-field-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Temperature</label>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={config.temperature}
                    onChange={(event) => setConfig((prev) => ({ ...prev, temperature: clamp(Number(event.target.value) || 0, 0, 2) }))}
                    className="input-field input-field-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Max Tokens</label>
                  <input
                    type="number"
                    min={256}
                    max={4096}
                    step={64}
                    value={config.maxTokens}
                    onChange={(event) =>
                      setConfig((prev) => ({ ...prev, maxTokens: clamp(Number(event.target.value) || 256, 256, 4096) }))
                    }
                    className="input-field input-field-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Adaptive Snapshot</h2>
            <div className="space-y-3 text-xs">
              <div>
                <div className="mb-1 flex items-center justify-between text-gray-600 dark:text-gray-300">
                  <span>Readiness</span>
                  <span className="font-semibold">{insights.readiness}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                  <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${insights.readiness}%` }} />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-gray-600 dark:text-gray-300">
                  <span>Engagement</span>
                  <span className="font-semibold">{insights.engagement}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                  <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${insights.engagement}%` }} />
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <p className="font-medium">หัวข้อถัดไป</p>
                <p className="mt-1">{insights.nextFocus || 'รอประเมินจากบทสนทนา'}</p>
              </div>

              {insights.lastCheckQuestion && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-900/20 dark:text-indigo-300">
                  <p className="font-medium">คำถามเช็กความเข้าใจล่าสุด</p>
                  <p className="mt-1">{insights.lastCheckQuestion}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="xl:col-span-8">
          <div className="flex min-h-[760px] flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="border-b border-gray-100 p-4 dark:border-gray-800">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[180px] flex-1">
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Provider</label>
                  <select
                    value={provider}
                    onChange={(event) => setProvider(event.target.value as ProviderId)}
                    className="input-field input-field-sm"
                  >
                    {PROVIDERS.map((id) => (
                      <option key={id} value={id}>
                        {id} ({providerStatus[id]})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[260px] flex-[1.2]">
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Model</label>
                  <input
                    value={selectedModel[provider]}
                    onChange={(event) => setSelectedModel((prev) => ({ ...prev, [provider]: event.target.value }))}
                    className="input-field input-field-sm"
                    placeholder="ระบุ model id"
                  />
                </div>
                <button
                  type="button"
                  onClick={resetSession}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  <i className="bi bi-plus-circle mr-1"></i>
                  New Session
                </button>
              </div>

              {loadError && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
                  {loadError}
                </div>
              )}
            </div>

            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">Quick Prompts</p>
              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setChatInput(prompt);
                      inputRef.current?.focus();
                    }}
                    className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900/40 dark:bg-indigo-900/20 dark:text-indigo-300"
                  >
                    {prompt.length > 74 ? `${prompt.slice(0, 74)}...` : prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {messages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  <p className="font-semibold text-gray-800 dark:text-gray-100">เริ่มติวได้เลย: บอกหัวข้อที่อยากให้ช่วย แล้วให้บอทถามเช็กความเข้าใจก่อนเฉลย</p>
                  <div className="mt-3 space-y-1 text-xs">
                    {suggestedTasks.map((task) => (
                      <div key={task} className="flex items-start gap-2">
                        <i className="bi bi-check2-circle mt-0.5 text-emerald-500"></i>
                        <span>{task}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[92%] rounded-2xl px-4 py-3 shadow-sm ${
                          message.role === 'user'
                            ? 'bg-indigo-600 text-white'
                            : message.isError
                              ? 'border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300'
                              : 'border border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'
                        }`}
                      >
                        {message.role === 'assistant' ? (
                          <MarkdownRenderer content={message.content} />
                        ) : (
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                        )}
                        <p className={`mt-2 text-[10px] ${message.role === 'user' ? 'text-indigo-100' : 'text-gray-400 dark:text-gray-500'}`}>
                          {formatTime(message.createdAt)}
                          {message.model ? ` · ${message.model}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                  {isSending && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        <i className="bi bi-arrow-repeat animate-spin mr-2"></i>
                        Tutor กำลังวิเคราะห์และเตรียมคำถามเช็กความเข้าใจ...
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 p-4 dark:border-gray-800">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Enter = ส่ง, Shift+Enter = ขึ้นบรรทัดใหม่</span>
                <span>
                  {chatInput.length}/{CHAT_INPUT_MAX}
                </span>
              </div>

              <div className="flex gap-3">
                <textarea
                  ref={inputRef}
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value.slice(0, CHAT_INPUT_MAX))}
                  onKeyDown={onInputKeyDown}
                  className="input-modern min-h-[96px] flex-1 resize-y text-sm"
                  placeholder="เช่น ช่วยทดสอบความเข้าใจเรื่อง Integrals แบบถามก่อนเฉลย"
                />
                <div className="flex w-[110px] flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setChatInput('')}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    ล้าง
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleSend();
                    }}
                    disabled={!canSend}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold text-white ${
                      canSend ? 'bg-indigo-600 hover:bg-indigo-700' : 'cursor-not-allowed bg-gray-300'
                    }`}
                  >
                    <i className="bi bi-send mr-1"></i>
                    ส่ง
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
