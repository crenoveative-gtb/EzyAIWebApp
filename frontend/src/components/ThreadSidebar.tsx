import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, del } from '../services/api';
import { subscribeDataSync } from '../lib/dataSync';
import toast from 'react-hot-toast';

interface Conversation {
    id: string;
    title: string;
    provider: string;
    model: string;
    agent_name?: string;
    created_at: string;
    updated_at: string;
    message_count: number;
}

interface ThreadSidebarProps {
    activeThreadId?: string | null;
    onNewChat: () => void;
}

export default function ThreadSidebar({ activeThreadId, onNewChat }: ThreadSidebarProps) {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncTick, setSyncTick] = useState(0);
    const navigate = useNavigate();

    useEffect(() => {
        const unsubscribe = subscribeDataSync(() => {
            setSyncTick((prev) => prev + 1);
        }, { topics: ['conversations'] });
        return unsubscribe;
    }, []);

    useEffect(() => {
        void loadConversations();
    }, [syncTick]);

    const isTransientAuthError = (error: unknown) => {
        const message = String((error as { message?: string } | undefined)?.message || '').toLowerCase();
        return (
            message.includes('missing bearer token') ||
            message.includes('invalid or expired token') ||
            message.includes('lockmanager') ||
            message.includes('auth-token') ||
            message.includes('timed out')
        );
    };

    const loadConversations = async () => {
        try {
            const response = await get<{ success: boolean; data: { conversations: Conversation[] } }>('/api/conversations');
            if (response.success && response.data) {
                setConversations(response.data.conversations);
            }
        } catch (error) {
            if (!isTransientAuthError(error)) {
                console.error('Failed to load conversations:', error);
                toast.error('Failed to load conversation history');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Delete this conversation?')) return;

        try {
            await del(`/api/conversations/${id}`);
            setConversations(prev => prev.filter(c => c.id !== id));
            toast.success('Conversation deleted');

            if (activeThreadId === id) {
                navigate('/ai-core');
                onNewChat();
            }
        } catch (error) {
            console.error('Failed to delete conversation:', error);
            toast.error('Failed to delete conversation');
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {loading ? (
                    <div className="flex items-center justify-center p-8 text-gray-400">
                        <i className="bi bi-arrow-repeat animate-spin mr-2"></i>
                        Loading...
                    </div>
                ) : conversations.length === 0 ? (
                    <div className="text-center p-8 text-gray-400 text-sm">
                        No conversations yet
                    </div>
                ) : (
                    conversations.map(conv => (
                        <div
                            key={conv.id}
                            onClick={() => navigate(`/ai-core?thread=${conv.id}`)}
                            className={`group relative p-3 rounded-xl cursor-pointer transition-all ${activeThreadId === conv.id
                                ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'
                                }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className={`text-sm font-medium truncate ${activeThreadId === conv.id
                                        ? 'text-indigo-700 dark:text-indigo-300'
                                        : 'text-gray-900 dark:text-gray-100'
                                        }`}>
                                        {conv.title}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-gray-500 truncate">{conv.model}</span>
                                        <span className="text-[10px] text-gray-400">•</span>
                                        <span className="text-[10px] text-gray-400">{conv.message_count} msgs</span>
                                    </div>
                                    {conv.agent_name && (
                                        <div className="mt-1">
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                                <i className="bi bi-robot mr-0.5"></i>{conv.agent_name}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={(e) => handleDelete(conv.id, e)}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition-opacity p-1"
                                    title="Delete"
                                >
                                    <i className="bi bi-trash text-xs"></i>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-200 dark:border-gray-800 text-center">
                <span className="text-[10px] text-gray-400">
                    {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
                </span>
            </div>
        </div>
    );
}
