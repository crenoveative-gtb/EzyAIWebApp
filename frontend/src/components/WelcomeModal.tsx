import { useState, useEffect } from 'react';

const ONBOARDING_KEY = 'ezyai_onboarding_done';

interface Slide {
    emoji: string;
    title: string;
    description: string;
    color: string;
}

const slides: Slide[] = [
    {
        emoji: '🚀',
        title: 'Welcome to EzyAIAgent',
        description: 'แพลตฟอร์ม AI Agent ครบวงจร — ทดสอบ สร้าง และเปรียบเทียบโมเดล AI ได้ทุกรูปแบบ',
        color: 'from-indigo-500 to-purple-600',
    },
    {
        emoji: '💬',
        title: 'AI Test & Chat',
        description: 'สนทนากับ AI หลาย Providers (Gemini, OpenRouter, Groq, Aimlapi) พร้อม System Prompt และ Markdown rendering',
        color: 'from-blue-500 to-cyan-500',
    },
    {
        emoji: '🎓',
        title: 'Adaptive Edu Tutor',
        description: 'ติวเตอร์ AI ส่วนตัวที่เน้นการถามเช็กความเข้าใจ (Socratic) และปรับแผนติวตามจุดอ่อนของผู้เรียน',
        color: 'from-sky-500 to-indigo-500',
    },
    {
        emoji: '🤖',
        title: 'AI Agents Builder',
        description: 'สร้าง Agent เฉพาะทางด้วย System Prompt ของคุณเอง — Code Assistant, Writing Coach และอื่นๆ',
        color: 'from-emerald-500 to-teal-500',
    },
    {
        emoji: '⚡',
        title: 'Multi-Model Compare',
        description: 'ส่ง Prompt เดียวกัน เปรียบเทียบผลลัพธ์จากหลายโมเดลแบบ side-by-side',
        color: 'from-amber-500 to-orange-500',
    },
    {
        emoji: '🌙',
        title: 'Dark Mode & Ctrl+K',
        description: 'เปิด Dark Mode ได้ทันที กด Ctrl+K เพื่อค้นหาทุกอย่างแบบ keyboard-first',
        color: 'from-gray-700 to-gray-900',
    },
];

export default function WelcomeModal() {
    const [show, setShow] = useState(false);
    const [current, setCurrent] = useState(0);

    useEffect(() => {
        const done = localStorage.getItem(ONBOARDING_KEY);
        if (!done) setShow(true);
    }, []);

    const handleFinish = () => {
        localStorage.setItem(ONBOARDING_KEY, 'true');
        setShow(false);
    };

    const handleNext = () => {
        if (current < slides.length - 1) setCurrent(c => c + 1);
        else handleFinish();
    };

    const handlePrev = () => {
        if (current > 0) setCurrent(c => c - 1);
    };

    if (!show) return null;

    const slide = slides[current];

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={handleFinish} />
            <div className="relative z-10 w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden animate-fade-in-up">
                {/* Gradient Header */}
                <div className={`bg-gradient-to-br ${slide.color} p-8 text-center text-white transition-all duration-500`}>
                    <div className="text-5xl mb-3 animate-fade-in" key={current}>
                        {slide.emoji}
                    </div>
                    <h2 className="text-xl font-bold mb-2">{slide.title}</h2>
                    <p className="text-sm text-white/80 leading-relaxed">{slide.description}</p>
                </div>

                {/* Dots */}
                <div className="flex items-center justify-center gap-2 py-4">
                    {slides.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setCurrent(i)}
                            className={`w-2 h-2 rounded-full transition-all duration-300 ${i === current ? 'w-6 bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'
                                }`}
                        />
                    ))}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between px-6 pb-6">
                    <button
                        onClick={handleFinish}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        Skip all
                    </button>
                    <div className="flex items-center gap-2">
                        {current > 0 && (
                            <button onClick={handlePrev} className="btn-secondary text-xs px-4 py-2">
                                <i className="bi bi-arrow-left mr-1"></i>Back
                            </button>
                        )}
                        <button onClick={handleNext} className="btn-primary text-xs px-5 py-2">
                            {current < slides.length - 1 ? (
                                <>Next<i className="bi bi-arrow-right ml-1"></i></>
                            ) : (
                                <>Get Started<i className="bi bi-check-lg ml-1"></i></>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
