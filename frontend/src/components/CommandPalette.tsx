import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

interface CommandItem {
    id: string;
    label: string;
    icon: string;
    description?: string;
    action: () => void;
    category: string;
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const commands: CommandItem[] = useMemo(() => [
        // Navigation
        { id: 'nav-dash', label: 'Go to Dashboard', icon: 'bi-grid-1x2', category: 'Navigation', action: () => { navigate('/dashboard'); onClose(); } },
        { id: 'nav-test', label: 'Go to Chat Core', icon: 'bi-chat-dots', category: 'Navigation', action: () => { navigate('/ai-core'); onClose(); } },
        { id: 'nav-tutor', label: 'Go to Edu Tutor', icon: 'bi-mortarboard', category: 'Navigation', action: () => { navigate('/education-tutor'); onClose(); } },
        { id: 'nav-image', label: 'Go to Image Gen', icon: 'bi-image', category: 'Navigation', action: () => { navigate('/image-gen'); onClose(); } },
        { id: 'nav-media', label: 'Go to Video/Audio Summarize', icon: 'bi-camera-video', category: 'Navigation', action: () => { navigate('/media-summarize'); onClose(); } },
        { id: 'nav-repurpose', label: 'Go to Content Re-purpose', icon: 'bi-share', category: 'Navigation', action: () => { navigate('/content-repurpose'); onClose(); } },
        { id: 'nav-compare', label: 'Go to Multi-Model Compare', icon: 'bi-layout-split', category: 'Navigation', action: () => { navigate('/compare'); onClose(); } },
        { id: 'nav-agents', label: 'Go to AI Agents', icon: 'bi-robot', category: 'Navigation', action: () => { navigate('/agents'); onClose(); } },
        { id: 'nav-prompts', label: 'Go to Prompt Library', icon: 'bi-collection', category: 'Navigation', action: () => { navigate('/prompts'); onClose(); } },
        { id: 'nav-keys', label: 'Go to API Keys', icon: 'bi-key', category: 'Navigation', action: () => { navigate('/settings/api-keys'); onClose(); } },
        { id: 'nav-history', label: 'Go to History', icon: 'bi-clock-history', category: 'Navigation', action: () => { navigate('/history'); onClose(); } },
        // Actions
        { id: 'act-newchat', label: 'Start New Chat', icon: 'bi-plus-circle', description: 'Open Chat Core with a fresh conversation', category: 'Actions', action: () => { navigate('/ai-core'); onClose(); } },
        {
            id: 'act-dark', label: 'Toggle Dark Mode', icon: 'bi-moon', category: 'Actions', action: () => {
                const html = document.documentElement;
                html.classList.toggle('dark');
                localStorage.setItem('ezyai_theme', html.classList.contains('dark') ? 'dark' : 'light');
                onClose();
            }
        },
        {
            id: 'act-export', label: 'Export All Data', icon: 'bi-download', description: 'Download backup of prompts, agents, history', category: 'Actions', action: () => {
                const data: Record<string, any> = {};
                ['ezyai_conversation_history', 'ezyai_agents', 'ezyai_custom_prompts', 'ezyai_starred_prompts'].forEach(key => {
                    const val = localStorage.getItem(key);
                    if (val) data[key] = JSON.parse(val);
                });
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `ezyai_backup_${Date.now()}.json`; a.click();
                URL.revokeObjectURL(url);
                onClose();
            }
        },
    ], [navigate, onClose]);

    const filtered = useMemo(() => {
        if (!search.trim()) return commands;
        const q = search.toLowerCase();
        return commands.filter(c =>
            c.label.toLowerCase().includes(q) ||
            c.category.toLowerCase().includes(q) ||
            c.description?.toLowerCase().includes(q)
        );
    }, [commands, search]);

    const grouped = useMemo(() => {
        const groups: Record<string, CommandItem[]> = {};
        filtered.forEach(c => {
            if (!groups[c.category]) groups[c.category] = [];
            groups[c.category].push(c);
        });
        return groups;
    }, [filtered]);

    useEffect(() => {
        if (isOpen) {
            setSearch('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [search]);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, 0));
            }
            if (e.key === 'Enter' && filtered[selectedIndex]) {
                e.preventDefault();
                filtered[selectedIndex].action();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, filtered, selectedIndex, onClose]);

    // Scroll selected item into view
    useEffect(() => {
        const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    if (!isOpen) return null;

    let flatIndex = -1;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
            <div className="relative z-10 w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-cmd-slide-down">
                {/* Search Input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                    <i className="bi bi-search text-gray-400"></i>
                    <input
                        ref={inputRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Type a command or search..."
                        className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
                    />
                    <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">ESC</kbd>
                </div>

                {/* Results */}
                <div ref={listRef} className="max-h-[50vh] overflow-y-auto custom-scrollbar p-2">
                    {filtered.length === 0 ? (
                        <div className="text-center py-8 text-sm text-gray-400">
                            <i className="bi bi-search text-2xl block mb-2"></i>
                            No results found
                        </div>
                    ) : (
                        Object.entries(grouped).map(([category, items]) => (
                            <div key={category}>
                                <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{category}</div>
                                {items.map((item) => {
                                    flatIndex++;
                                    const idx = flatIndex;
                                    return (
                                        <button
                                            key={item.id}
                                            data-index={idx}
                                            onClick={item.action}
                                            onMouseEnter={() => setSelectedIndex(idx)}
                                            className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors ${selectedIndex === idx
                                                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                                }`}
                                        >
                                            <i className={`bi ${item.icon} text-base ${selectedIndex === idx ? 'text-indigo-500' : 'text-gray-400'}`}></i>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium truncate">{item.label}</div>
                                                {item.description && <div className="text-[11px] text-gray-400 truncate">{item.description}</div>}
                                            </div>
                                            {selectedIndex === idx && (
                                                <kbd className="hidden sm:inline-flex text-[10px] text-gray-400">↵</kbd>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4 text-[10px] text-gray-400">
                    <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">↑↓</kbd> Navigate</span>
                    <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">↵</kbd> Select</span>
                    <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">ESC</kbd> Close</span>
                </div>
            </div>
        </div>
    );
}
