import { useState, useMemo } from 'react';
import PageHeader from '../components/PageHeader';
import toast from 'react-hot-toast';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface ConversationEntry {
    id: string;
    provider: string;
    model: string;
    preview: string;
    messages: Message[];
    timestamp: string;
    bookmarked: boolean;
}

const HISTORY_STORAGE_KEY = 'ezyai_conversation_history';

function loadHistory(): ConversationEntry[] {
    try {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveHistory(entries: ConversationEntry[]) {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
}

export default function HistoryPage() {
    const [entries, setEntries] = useState<ConversationEntry[]>(() => loadHistory());
    const [search, setSearch] = useState('');
    const [providerFilter, setProviderFilter] = useState('All');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);


    const providers = useMemo(() => {
        const set = new Set(entries.map(e => e.provider));
        return ['All', ...Array.from(set)];
    }, [entries]);

    const filtered = useMemo(() => {
        return entries
            .filter(e => {
                if (showBookmarkedOnly && !e.bookmarked) return false;
                if (providerFilter !== 'All' && e.provider !== providerFilter) return false;
                if (search) {
                    const q = search.toLowerCase();
                    return e.preview.toLowerCase().includes(q) ||
                        e.model.toLowerCase().includes(q) ||
                        e.messages.some(m => m.content.toLowerCase().includes(q));
                }
                return true;
            })
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [entries, search, providerFilter, showBookmarkedOnly]);

    const handleDelete = (id: string) => {
        const updated = entries.filter(e => e.id !== id);
        setEntries(updated);
        saveHistory(updated);
        toast.success('Deleted');
    };

    const handleDeleteAll = () => {
        if (!confirm('ลบบทสนทนาทั้งหมด?')) return;
        setEntries([]);
        saveHistory([]);
        toast.success('All conversations deleted');
    };

    const handleToggleBookmark = (id: string) => {
        const updated = entries.map(e => e.id === id ? { ...e, bookmarked: !e.bookmarked } : e);
        setEntries(updated);
        saveHistory(updated);
    };

    const handleExport = (entry: ConversationEntry, format: 'json' | 'md') => {
        let content: string;
        let filename: string;
        if (format === 'json') {
            content = JSON.stringify(entry, null, 2);
            filename = `chat_${entry.id}.json`;
        } else {
            const lines = [`# Chat with ${entry.model} (${entry.provider})`, `*${new Date(entry.timestamp).toLocaleString('th-TH')}*`, ''];
            entry.messages.forEach(m => {
                lines.push(`**${m.role === 'user' ? 'You' : 'AI'}:**`);
                lines.push(m.content);
                lines.push('');
            });
            content = lines.join('\n');
            filename = `chat_${entry.id}.md`;
        }
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported as ${format.toUpperCase()}`);
    };

    const providerColors: Record<string, string> = {
        gemini: 'bg-blue-50 text-blue-600',
        openrouter: 'bg-emerald-50 text-emerald-600',
        groq: 'bg-amber-50 text-orange-600',
        aimlapi: 'bg-purple-50 text-purple-600',
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Conversation History"
                description="ดูประวัติบทสนทนากับ AI ทั้งหมด ค้นหา บุ๊คมาร์ค และ Export"
                className="animate-fade-in-down"
                actions={
                    entries.length > 0 ? (
                        <button onClick={handleDeleteAll} className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors">
                            <i className="bi bi-trash mr-1"></i>Delete All
                        </button>
                    ) : undefined
                }
            />

            {/* Search + Filters */}
            <div className="flex flex-col sm:flex-row gap-3 animate-fade-in-up delay-100">
                <div className="relative flex-1">
                    <i className="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                    <input
                        type="text"
                        placeholder="Search conversations..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="input-modern pl-10 !py-2.5"
                    />
                </div>
                <div className="flex gap-2">
                    <select
                        value={providerFilter}
                        onChange={(e) => setProviderFilter(e.target.value)}
                        className="input-modern !w-auto text-xs !py-2.5"
                    >
                        {providers.map(p => <option key={p} value={p}>{p === 'All' ? 'All Providers' : p}</option>)}
                    </select>
                    <button
                        onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${showBookmarkedOnly ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                    >
                        <i className={`bi ${showBookmarkedOnly ? 'bi-star-fill' : 'bi-star'} mr-1`}></i>
                        Bookmarked
                    </button>
                </div>
            </div>

            {/* Results */}
            <p className="text-xs text-gray-400">{filtered.length} conversation{filtered.length !== 1 ? 's' : ''}</p>

            {filtered.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                        <i className="bi bi-clock-history text-3xl text-gray-300"></i>
                    </div>
                    <p className="text-sm text-gray-500 mb-1">
                        {entries.length === 0 ? 'ยังไม่มีประวัติบทสนทนา' : 'ไม่พบผลลัพธ์'}
                    </p>
                    <p className="text-xs text-gray-400">
                        {entries.length === 0 ? 'เริ่มแชทกับ AI ใน AI Test เพื่อสร้างประวัติ' : 'ลองเปลี่ยนคำค้นหาหรือ filter'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3 animate-fade-in-up delay-200">
                    {filtered.map((entry) => (
                        <div key={entry.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
                            <div
                                className="p-5 cursor-pointer"
                                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${providerColors[entry.provider] || 'bg-gray-50 text-gray-600'}`}>
                                                {entry.provider}
                                            </span>
                                            <span className="text-[11px] text-gray-400">{entry.model}</span>
                                            {entry.bookmarked && <i className="bi bi-star-fill text-amber-400 text-xs"></i>}
                                        </div>
                                        <p className="text-sm text-gray-900 line-clamp-2">{entry.preview}</p>
                                        <p className="text-[11px] text-gray-400 mt-1">
                                            {new Date(entry.timestamp).toLocaleString('th-TH')} · {entry.messages.length} messages
                                        </p>
                                    </div>
                                    <i className={`bi bi-chevron-${expandedId === entry.id ? 'up' : 'down'} text-gray-400 ml-3`}></i>
                                </div>
                            </div>

                            {expandedId === entry.id && (
                                <div className="border-t border-gray-100 animate-fade-in">
                                    <div className="p-5 space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
                                        {entry.messages.map((msg, i) => (
                                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${msg.role === 'user'
                                                    ? 'bg-indigo-600 text-white rounded-br-md'
                                                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                                                    }`}>
                                                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                                        <button onClick={() => handleToggleBookmark(entry.id)} className="text-xs px-3 py-1.5 rounded-lg hover:bg-white transition-colors text-gray-600">
                                            <i className={`bi ${entry.bookmarked ? 'bi-star-fill text-amber-500' : 'bi-star'} mr-1`}></i>
                                            {entry.bookmarked ? 'Bookmarked' : 'Bookmark'}
                                        </button>
                                        <button onClick={() => handleExport(entry, 'md')} className="text-xs px-3 py-1.5 rounded-lg hover:bg-white transition-colors text-gray-600">
                                            <i className="bi bi-markdown mr-1"></i>Export MD
                                        </button>
                                        <button onClick={() => handleExport(entry, 'json')} className="text-xs px-3 py-1.5 rounded-lg hover:bg-white transition-colors text-gray-600">
                                            <i className="bi bi-filetype-json mr-1"></i>Export JSON
                                        </button>
                                        <div className="flex-1"></div>
                                        <button onClick={() => handleDelete(entry.id)} className="text-xs px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors">
                                            <i className="bi bi-trash mr-1"></i>Delete
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
