// Vision capability detection for AI models

export interface VisionCapability {
    supportsVision: boolean;
    supportsImageUpload: boolean;
}

const VISION_MODELS = {
    gemini: [
        'gemini-pro-vision',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-2.0',
        'gemini-2.5',
        'gemini-3',
        'gemini-exp'
    ],
    openrouter: [
        'gpt-4-vision',
        'gpt-4o',
        'gpt-4-turbo',
        'claude-3',
        'claude-3.5',
        'pixtral',
        'llava',
        'vision'
    ],
    groq: [
        'llava',
        'vision'
    ],
    aimlapi: [
        'gpt-4o',
        'gpt-4-vision',
        'claude-3',
        'llava',
        'vision'
    ]
};

/**
 * Check if a model supports vision/image input
 */
export function supportsVision(provider: string, model: string): boolean {
    if (!provider || !model) return false;

    const normalizedModel = model.toLowerCase();
    const providerModels = VISION_MODELS[provider as keyof typeof VISION_MODELS];

    if (!providerModels) return false;

    return providerModels.some(keyword =>
        normalizedModel.includes(keyword.toLowerCase())
    );
}

/**
 * Get vision capability info for a model
 */
export function getVisionCapability(provider: string, model: string): VisionCapability {
    const hasVision = supportsVision(provider, model);

    return {
        supportsVision: hasVision,
        supportsImageUpload: hasVision
    };
}

/**
 * Get display badge for model capabilities
 */
export function getCapabilityBadge(provider: string, model: string): {
    text: string;
    className: string;
    icon: string;
} {
    const hasVision = supportsVision(provider, model);

    if (hasVision) {
        return {
            text: 'Vision',
            className: 'badge bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
            icon: 'bi-image'
        };
    }

    return {
        text: 'Text only',
        className: 'badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
        icon: 'bi-chat-text'
    };
}
