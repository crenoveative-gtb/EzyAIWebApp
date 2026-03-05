import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { del, get, post, put } from '../services/api';
import type { ApiResponse } from '../types';
import { subscribeDataSync } from '../lib/dataSync';

interface Prompt {
    id: string;
    name: string;
    description: string;
    category: string;
    text: string;
    starred: boolean;
    isCustom: boolean;
    createdAt: string;
}

const categories = ['All', 'Coding', 'Writing', 'Marketing', 'Analysis', 'Translation', 'Custom'];

const builtInPrompts: Prompt[] = [
    { id: 'b1', name: 'Code Reviewer', description: 'Review code and suggest improvements', category: 'Coding', text: 'You are an expert code reviewer. Analyze the following code for bugs, performance issues, security vulnerabilities, and suggest improvements with explanations.\n\n```\n[Paste your code here]\n```', starred: false, isCustom: false, createdAt: '' },
    { id: 'b2', name: 'Unit Test Generator', description: 'Generate comprehensive unit tests', category: 'Coding', text: 'Generate comprehensive unit tests for the following code. Include edge cases, error handling, and meaningful test descriptions.\n\n```\n[Paste your code here]\n```', starred: false, isCustom: false, createdAt: '' },
    { id: 'b3', name: 'Refactor Assistant', description: 'Refactor code for better quality', category: 'Coding', text: 'Refactor the following code to improve readability, maintainability, and performance. Explain each change you make.\n\n```\n[Paste your code here]\n```', starred: false, isCustom: false, createdAt: '' },
    { id: 'b4', name: 'Blog Post Writer', description: 'Write SEO-optimized blog posts', category: 'Writing', text: 'Write a comprehensive, SEO-optimized blog post about: [TOPIC]\n\nRequirements:\n- Engaging title and subtitle\n- Introduction with hook\n- 3-5 main sections with headers\n- Conclusion with CTA\n- Professional but approachable tone\n- 800-1200 words', starred: false, isCustom: false, createdAt: '' },
    { id: 'b5', name: 'Email Composer', description: 'Write professional emails', category: 'Writing', text: 'Write a professional email for the following situation:\n\nContext: [DESCRIBE SITUATION]\nTone: [formal/casual/friendly]\nRecipient: [WHO]\nGoal: [WHAT YOU WANT TO ACHIEVE]\n\nKeep it concise and actionable.', starred: false, isCustom: false, createdAt: '' },
    { id: 'b6', name: 'Story Generator', description: 'Create creative short stories', category: 'Writing', text: 'Write a creative short story based on these parameters:\n\nGenre: [GENRE]\nSetting: [SETTING]\nMain Character: [CHARACTER DESCRIPTION]\nConflict: [MAIN CONFLICT]\nTone: [DARK/LIGHT/HUMOROUS/DRAMATIC]\n\nLength: approximately 500 words.', starred: false, isCustom: false, createdAt: '' },
    { id: 'b7', name: 'Social Media Strategy', description: 'Plan social media campaigns', category: 'Marketing', text: 'Create a 7-day social media content plan for:\n\nBrand: [BRAND NAME]\nIndustry: [INDUSTRY]\nTarget Audience: [AUDIENCE]\nPlatform: [PLATFORM]\nGoal: [AWARENESS/ENGAGEMENT/CONVERSIONS]\n\nInclude post ideas, captions, hashtags, and best posting times.', starred: false, isCustom: false, createdAt: '' },
    { id: 'b8', name: 'Ad Copy Generator', description: 'Write compelling ad copy', category: 'Marketing', text: 'Write 5 variations of ad copy for:\n\nProduct/Service: [PRODUCT]\nTarget Audience: [AUDIENCE]\nUSP: [UNIQUE SELLING POINT]\nFormat: [Facebook Ad/Google Ad/Instagram]\nCTA: [DESIRED ACTION]\n\nEach variation should have a hook, body, and clear CTA.', starred: false, isCustom: false, createdAt: '' },
    { id: 'b9', name: 'Data Analyst', description: 'Analyze data and create reports', category: 'Analysis', text: 'Analyze the following data and provide:\n\n1. Key insights and patterns\n2. Statistical summary\n3. Trends and correlations\n4. Actionable recommendations\n5. Visualizations suggestions\n\nData:\n[PASTE YOUR DATA HERE]', starred: false, isCustom: false, createdAt: '' },
    { id: 'b10', name: 'SWOT Analysis', description: 'Conduct strategic analysis', category: 'Analysis', text: 'Conduct a comprehensive SWOT analysis for:\n\nCompany/Product: [NAME]\nIndustry: [INDUSTRY]\nContext: [ADDITIONAL CONTEXT]\n\nProvide detailed points for each quadrant (Strengths, Weaknesses, Opportunities, Threats) and strategic recommendations.', starred: false, isCustom: false, createdAt: '' },
    { id: 'b11', name: 'User Research Summary', description: 'Summarize UX research findings', category: 'Analysis', text: 'Summarize the following user research data into actionable insights:\n\n[PASTE RESEARCH DATA/NOTES]\n\nProvide:\n1. Key findings\n2. User pain points\n3. User needs/wants\n4. Personas (if applicable)\n5. Design recommendations\n6. Priority matrix', starred: false, isCustom: false, createdAt: '' },
    { id: 'b12', name: 'Thai-English Translator', description: 'Accurate TH↔EN translation', category: 'Translation', text: 'Translate the following text accurately while maintaining:\n- Natural tone and context\n- Proper grammar\n- Cultural nuances\n- Professional terminology\n\nFrom: [SOURCE LANGUAGE]\nTo: [TARGET LANGUAGE]\n\nText:\n[PASTE TEXT HERE]', starred: false, isCustom: false, createdAt: '' },
    { id: 'b13', name: 'Technical Doc Translator', description: 'Translate technical documents', category: 'Translation', text: 'Translate the following technical documentation while:\n- Keeping technical terms accurate\n- Maintaining code snippets unchanged\n- Preserving formatting\n- Using industry-standard terminology\n\nSource Language: [LANG]\nTarget Language: [LANG]\n\n[PASTE DOCUMENT HERE]', starred: false, isCustom: false, createdAt: '' },
    { id: 'b14', name: 'API Documentation Writer', description: 'Generate API docs from code', category: 'Coding', text: 'Generate comprehensive API documentation for the following code/endpoint:\n\n```\n[PASTE CODE OR API DETAILS]\n```\n\nInclude: description, parameters, request/response examples, error codes, and usage notes.', starred: false, isCustom: false, createdAt: '' },
    { id: 'b15', name: 'Product Description', description: 'Write compelling product descriptions', category: 'Marketing', text: 'Write a compelling product description for:\n\nProduct: [PRODUCT NAME]\nCategory: [CATEGORY]\nKey Features: [LIST FEATURES]\nTarget Customer: [AUDIENCE]\nPrice Point: [PRICE RANGE]\n\nInclude: tagline, short description (50 words), full description (150 words), key benefits (bullet points).', starred: false, isCustom: false, createdAt: '' },
];


export default function PromptLibraryPage() {
    const navigate = useNavigate();
    const [customPrompts, setCustomPrompts] = useState<Prompt[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // New prompt form state
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newCategory, setNewCategory] = useState('Custom');
    const [newText, setNewText] = useState('');

    const loadCustomPrompts = async () => {
        try {
            setIsLoading(true);
            const response = await get<ApiResponse<{ prompts: Array<any> }>>('/api/prompt-library');
            if (!response.success || !response.data) {
                throw new Error(response.error || 'Failed to load custom prompts');
            }
            const mapped: Prompt[] = (response.data.prompts || []).map((item) => ({
                id: String(item.id),
                name: String(item.name || ''),
                description: String(item.description || ''),
                category: String(item.category || 'Custom'),
                text: String(item.text || ''),
                starred: !!item.starred,
                isCustom: true,
                createdAt: String(item.created_at || item.createdAt || '')
            }));
            setCustomPrompts(mapped);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to load custom prompts');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadCustomPrompts();
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeDataSync(() => {
            void loadCustomPrompts();
        }, { topics: ['library'] });
        return unsubscribe;
    }, []);

    const allPrompts = useMemo(() => [...builtInPrompts, ...customPrompts], [customPrompts]);

    const filteredPrompts = useMemo(() => {
        return allPrompts.filter((p) => {
            const matchCategory = selectedCategory === 'All' || p.category === selectedCategory;
            const matchSearch = !searchQuery ||
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.text.toLowerCase().includes(searchQuery.toLowerCase());
            return matchCategory && matchSearch;
        });
    }, [allPrompts, selectedCategory, searchQuery]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard!');
    };

    const handleUseInChat = (text: string) => {
        sessionStorage.setItem('ezyai_prefill_prompt', text);
        navigate('/ai-core');
        toast.success('Prompt loaded! Go to AI Test');
    };

    const handleCreate = async () => {
        if (!newName.trim() || !newText.trim()) {
            toast.error('Name and prompt text are required');
            return;
        }
        try {
            const response = await post<ApiResponse<any>>('/api/prompt-library', {
                name: newName.trim(),
                description: newDesc.trim(),
                category: newCategory,
                text: newText.trim(),
                starred: false
            });
            if (!response.success || !response.data) {
                throw new Error(response.error || 'Failed to create prompt');
            }

            const created: Prompt = {
                id: String(response.data.id),
                name: String(response.data.name || newName.trim()),
                description: String(response.data.description || newDesc.trim()),
                category: String(response.data.category || newCategory),
                text: String(response.data.text || newText.trim()),
                starred: !!response.data.starred,
                isCustom: true,
                createdAt: String(response.data.created_at || new Date().toISOString())
            };

            setCustomPrompts((prev) => [created, ...prev]);
            setShowCreateModal(false);
            setNewName('');
            setNewDesc('');
            setNewCategory('Custom');
            setNewText('');
            toast.success('Prompt saved!');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to create prompt');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const response = await del<ApiResponse<any>>(`/api/prompt-library/${id}`);
            if (!response.success) {
                throw new Error(response.error || 'Failed to delete prompt');
            }
            setCustomPrompts((prev) => prev.filter((p) => p.id !== id));
            toast.success('Prompt deleted');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to delete prompt');
        }
    };

    const handleToggleStar = async (id: string) => {
        // For custom prompts, persist star
        const idx = customPrompts.findIndex(p => p.id === id);
        if (idx !== -1) {
            const nextStarred = !customPrompts[idx].starred;
            try {
                const response = await put<ApiResponse<any>>(`/api/prompt-library/${id}`, { starred: nextStarred });
                if (!response.success) {
                    throw new Error(response.error || 'Failed to update prompt');
                }
                setCustomPrompts((prev) => prev.map((item) => item.id === id ? { ...item, starred: nextStarred } : item));
            } catch (error: any) {
                toast.error(error?.message || 'Failed to update prompt');
            }
        }
    };

    const categoryColors: Record<string, string> = {
        Coding: 'bg-blue-50 text-blue-700 border-blue-100',
        Writing: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        Marketing: 'bg-pink-50 text-pink-700 border-pink-100',
        Analysis: 'bg-amber-50 text-amber-700 border-amber-100',
        Translation: 'bg-purple-50 text-purple-700 border-purple-100',
        Custom: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Prompt Library"
                description="คลังเทมเพลตพรอมท์สำเร็จรูป สร้าง ค้นหา และนำไปใช้ได้ทันที"
                className="animate-fade-in-down"
                actions={
                    <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2 text-sm">
                        <i className="bi bi-plus-lg"></i>
                        <span>Create Prompt</span>
                    </button>
                }
            />

            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row gap-3 animate-fade-in-up delay-100">
                <div className="relative flex-1">
                    <i className="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                    <input
                        type="text"
                        placeholder="Search prompts..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input-modern pl-10 !py-2.5"
                    />
                </div>
                <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap border transition-all duration-200
                ${selectedCategory === cat
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Results count */}
            <p className="text-xs text-gray-400">{filteredPrompts.length} prompts found</p>

            {/* Prompts Grid */}
            {isLoading && (
                <div className="text-xs text-gray-400">Loading custom prompts...</div>
            )}
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 animate-fade-in-up delay-200">
                {filteredPrompts.map((prompt) => (
                    <div
                        key={prompt.id}
                        className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
                    >
                        <div className="p-5">
                            <div className="flex items-start justify-between mb-2">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-sm font-semibold text-gray-900 truncate">{prompt.name}</h3>
                                        {prompt.isCustom && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">Custom</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 line-clamp-1">{prompt.description}</p>
                                </div>
                                <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full border ${categoryColors[prompt.category] || 'bg-gray-50 text-gray-600 border-gray-100'}`}>
                                    {prompt.category}
                                </span>
                            </div>

                            {/* Preview */}
                            <div
                                className="mt-3 p-3 rounded-lg bg-gray-50 text-xs text-gray-600 font-mono cursor-pointer hover:bg-gray-100 transition-colors"
                                onClick={() => setExpandedId(expandedId === prompt.id ? null : prompt.id)}
                            >
                                {expandedId === prompt.id ? (
                                    <pre className="whitespace-pre-wrap break-words">{prompt.text}</pre>
                                ) : (
                                    <p className="line-clamp-3">{prompt.text}</p>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 mt-3">
                                <button
                                    onClick={() => handleUseInChat(prompt.text)}
                                    className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                >
                                    <i className="bi bi-play-fill mr-1"></i>Use
                                </button>
                                <button
                                    onClick={() => handleCopy(prompt.text)}
                                    className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
                                >
                                    <i className="bi bi-clipboard mr-1"></i>Copy
                                </button>
                                {prompt.isCustom && (
                                    <button
                                        onClick={() => handleDelete(prompt.id)}
                                        className="text-xs px-2.5 py-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                        <i className="bi bi-trash"></i>
                                    </button>
                                )}
                                <button
                                    onClick={() => handleToggleStar(prompt.id)}
                                    className="text-xs px-2.5 py-2 rounded-lg text-amber-500 hover:bg-amber-50 transition-colors"
                                >
                                    <i className={`bi ${prompt.starred ? 'bi-star-fill' : 'bi-star'}`}></i>
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {filteredPrompts.length === 0 && (
                <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                        <i className="bi bi-search text-3xl text-gray-300"></i>
                    </div>
                    <p className="text-sm text-gray-500 mb-1">No prompts found</p>
                    <p className="text-xs text-gray-400">Try a different search term or category</p>
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={() => setShowCreateModal(false)} />
                    <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl animate-fade-in-up">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-5">
                                <h2 className="text-lg font-bold text-gray-900">Create New Prompt</h2>
                                <button onClick={() => setShowCreateModal(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
                                    <i className="bi bi-x-lg text-gray-500"></i>
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-medium text-gray-700 mb-1 block">Name *</label>
                                    <input value={newName} onChange={(e) => setNewName(e.target.value)} className="input-modern" placeholder="e.g. My Custom Prompt" />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-700 mb-1 block">Description</label>
                                    <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="input-modern" placeholder="Short description" />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-700 mb-1 block">Category</label>
                                    <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="input-modern">
                                        {categories.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-700 mb-1 block">Prompt Text *</label>
                                    <textarea
                                        value={newText}
                                        onChange={(e) => setNewText(e.target.value)}
                                        className="input-modern min-h-[120px] resize-y font-mono text-sm"
                                        placeholder="Your prompt template..."
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-6">
                                <button onClick={() => setShowCreateModal(false)} className="btn-secondary text-sm">Cancel</button>
                                <button onClick={handleCreate} className="btn-primary text-sm">
                                    <i className="bi bi-save mr-1.5"></i>Save Prompt
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
