import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import PageHeader from '../components/PageHeader';
import { get, post } from '../services/api';
import { subscribeDataSync } from '../lib/dataSync';
import type { ApiResponse } from '../types';

type ProviderId = 'gemini' | 'openrouter' | 'groq' | 'aimlapi';
type PlatformId = 'tiktok' | 'x' | 'threads' | 'instagram';
type OutputLanguage = 'th' | 'en' | 'auto';

interface ProviderStatusResponse {
  gemini?: { hasKey: boolean };
  openrouter?: { hasKey: boolean };
  groq?: { hasKey: boolean };
  aimlapi?: { hasKey: boolean };
}

interface RepurposeResult {
  provider: ProviderId;
  model: string;
  source: {
    url: string;
    title: string | null;
    description: string | null;
    extractedChars: number;
    fromManualFallback: boolean;
    extractionWarning: string | null;
  };
  output: {
    sourceSummary: string;
    coreMessage: string;
    platformOutputs: Partial<Record<PlatformId, Record<string, any>>>;
    repurposingNotes: string[];
  };
  parsed: boolean;
  rawText: string;
  latencyMs?: number;
}

const providerMeta: Record<ProviderId, { label: string; icon: string }> = {
  gemini: { label: 'Gemini', icon: 'bi-stars' },
  openrouter: { label: 'OpenRouter', icon: 'bi-clouds' },
  groq: { label: 'Groq', icon: 'bi-lightning-charge' },
  aimlapi: { label: 'Aimlapi', icon: 'bi-lightning-charge-fill' }
};

const fallbackModels: Record<ProviderId, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-3-flash-preview'],
  openrouter: ['google/gemini-2.0-flash-001:free', 'meta-llama/llama-3.3-70b-instruct:free'],
  groq: ['llama-3.3-70b-versatile', 'meta-llama/llama-4-maverick-17b-128e-instruct'],
  aimlapi: ['gpt-4o-mini', 'claude-3.5-haiku']
};

const platformMeta: Array<{
  id: PlatformId;
  label: string;
  icon: string;
  desc: string;
  className: string;
}> = [
  { id: 'tiktok', label: 'TikTok', icon: 'bi-music-note-beamed', desc: 'Short-video script', className: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700' },
  { id: 'x', label: 'X / Twitter', icon: 'bi-twitter-x', desc: 'Post + thread', className: 'border-slate-300 bg-slate-100 text-slate-700' },
  { id: 'threads', label: 'Threads', icon: 'bi-chat-square-quote', desc: 'Conversation-first post', className: 'border-orange-200 bg-orange-50 text-orange-700' },
  { id: 'instagram', label: 'Instagram', icon: 'bi-instagram', desc: 'Carousel + caption', className: 'border-pink-200 bg-pink-50 text-pink-700' }
];

function normalizeModelsResponse(payload: any): string[] {
  const items = payload?.data?.data || payload?.data || payload?.models || [];
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => item?.id || item?.name)
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function platformTitle(id: PlatformId): string {
  return platformMeta.find((item) => item.id === id)?.label || id;
}

export default function ContentRepurposePage() {
  const [providerReady, setProviderReady] = useState<Record<ProviderId, boolean>>({
    gemini: false,
    openrouter: false,
    groq: false,
    aimlapi: false
  });
  const [provider, setProvider] = useState<ProviderId>('openrouter');
  const [modelsByProvider, setModelsByProvider] = useState<Record<ProviderId, string[]>>({ ...fallbackModels });
  const [didLoadRemoteModels, setDidLoadRemoteModels] = useState<Record<ProviderId, boolean>>({
    gemini: false,
    openrouter: false,
    groq: false,
    aimlapi: false
  });
  const [modelLoading, setModelLoading] = useState<Record<ProviderId, boolean>>({
    gemini: false,
    openrouter: false,
    groq: false,
    aimlapi: false
  });
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState('');

  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>('th');
  const [brandVoice, setBrandVoice] = useState('มั่นใจ กระชับ ชวนลงมือทำ');
  const [targetAudience, setTargetAudience] = useState('Content creator และทีมการตลาด');
  const [objective, setObjective] = useState('เพิ่ม reach และ engagement ข้ามแพลตฟอร์ม');
  const [cta, setCta] = useState('คอมเมนต์คำว่า START เพื่อรับเทมเพลต');
  const [temperature, setTemperature] = useState(0.35);
  const [maxTokens, setMaxTokens] = useState(3200);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(['tiktok', 'x', 'threads', 'instagram']);

  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<RepurposeResult | null>(null);

  const currentModels = useMemo(() => modelsByProvider[provider] || [], [modelsByProvider, provider]);
  const activeModel = useMemo(() => customModel.trim() || model.trim(), [customModel, model]);

  useEffect(() => {
    const loadProviderStatus = async () => {
      try {
        const response = await get<ApiResponse<ProviderStatusResponse>>('/api/settings/ai-test/providers');
        if (!response.success || !response.data) throw new Error(response.error || 'โหลด provider status ไม่สำเร็จ');
        const ready: Record<ProviderId, boolean> = {
          gemini: !!response.data.gemini?.hasKey,
          openrouter: !!response.data.openrouter?.hasKey,
          groq: !!response.data.groq?.hasKey,
          aimlapi: !!response.data.aimlapi?.hasKey
        };
        setProviderReady(ready);
        const firstReady = (Object.keys(ready) as ProviderId[]).find((item) => ready[item]);
        if (firstReady) setProvider((prev) => (ready[prev] ? prev : firstReady));
      } catch (error: any) {
        toast.error(error?.message || 'โหลด provider status ไม่สำเร็จ');
      }
    };

    void loadProviderStatus();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeDataSync(() => {
      window.setTimeout(() => {
        void get<ApiResponse<ProviderStatusResponse>>('/api/settings/ai-test/providers').then((response) => {
          if (!response.success || !response.data) return;
          const ready: Record<ProviderId, boolean> = {
            gemini: !!response.data.gemini?.hasKey,
            openrouter: !!response.data.openrouter?.hasKey,
            groq: !!response.data.groq?.hasKey,
            aimlapi: !!response.data.aimlapi?.hasKey
          };
          setProviderReady(ready);
          const firstReady = (Object.keys(ready) as ProviderId[]).find((item) => ready[item]);
          if (firstReady) setProvider((prev) => (ready[prev] ? prev : firstReady));
          setDidLoadRemoteModels({
            gemini: false,
            openrouter: false,
            groq: false,
            aimlapi: false
          });
        }).catch(() => {
          // ignore sync refresh errors
        });
      }, 120);
    }, { topics: ['settings'] });
    return unsubscribe;
  }, []);

  const loadModels = async (target: ProviderId) => {
    if (!providerReady[target] || didLoadRemoteModels[target] || modelLoading[target]) return;
    try {
      setModelLoading((prev) => ({ ...prev, [target]: true }));
      const response = await get<ApiResponse<any>>(`/api/settings/ai-test/${target}/models`);
      if (response.success) {
        const remote = normalizeModelsResponse(response.data);
        const merged = Array.from(new Set([...(remote || []), ...fallbackModels[target]])).slice(0, 80);
        if (merged.length > 0) setModelsByProvider((prev) => ({ ...prev, [target]: merged }));
      }
      setDidLoadRemoteModels((prev) => ({ ...prev, [target]: true }));
    } catch {
      // keep fallback list
    } finally {
      setModelLoading((prev) => ({ ...prev, [target]: false }));
    }
  };

  useEffect(() => {
    if (!providerReady[provider]) return;
    void loadModels(provider);
  }, [provider, providerReady]);

  useEffect(() => {
    if (currentModels.length === 0) return;
    setModel((prev) => (currentModels.includes(prev) ? prev : currentModels[0]));
  }, [currentModels]);

  const togglePlatform = (id: PlatformId) => {
    setSelectedPlatforms((prev) => {
      if (prev.includes(id)) return prev.length === 1 ? prev : prev.filter((item) => item !== id);
      return [...prev, id];
    });
  };

  const copyText = async (text: string, ok = 'คัดลอกแล้ว') => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(ok);
    } catch {
      toast.error('คัดลอกไม่สำเร็จ');
    }
  };

  const handleGenerate = async () => {
    if (!sourceUrl.trim()) return toast.error('กรุณาระบุ URL บทความ');
    if (!providerReady[provider]) return toast.error(`ยังไม่มี API key สำหรับ ${providerMeta[provider].label}`);
    if (!activeModel) return toast.error('กรุณาเลือก model');
    if (selectedPlatforms.length === 0) return toast.error('กรุณาเลือกอย่างน้อย 1 แพลตฟอร์ม');

    try {
      setIsGenerating(true);
      setResult(null);
      const response = await post<ApiResponse<RepurposeResult>>('/api/content/repurpose', {
        provider,
        model: activeModel,
        sourceUrl: sourceUrl.trim(),
        sourceText: sourceText.trim() || undefined,
        outputLanguage,
        brandVoice: brandVoice.trim() || undefined,
        targetAudience: targetAudience.trim() || undefined,
        objective: objective.trim() || undefined,
        cta: cta.trim() || undefined,
        platforms: selectedPlatforms,
        temperature,
        max_tokens: maxTokens
      }, { timeout: 180000 });

      if (!response.success || !response.data) throw new Error(response.error || 'ไม่สามารถสร้างคอนเทนต์ได้');
      setResult(response.data);
      toast.success('สร้างคอนเทนต์ข้ามแพลตฟอร์มสำเร็จ');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'เกิดข้อผิดพลาด';
      toast.error(message);
      if (/ไม่สามารถสกัดเนื้อหาบทความจาก URL นี้ได้/i.test(String(message)) && !sourceText.trim()) {
        toast('ลองวางเนื้อหาในช่อง Source text fallback เพื่อให้ระบบช่วยสร้างต่อได้ทันที', { icon: 'i' });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cross-Platform Contextual Re-purposing"
        description="รับ URL บทความเดียว แล้วแตกหน่อเป็นคอนเทนต์เฉพาะแพลตฟอร์ม"
      />

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">Source + Context</h3>
            <div className="mt-4 space-y-3">
              <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://example.com/article" className="input-modern text-sm" />
              <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} placeholder="Source text fallback (optional) - วางเนื้อหาบทความที่คัดลอกมา กรณีบางเว็บบล็อกการดึงอัตโนมัติ" className="input-modern min-h-[96px] resize-y text-xs" />
              <select value={outputLanguage} onChange={(e) => setOutputLanguage(e.target.value as OutputLanguage)} className="input-modern text-sm">
                <option value="th">Thai</option>
                <option value="en">English</option>
                <option value="auto">Auto</option>
              </select>
              <input value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} placeholder="Brand voice" className="input-modern text-sm" />
              <input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Target audience" className="input-modern text-sm" />
              <input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Campaign objective" className="input-modern text-sm" />
              <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Preferred CTA" className="input-modern text-sm" />
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">Provider + Model</h3>
            <div className="mt-4 space-y-2">
              {(Object.keys(providerMeta) as ProviderId[]).map((item) => (
                <button key={item} type="button" onClick={() => setProvider(item)} className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-all ${provider === item ? 'border-cyan-300 bg-cyan-50 text-cyan-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}>
                  <i className={`bi ${providerMeta[item].icon} mr-2`}></i>
                  {providerMeta[item].label}
                  <span className={`ml-2 text-[11px] ${providerReady[item] ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {providerReady[item] ? 'Connected' : 'No key'}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              <select value={model} onFocus={() => void loadModels(provider)} onChange={(e) => setModel(e.target.value)} className="input-modern text-sm">
                <option value="">Select model...</option>
                {currentModels.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <input value={customModel} onChange={(e) => setCustomModel(e.target.value)} className="input-modern text-sm" placeholder="Custom model (optional)" />
              {modelLoading[provider] && <p className="text-[11px] text-gray-500">กำลังโหลดโมเดล...</p>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input type="number" min={0} max={1.2} step={0.05} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="input-modern text-sm" />
              <input type="number" min={900} max={4096} step={100} value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} className="input-modern text-sm" />
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">Platforms</h3>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {platformMeta.map((item) => {
                const active = selectedPlatforms.includes(item.id);
                return (
                  <button key={item.id} type="button" onClick={() => togglePlatform(item.id)} className={`rounded-xl border px-3 py-2 text-left text-sm ${active ? item.className : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    <i className={`bi ${item.icon} mr-1.5`}></i>
                    {item.label}
                    <p className="text-[11px] opacity-80">{item.desc}</p>
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={handleGenerate} disabled={isGenerating} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-70">
              <i className={`bi ${isGenerating ? 'bi-arrow-repeat animate-spin' : 'bi-stars'}`}></i>
              {isGenerating ? 'Generating...' : 'Generate Cross-Platform Content'}
            </button>
          </section>
        </div>

        <div className="xl:col-span-7">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            {!result ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center text-sm text-gray-500">
                ใส่ URL + บริบท แล้วกด Generate เพื่อเริ่ม
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-gray-500">{result.provider} · {result.model} · {result.latencyMs ?? '-'} ms</p>
                    <p className="text-sm font-semibold text-gray-900">{result.source.title || result.source.url}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => void copyText(JSON.stringify(result.output, null, 2), 'คัดลอก output แล้ว')} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs">Copy Output JSON</button>
                    <button type="button" onClick={() => void copyText(result.rawText, 'คัดลอก raw output แล้ว')} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs">Copy Raw</button>
                  </div>
                </div>

                {(result.output.sourceSummary || result.output.coreMessage) && (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm">
                    {result.output.sourceSummary && <p className="text-gray-700"><strong>Summary:</strong> {result.output.sourceSummary}</p>}
                    {result.output.coreMessage && <p className="mt-2 text-cyan-800"><strong>Core Message:</strong> {result.output.coreMessage}</p>}
                  </div>
                )}

                {result.output.repurposingNotes.length > 0 && (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold text-gray-600">Repurposing Notes</p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-700">
                      {result.output.repurposingNotes.map((item, index) => (
                        <li key={`${item}-${index}`}>{index + 1}. {item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {platformMeta.map((platform) => {
                  const payload = result.output.platformOutputs[platform.id];
                  if (!payload) return null;

                  const keyOrder = ['hook', 'angle', 'post', 'script', 'caption', 'cta', 'visualBrief', 'reelHook', 'bestPostingWindow', 'hashtags', 'thread', 'shotList', 'carouselSlides'];
                  const orderedEntries = Object.entries(payload).sort((a, b) => {
                    const aIndex = keyOrder.indexOf(a[0]);
                    const bIndex = keyOrder.indexOf(b[0]);
                    return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
                  });

                  return (
                    <article key={platform.id} className={`rounded-2xl border p-4 ${platform.className}`}>
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-sm font-semibold"><i className={`bi ${platform.icon} mr-1.5`}></i>{platformTitle(platform.id)}</h4>
                        <button type="button" onClick={() => void copyText(JSON.stringify(payload, null, 2), `คัดลอก ${platformTitle(platform.id)} แล้ว`)} className="rounded-lg border border-white/70 bg-white px-2.5 py-1 text-[11px]">
                          Copy
                        </button>
                      </div>
                      <div className="space-y-2 text-sm text-gray-800">
                        {orderedEntries.map(([key, value]) => {
                          if (!value || (Array.isArray(value) && value.length === 0)) return null;
                          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
                          if (Array.isArray(value)) {
                            return (
                              <div key={key}>
                                <p className="text-xs font-semibold text-gray-600">{label}</p>
                                <pre className="mt-1 whitespace-pre-wrap rounded-xl border border-white/70 bg-white p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>
                              </div>
                            );
                          }
                          return (
                            <div key={key}>
                              <p className="text-xs font-semibold text-gray-600">{label}</p>
                              <p className="whitespace-pre-wrap rounded-xl border border-white/70 bg-white p-2 text-sm">{String(value)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}

                <details className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <summary className="cursor-pointer text-xs font-semibold text-gray-600">
                    Raw model output (debug)
                  </summary>
                  <pre className="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-xl border border-gray-200 bg-white p-3 text-[11px] text-gray-700">
                    {result.rawText}
                  </pre>
                </details>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
