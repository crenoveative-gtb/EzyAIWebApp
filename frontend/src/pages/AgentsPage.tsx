import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import toast from 'react-hot-toast';
import { del, get, post, put } from '../services/api';
import type { ApiResponse } from '../types';
import { subscribeDataSync } from '../lib/dataSync';

interface Agent {
    id: string;
    name: string;
    emoji: string;
    description: string;
    systemPrompt: string;
    provider: string;
    model: string;
    temperature: number;
    maxTokens: number;
    isBuiltIn: boolean;
    createdAt: string;
}

const emojiOptions = ['🤖', '💻', '✍️', '📊', '🌏', '🎨', '🧠', '🔬', '📝', '🛡️', '🎯', '🚀'];

const builtInAgents: Agent[] = [
    {
        id: 'agent_code', name: 'Code Assistant', emoji: '💻', description: 'Expert developer — writes, reviews, and debugs code',
        systemPrompt: 'You are an expert software developer. Help users write clean, efficient, well-documented code. When reviewing code, point out bugs, performance issues, and security concerns. Always explain your reasoning. Use code blocks with proper syntax highlighting.',
        provider: 'gemini', model: 'gemini-2.5-flash-lite', temperature: 0.3, maxTokens: 2048, isBuiltIn: true, createdAt: ''
    },
    {
        id: 'agent_writer', name: 'Writing Coach', emoji: '✍️', description: 'Professional writer — blogs, emails, creative content',
        systemPrompt: 'You are a professional writer and editor. Help users craft compelling content — blog posts, emails, social media posts, documentation, and creative writing. Focus on clarity, engagement, and proper tone. Provide constructive feedback on writing.',
        provider: 'openrouter', model: '', temperature: 0.7, maxTokens: 2048, isBuiltIn: true, createdAt: ''
    },
    {
        id: 'agent_analyst', name: 'Data Analyst', emoji: '📊', description: 'Analyzes data, creates reports, and provides insights',
        systemPrompt: 'You are an expert data analyst. Help users analyze data, find patterns, create summaries, and generate actionable insights. Present data in clear formats — tables, bullet points, and structured reports. Use statistical reasoning when appropriate.',
        provider: 'gemini', model: 'gemini-2.5-flash-lite', temperature: 0.4, maxTokens: 2048, isBuiltIn: true, createdAt: ''
    },
    {
        id: 'agent_support', name: 'Customer Support', emoji: '🛡️', description: 'Friendly support agent — answers questions, solves problems',
        systemPrompt: 'You are a professional customer support agent. Be friendly, helpful, empathetic, and solution-oriented. Ask clarifying questions when needed. Provide step-by-step instructions. Always offer additional help at the end of your response.',
        provider: 'groq', model: '', temperature: 0.5, maxTokens: 1024, isBuiltIn: true, createdAt: ''
    },
    {
        id: 'agent_translator', name: 'Translator', emoji: '🌏', description: 'Accurate multi-language translator with cultural nuance',
        systemPrompt: 'You are a professional translator with expertise in multiple languages. Provide accurate translations that maintain the original meaning, tone, and cultural nuances. When translating, note any idioms or expressions that don\'t have direct equivalents.',
        provider: 'gemini', model: 'gemini-2.5-flash-lite', temperature: 0.3, maxTokens: 2048, isBuiltIn: true, createdAt: ''
    },
];

export default function AgentsPage() {
    const navigate = useNavigate();
    const [customAgents, setCustomAgents] = useState<Agent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
    const [search, setSearch] = useState('');

    // Form state
    const [formName, setFormName] = useState('');
    const [formEmoji, setFormEmoji] = useState('🤖');
    const [formDesc, setFormDesc] = useState('');
    const [formPrompt, setFormPrompt] = useState('');
    const [formProvider, setFormProvider] = useState('gemini');
    const [formModel, setFormModel] = useState('');
    const [formTemp, setFormTemp] = useState(0.7);
    const [formMaxTokens, setFormMaxTokens] = useState(1024);

    const loadAgents = async () => {
        try {
            setIsLoading(true);
            const response = await get<ApiResponse<{ agents: Array<any> }>>('/api/agents');
            if (!response.success || !response.data) {
                throw new Error(response.error || 'Failed to load agents');
            }
            const mapped: Agent[] = (response.data.agents || []).map((item) => ({
                id: String(item.id),
                name: String(item.name || ''),
                emoji: String(item.emoji || '🤖'),
                description: String(item.description || ''),
                systemPrompt: String(item.system_prompt || item.systemPrompt || ''),
                provider: String(item.provider || 'gemini'),
                model: String(item.model || ''),
                temperature: Number.isFinite(Number(item.temperature)) ? Number(item.temperature) : 0.7,
                maxTokens: Number.isInteger(Number(item.max_tokens)) ? Number(item.max_tokens) : 1024,
                isBuiltIn: false,
                createdAt: String(item.created_at || '')
            }));
            setCustomAgents(mapped);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to load agents');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadAgents();
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeDataSync(() => {
            void loadAgents();
        }, { topics: ['library'] });
        return unsubscribe;
    }, []);

    const allAgents = useMemo(() => [...builtInAgents, ...customAgents], [customAgents]);

    const filtered = useMemo(() => {
        if (!search) return allAgents;
        const q = search.toLowerCase();
        return allAgents.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
    }, [allAgents, search]);

    const openCreateModal = () => {
        setEditingAgent(null);
        setFormName('');
        setFormEmoji('🤖');
        setFormDesc('');
        setFormPrompt('');
        setFormProvider('gemini');
        setFormModel('');
        setFormTemp(0.7);
        setFormMaxTokens(1024);
        setShowModal(true);
    };

    const openEditModal = (agent: Agent) => {
        setEditingAgent(agent);
        setFormName(agent.name);
        setFormEmoji(agent.emoji);
        setFormDesc(agent.description);
        setFormPrompt(agent.systemPrompt);
        setFormProvider(agent.provider);
        setFormModel(agent.model);
        setFormTemp(agent.temperature);
        setFormMaxTokens(agent.maxTokens);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formName.trim() || !formPrompt.trim()) {
            toast.error('Name and System Prompt are required');
            return;
        }

        try {
            if (editingAgent) {
                const response = await put<ApiResponse<any>>(`/api/agents/${editingAgent.id}`, {
                    name: formName.trim(),
                    emoji: formEmoji,
                    description: formDesc.trim(),
                    systemPrompt: formPrompt.trim(),
                    provider: formProvider,
                    model: formModel.trim(),
                    temperature: formTemp,
                    maxTokens: formMaxTokens
                });
                if (!response.success) {
                    throw new Error(response.error || 'Failed to update agent');
                }
                setCustomAgents((prev) => prev.map((item) => item.id === editingAgent.id ? {
                    ...item,
                    name: formName.trim(),
                    emoji: formEmoji,
                    description: formDesc.trim(),
                    systemPrompt: formPrompt.trim(),
                    provider: formProvider,
                    model: formModel.trim(),
                    temperature: formTemp,
                    maxTokens: formMaxTokens
                } : item));
                toast.success('Agent updated!');
            } else {
                const response = await post<ApiResponse<any>>('/api/agents', {
                    name: formName.trim(),
                    emoji: formEmoji,
                    description: formDesc.trim(),
                    systemPrompt: formPrompt.trim(),
                    provider: formProvider,
                    model: formModel.trim(),
                    temperature: formTemp,
                    maxTokens: formMaxTokens
                });
                if (!response.success || !response.data) {
                    throw new Error(response.error || 'Failed to create agent');
                }

                const created: Agent = {
                    id: String(response.data.id),
                    name: String(response.data.name || formName.trim()),
                    emoji: String(response.data.emoji || formEmoji),
                    description: String(response.data.description || formDesc.trim()),
                    systemPrompt: String(response.data.system_prompt || formPrompt.trim()),
                    provider: String(response.data.provider || formProvider),
                    model: String(response.data.model || formModel.trim()),
                    temperature: Number.isFinite(Number(response.data.temperature)) ? Number(response.data.temperature) : formTemp,
                    maxTokens: Number.isInteger(Number(response.data.max_tokens)) ? Number(response.data.max_tokens) : formMaxTokens,
                    isBuiltIn: false,
                    createdAt: String(response.data.created_at || new Date().toISOString()),
                };

                setCustomAgents((prev) => [created, ...prev]);
                toast.success('Agent created!');
            }

            setShowModal(false);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to save agent');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const response = await del<ApiResponse<any>>(`/api/agents/${id}`);
            if (!response.success) {
                throw new Error(response.error || 'Failed to delete agent');
            }
            setCustomAgents((prev) => prev.filter((a) => a.id !== id));
            toast.success('Agent deleted');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to delete agent');
        }
    };

    const handleUseAgent = (agent: Agent) => {
        sessionStorage.setItem('ezyai_agent_config', JSON.stringify({
            systemPrompt: agent.systemPrompt,
            provider: agent.provider,
            model: agent.model,
            temperature: agent.temperature,
            maxTokens: agent.maxTokens,
            agentName: agent.name,
        }));
        navigate('/ai-core');
        toast.success(`Agent "${agent.name}" loaded!`);
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="AI Agents"
                description="สร้างและจัดการ AI Agent ที่ปรับแต่งเฉพาะทาง พร้อม System Prompt และค่าเริ่มต้น"
                className="animate-fade-in-down"
                actions={
                    <button onClick={openCreateModal} className="btn-primary flex items-center gap-2 text-sm">
                        <i className="bi bi-plus-lg"></i>
                        <span>Create Agent</span>
                    </button>
                }
            />

            {/* Search */}
            <div className="relative animate-fade-in-up delay-100">
                <i className="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input
                    type="text"
                    placeholder="Search agents..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input-modern pl-10 !py-2.5 max-w-md"
                />
            </div>

            {/* Agents Grid */}
            {isLoading && (
                <div className="text-xs text-gray-400">Loading custom agents...</div>
            )}
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 animate-fade-in-up delay-200">
                {filtered.map((agent) => (
                    <div key={agent.id} className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden">
                        <div className="p-5">
                            <div className="flex items-start gap-3 mb-3">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center text-2xl shadow-sm group-hover:scale-110 transition-transform duration-300">
                                    {agent.emoji}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-semibold text-gray-900 truncate">{agent.name}</h3>
                                        {agent.isBuiltIn && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium">Built-in</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{agent.description}</p>
                                </div>
                            </div>

                            {/* Config Tags */}
                            <div className="flex flex-wrap gap-1.5 mb-3">
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{agent.provider}</span>
                                {agent.model && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{agent.model}</span>}
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">T:{agent.temperature}</span>
                            </div>

                            {/* System Prompt Preview */}
                            <div className="p-2.5 rounded-lg bg-gray-50 mb-3">
                                <p className="text-[11px] text-gray-500 font-mono line-clamp-2">{agent.systemPrompt}</p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleUseAgent(agent)}
                                    className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                >
                                    <i className="bi bi-play-fill mr-1"></i>Use Agent
                                </button>
                                {!agent.isBuiltIn && (
                                    <>
                                        <button
                                            onClick={() => openEditModal(agent)}
                                            className="text-xs px-2.5 py-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                                        >
                                            <i className="bi bi-pencil"></i>
                                        </button>
                                        <button
                                            onClick={() => handleDelete(agent.id)}
                                            className="text-xs px-2.5 py-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                                        >
                                            <i className="bi bi-trash"></i>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {filtered.length === 0 && (
                <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                        <i className="bi bi-robot text-3xl text-gray-300"></i>
                    </div>
                    <p className="text-sm text-gray-500 mb-1">No agents found</p>
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={() => setShowModal(false)} />
                    <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl animate-fade-in-up max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-5">
                                <h2 className="text-lg font-bold text-gray-900">{editingAgent ? 'Edit Agent' : 'Create New Agent'}</h2>
                                <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
                                    <i className="bi bi-x-lg text-gray-500"></i>
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div className="flex gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-gray-700 mb-1 block">Emoji</label>
                                        <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border border-gray-200 bg-gray-50 w-[140px]">
                                            {emojiOptions.map(e => (
                                                <button key={e} onClick={() => setFormEmoji(e)}
                                                    className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center hover:bg-white transition-colors ${formEmoji === e ? 'bg-white shadow-sm ring-2 ring-indigo-200' : ''}`}
                                                >
                                                    {e}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex-1 space-y-3">
                                        <div>
                                            <label className="text-xs font-medium text-gray-700 mb-1 block">Name *</label>
                                            <input value={formName} onChange={(e) => setFormName(e.target.value)} className="input-modern" placeholder="e.g. My Code Reviewer" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-700 mb-1 block">Description</label>
                                            <input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} className="input-modern" placeholder="Short description" />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-gray-700 mb-1 block">System Prompt *</label>
                                    <textarea
                                        value={formPrompt}
                                        onChange={(e) => setFormPrompt(e.target.value)}
                                        className="input-modern min-h-[100px] resize-y font-mono text-sm"
                                        placeholder="Instructions for the AI agent..."
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-gray-700 mb-1 block">Default Provider</label>
                                        <select value={formProvider} onChange={(e) => setFormProvider(e.target.value)} className="input-modern">
                                            <option value="gemini">Gemini</option>
                                            <option value="openrouter">OpenRouter</option>
                                            <option value="groq">Groq</option>
                                            <option value="aimlapi">Aimlapi</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-700 mb-1 block">Default Model</label>
                                        <input value={formModel} onChange={(e) => setFormModel(e.target.value)} className="input-modern" placeholder="optional" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-gray-700 mb-1 block">Temperature ({formTemp})</label>
                                        <input type="range" min="0" max="2" step="0.1" value={formTemp} onChange={(e) => setFormTemp(parseFloat(e.target.value))} className="w-full accent-indigo-600" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-700 mb-1 block">Max Tokens</label>
                                        <input type="number" value={formMaxTokens} onChange={(e) => setFormMaxTokens(parseInt(e.target.value) || 1024)} className="input-modern" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-6">
                                <button onClick={() => setShowModal(false)} className="btn-secondary text-sm">Cancel</button>
                                <button onClick={handleSave} className="btn-primary text-sm">
                                    <i className="bi bi-save mr-1.5"></i>{editingAgent ? 'Update' : 'Create'} Agent
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
