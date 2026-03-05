import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { get } from '../services/api';
import { subscribeDataSync } from '../lib/dataSync';
import type { ApiResponse } from '../types';

interface ProviderStatus {
    name: string;
    id: string;
    icon: string;
    iconBg: string;
    iconText: string;
    hasKey: boolean;
}

interface ConversationEntry {
    id: string;
    title: string;
    provider: string;
    model: string;
    updated_at: string;
}

// Keep these aligned with built-in lists in PromptLibraryPage and AgentsPage.
const BUILT_IN_PROMPTS_COUNT = 15;
const BUILT_IN_AGENTS_COUNT = 5;

export default function DashboardPage() {
    const navigate = useNavigate();
    const [providers, setProviders] = useState<ProviderStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ conversations: 0, prompts: 0, agents: 0 });
    const [recentChats, setRecentChats] = useState<ConversationEntry[]>([]);

    const loadLibraryStats = useCallback(async () => {
        try {
            const [promptsRes, agentsRes] = await Promise.all([
                get<ApiResponse<{ prompts: Array<any> }>>('/api/prompt-library'),
                get<ApiResponse<{ agents: Array<any> }>>('/api/agents')
            ]);

            const customPrompts = promptsRes.success && promptsRes.data?.prompts ? promptsRes.data.prompts.length : 0;
            const customAgents = agentsRes.success && agentsRes.data?.agents ? agentsRes.data.agents.length : 0;

            const prompts = BUILT_IN_PROMPTS_COUNT + customPrompts;
            const agents = BUILT_IN_AGENTS_COUNT + customAgents;

            setStats((prev) => ({
                ...prev,
                prompts,
                agents
            }));
        } catch {
            // silently fail
        }
    }, []);

    const loadConversationSummary = useCallback(async () => {
        try {
            const res = await get<ApiResponse<{ conversations: ConversationEntry[]; total?: number }>>('/api/conversations?limit=5&offset=0');
            if (res.success && res.data) {
                const conversations = Array.isArray(res.data.conversations) ? res.data.conversations : [];
                const total = typeof res.data.total === 'number' ? res.data.total : conversations.length;
                setStats((prev) => ({ ...prev, conversations: total }));
                setRecentChats(conversations);
            }
        } catch {
            // silently fail
        }
    }, []);

    useEffect(() => {
        void loadProviderStatus();
        void loadConversationSummary();
        void loadLibraryStats();

        const handleFocus = () => {
            void loadProviderStatus();
            void loadConversationSummary();
            void loadLibraryStats();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void loadProviderStatus();
                void loadConversationSummary();
                void loadLibraryStats();
            }
        };

        const providerStatusInterval = window.setInterval(loadProviderStatus, 30000);
        const conversationInterval = window.setInterval(loadConversationSummary, 15000);
        const libraryStatsInterval = window.setInterval(loadLibraryStats, 20000);

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.clearInterval(providerStatusInterval);
            window.clearInterval(conversationInterval);
            window.clearInterval(libraryStatsInterval);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [loadConversationSummary, loadLibraryStats]);

    useEffect(() => {
        const unsubscribe = subscribeDataSync((detail) => {
            if (detail.topics.includes('settings') || detail.topics.includes('all')) {
                void loadProviderStatus();
            }
            if (detail.topics.includes('conversations') || detail.topics.includes('all')) {
                void loadConversationSummary();
            }
            if (detail.topics.includes('library') || detail.topics.includes('all')) {
                void loadLibraryStats();
            }
        }, { topics: ['settings', 'conversations', 'library'] });
        return unsubscribe;
    }, [loadConversationSummary, loadLibraryStats]);

    const loadProviderStatus = async () => {
        try {
            const res = await get<ApiResponse<any>>('/api/settings');
            if (res.success && res.data) {
                const d = res.data;
                setProviders([
                    { name: 'Gemini', id: 'gemini', icon: 'bi-stars', iconBg: 'bg-blue-50', iconText: 'text-blue-600', hasKey: !!d.hasGeminiKey },
                    { name: 'OpenRouter', id: 'openrouter', icon: 'bi-clouds', iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', hasKey: !!d.hasOpenrouterKey },
                    { name: 'Groq', id: 'groq', icon: 'bi-lightning-charge', iconBg: 'bg-amber-50', iconText: 'text-orange-600', hasKey: !!d.hasGroqKey },
                    { name: 'Aimlapi', id: 'aimlapi', icon: 'bi-lightning-charge-fill', iconBg: 'bg-purple-50', iconText: 'text-purple-600', hasKey: !!d.hasAimlapiKey },
                    { name: 'Hugging Face', id: 'huggingface', icon: 'bi-cpu', iconBg: 'bg-cyan-50', iconText: 'text-cyan-600', hasKey: !!d.hasHuggingfaceKey },
                    { name: 'Pollinations', id: 'pollinations', icon: 'bi-palette', iconBg: 'bg-rose-50', iconText: 'text-rose-600', hasKey: !!d.hasPollinationsKey },
                    { name: 'Replicate', id: 'replicate', icon: 'bi-hdd-network', iconBg: 'bg-indigo-50', iconText: 'text-indigo-600', hasKey: !!d.hasReplicateKey },
                    { name: 'Pollo', id: 'pollo', icon: 'bi-film', iconBg: 'bg-orange-50', iconText: 'text-orange-600', hasKey: !!d.hasPolloKey },
                ]);
            }
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    };

    const activeProviders = providers.filter(p => p.hasKey).length;

    const statCards = [
        { label: 'Conversations', value: stats.conversations, icon: 'bi-chat-dots', gradient: 'from-indigo-500 to-indigo-600', shadow: 'shadow-indigo-200' },
        { label: 'Active Providers', value: `${activeProviders}/${providers.length || 8}`, icon: 'bi-plug', gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-200' },
        { label: 'Saved Prompts', value: stats.prompts, icon: 'bi-bookmark-star', gradient: 'from-amber-500 to-orange-500', shadow: 'shadow-orange-200' },
        { label: 'AI Agents', value: stats.agents, icon: 'bi-robot', gradient: 'from-purple-500 to-pink-500', shadow: 'shadow-purple-200' },
    ];

    const quickActions = [
        { label: 'New Chat', icon: 'bi-plus-circle', path: '/ai-core', color: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' },
        { label: 'Edu Tutor', icon: 'bi-mortarboard', path: '/education-tutor', color: 'text-sky-700 bg-sky-50 hover:bg-sky-100' },
        { label: 'Repurpose Content', icon: 'bi-share', path: '/content-repurpose', color: 'text-cyan-700 bg-cyan-50 hover:bg-cyan-100' },
        { label: 'Compare Models', icon: 'bi-layout-split', path: '/compare', color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' },
        { label: 'Create Agent', icon: 'bi-robot', path: '/agents', color: 'text-purple-600 bg-purple-50 hover:bg-purple-100' },
        { label: 'Browse Prompts', icon: 'bi-bookmark-star', path: '/prompts', color: 'text-amber-600 bg-amber-50 hover:bg-amber-100' },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Dashboard"
                description="ภาพรวมการใช้งาน AI Platform ของคุณ"
                className="animate-fade-in-down"
            />

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up delay-100">
                {statCards.map((card) => (
                    <div key={card.label} className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 p-5 shadow-sm hover:shadow-lg transition-all duration-300 group">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs font-medium text-gray-500 mb-1">{card.label}</p>
                                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                            </div>
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-lg ${card.shadow} group-hover:scale-110 transition-transform duration-300`}>
                                <i className={`bi ${card.icon} text-white text-base`}></i>
                            </div>
                        </div>
                        <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${card.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
                    </div>
                ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Provider Health */}
                <div className="lg:col-span-2 animate-fade-in-up delay-200">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-sm font-semibold text-gray-900">Provider Health</h2>
                            <button
                                onClick={() => navigate('/settings/api-keys')}
                                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
                            >
                                Manage Keys →
                            </button>
                        </div>
                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-500"></span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {providers.map((p) => (
                                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                                        <div className={`w-9 h-9 rounded-lg ${p.iconBg} flex items-center justify-center`}>
                                            <i className={`bi ${p.icon} ${p.iconText} text-base`}></i>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className={`w-1.5 h-1.5 rounded-full ${p.hasKey ? 'bg-emerald-500' : 'bg-gray-300'}`}></span>
                                                <span className={`text-[11px] ${p.hasKey ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                    {p.hasKey ? 'Connected' : 'No key'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="animate-fade-in-up delay-300">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h2 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h2>
                        <div className="space-y-2">
                            {quickActions.map((action) => (
                                <button
                                    key={action.label}
                                    onClick={() => navigate(action.path)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${action.color}`}
                                >
                                    <i className={`bi ${action.icon} text-base`}></i>
                                    {action.label}
                                    <i className="bi bi-arrow-right ml-auto text-xs opacity-0 group-hover:opacity-100 transition-opacity"></i>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Conversations */}
            <div className="animate-fade-in-up delay-400">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-sm font-semibold text-gray-900">Recent Conversations</h2>
                        <button
                            onClick={() => navigate('/history')}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
                        >
                            View All →
                        </button>
                    </div>
                    {recentChats.length === 0 ? (
                        <div className="text-center py-10">
                            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                                <i className="bi bi-chat-dots text-2xl text-gray-300"></i>
                            </div>
                            <p className="text-sm text-gray-500 mb-1">ยังไม่มีบทสนทนา</p>
                            <p className="text-xs text-gray-400">เริ่มแชทกับ AI ได้เลย</p>
                            <button
                                onClick={() => navigate('/ai-core')}
                                className="mt-4 px-4 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                            >
                                <i className="bi bi-plus-circle mr-1.5"></i>New Chat
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {recentChats.map((chat) => (
                                <div key={chat.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
                                    <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                                        <i className="bi bi-chat-dots text-indigo-600 text-sm"></i>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-gray-900 truncate">{chat.title}</p>
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                            {chat.provider} · {chat.model} · {new Date(chat.updated_at).toLocaleDateString('th-TH')}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

