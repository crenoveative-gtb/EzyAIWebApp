import { useState, useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import { get, post } from '../services/api';
import { subscribeDataSync } from '../lib/dataSync';
import type { ApiResponse } from '../types';
import toast from 'react-hot-toast';

type ProviderId = 'gemini' | 'openrouter' | 'groq' | 'aimlapi';

interface ModelSlot {
    provider: ProviderId;
    model: string;
    response: string;
    loading: boolean;
    error: string | null;
    responseTime: number | null;
}

const providerMeta: Record<ProviderId, { label: string; icon: string; iconBg: string; iconText: string }> = {
    gemini: { label: 'Gemini', icon: 'bi-stars', iconBg: 'bg-blue-50', iconText: 'text-blue-600' },
    openrouter: { label: 'OpenRouter', icon: 'bi-clouds', iconBg: 'bg-emerald-50', iconText: 'text-emerald-600' },
    groq: { label: 'Groq', icon: 'bi-lightning-charge', iconBg: 'bg-amber-50', iconText: 'text-orange-600' },
    aimlapi: { label: 'Aimlapi', icon: 'bi-lightning-charge-fill', iconBg: 'bg-purple-50', iconText: 'text-purple-600' },
};

const defaultSlot = (): ModelSlot => ({
    provider: 'gemini',
    model: '',
    response: '',
    loading: false,
    error: null,
    responseTime: null,
});

export default function ComparePage() {
    const [slots, setSlots] = useState<ModelSlot[]>([defaultSlot(), defaultSlot()]);
    const [prompt, setPrompt] = useState('');
    const [modelLists, setModelLists] = useState<Record<ProviderId, string[]>>({ gemini: [], openrouter: [], groq: [], aimlapi: [] });
    const [availableProviders, setAvailableProviders] = useState<ProviderId[]>([]);
    const [loadingModels, setLoadingModels] = useState<Set<ProviderId>>(new Set());

    useEffect(() => {
        checkProviders();
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeDataSync(() => {
            void checkProviders();
        }, { topics: ['settings'] });
        return unsubscribe;
    }, []);

    const checkProviders = async () => {
        try {
            const res = await get<ApiResponse<any>>('/api/settings');
            if (res.success && res.data) {
                const d = res.data;
                const available: ProviderId[] = [];
                if (d.hasGeminiKey) available.push('gemini');
                if (d.hasOpenrouterKey) available.push('openrouter');
                if (d.hasGroqKey) available.push('groq');
                if (d.hasAimlapiKey) available.push('aimlapi');
                setAvailableProviders(available);
            }
        } catch { /* ignore */ }
    };

    const fetchModels = async (provider: ProviderId) => {
        if (modelLists[provider].length > 0 || loadingModels.has(provider)) return;
        setLoadingModels(prev => new Set([...prev, provider]));
        try {
            const res = await get<ApiResponse<any>>(`/api/settings/ai-test/${provider}/models`);
            if (res.success && res.data) {
                let models: string[] = [];
                if (provider === 'gemini') {
                    models = (res.data.models || []).map((m: any) => m.name?.replace('models/', '') || m).filter((n: string) => n);
                } else {
                    models = (res.data.data || []).map((m: any) => m.id).filter((n: string) => n);
                }
                setModelLists(prev => ({ ...prev, [provider]: models.slice(0, 30) }));
            }
        } catch {
            toast.error(`Failed to load ${provider} models`);
        } finally {
            setLoadingModels(prev => { const n = new Set(prev); n.delete(provider); return n; });
        }
    };

    const updateSlot = (index: number, changes: Partial<ModelSlot>) => {
        setSlots(prev => prev.map((s, i) => i === index ? { ...s, ...changes } : s));
    };

    const handleProviderChange = (index: number, provider: ProviderId) => {
        updateSlot(index, { provider, model: '' });
        fetchModels(provider);
    };

    const addSlot = () => {
        if (slots.length >= 4) return;
        setSlots(prev => [...prev, defaultSlot()]);
    };

    const removeSlot = (index: number) => {
        if (slots.length <= 2) return;
        setSlots(prev => prev.filter((_, i) => i !== index));
    };

    const handleCompare = async () => {
        if (!prompt.trim()) {
            toast.error('Please enter a prompt');
            return;
        }

        const validSlots = slots.filter(s => s.model);
        if (validSlots.length < 2) {
            toast.error('Select at least 2 models');
            return;
        }

        // Reset responses
        setSlots(prev => prev.map(s => ({ ...s, response: '', error: null, loading: !!s.model, responseTime: null })));

        // Send requests in parallel
        slots.forEach(async (slot, index) => {
            if (!slot.model) return;
            const start = Date.now();
            try {
                const res = await post<ApiResponse<any>>('/api/settings/ai-test/chat', {
                    provider: slot.provider,
                    model: slot.model,
                    prompt: prompt.trim(),
                    temperature: 0.7,
                    max_tokens: 1024,
                });
                if (res.success) {
                    updateSlot(index, {
                        response: res.data?.text || res.data?.response || 'No response',
                        loading: false,
                        responseTime: Date.now() - start,
                    });
                } else {
                    updateSlot(index, { error: res.error || 'Failed', loading: false, responseTime: Date.now() - start });
                }
            } catch (err: any) {
                updateSlot(index, { error: err?.message || 'Error', loading: false, responseTime: Date.now() - start });
            }
        });
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Multi-Model Compare"
                description="ส่ง prompt เดียวกันไปยังหลาย model พร้อมกัน เทียบผลลัพธ์แบบ side-by-side"
                className="animate-fade-in-down"
            />

            {/* Prompt Input */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-fade-in-up delay-100">
                <label className="text-xs font-medium text-gray-700 mb-2 block">Prompt</label>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="input-modern min-h-[80px] resize-y"
                    placeholder="Enter your prompt to compare across models..."
                />
                <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                        {slots.length < 4 && (
                            <button onClick={addSlot} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors">
                                <i className="bi bi-plus-circle mr-1"></i>Add Model Slot
                            </button>
                        )}
                        <span className="text-xs text-gray-400">{slots.length}/4 models</span>
                    </div>
                    <button
                        onClick={handleCompare}
                        disabled={slots.some(s => s.loading)}
                        className="btn-primary text-sm flex items-center gap-2"
                    >
                        {slots.some(s => s.loading) ? (
                            <>
                                <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></span>
                                <span>Comparing...</span>
                            </>
                        ) : (
                            <>
                                <i className="bi bi-play-fill"></i>
                                <span>Compare</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Model Slots */}
            <div className={`grid gap-4 animate-fade-in-up delay-200 ${slots.length <= 2 ? 'md:grid-cols-2' : slots.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
                {slots.map((slot, index) => (
                    <div key={index} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        {/* Slot Header */}
                        <div className="p-4 border-b border-gray-100">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-semibold text-gray-500">Model {index + 1}</span>
                                {slots.length > 2 && (
                                    <button onClick={() => removeSlot(index)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                                        <i className="bi bi-x-lg"></i>
                                    </button>
                                )}
                            </div>

                            {/* Provider Select */}
                            <select
                                value={slot.provider}
                                onChange={(e) => handleProviderChange(index, e.target.value as ProviderId)}
                                className="input-modern text-xs !py-2 mb-2"
                            >
                                {(Object.keys(providerMeta) as ProviderId[]).map(p => (
                                    <option key={p} value={p} disabled={!availableProviders.includes(p)}>
                                        {providerMeta[p].label} {!availableProviders.includes(p) ? '(no key)' : ''}
                                    </option>
                                ))}
                            </select>

                            {/* Model Select */}
                            <select
                                value={slot.model}
                                onChange={(e) => updateSlot(index, { model: e.target.value })}
                                onFocus={() => fetchModels(slot.provider)}
                                className="input-modern text-xs !py-2"
                            >
                                <option value="">Select model...</option>
                                {modelLists[slot.provider].map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            {loadingModels.has(slot.provider) && (
                                <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                                    <span className="animate-spin rounded-full h-2.5 w-2.5 border-b border-indigo-500"></span>
                                    Loading models...
                                </p>
                            )}
                        </div>

                        {/* Response */}
                        <div className="p-4 min-h-[200px]">
                            {slot.loading ? (
                                <div className="flex flex-col items-center justify-center h-40 gap-2">
                                    <span className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></span>
                                    <span className="text-xs text-gray-400">Processing...</span>
                                </div>
                            ) : slot.error ? (
                                <div className="p-3 rounded-xl bg-red-50 text-xs text-red-600">
                                    <i className="bi bi-exclamation-triangle mr-1"></i>{slot.error}
                                </div>
                            ) : slot.response ? (
                                <div>
                                    {slot.responseTime !== null && (
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">
                                                {(slot.responseTime / 1000).toFixed(2)}s
                                            </span>
                                            <span className="text-[10px] text-gray-400">{slot.response.length} chars</span>
                                        </div>
                                    )}
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                                        {slot.response}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-40 text-xs text-gray-400">
                                    Waiting for prompt...
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {availableProviders.length === 0 && (
                <div className="text-center py-8 animate-fade-in-up">
                    <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-3">
                        <i className="bi bi-exclamation-triangle text-2xl text-amber-500"></i>
                    </div>
                    <p className="text-sm text-gray-600 mb-1">No API keys configured</p>
                    <p className="text-xs text-gray-400">Go to API Keys to set up providers first</p>
                </div>
            )}
        </div>
    );
}

