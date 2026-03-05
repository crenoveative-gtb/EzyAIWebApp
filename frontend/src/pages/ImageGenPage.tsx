import { useEffect, useMemo, useRef, useState } from 'react';
import puter from '@heyputer/puter.js';
import toast from 'react-hot-toast';
import PageHeader from '../components/PageHeader';
import { del, get, post } from '../services/api';
import { subscribeDataSync } from '../lib/dataSync';
import type { ApiResponse } from '../types';

type BackendImageProvider = 'openrouter' | 'aimlapi' | 'huggingface' | 'pollinations' | 'pollo' | 'replicate' | 'gemini' | 'bfl' | 'renderful' | 'kie' | 'fal';
type ImageProvider = BackendImageProvider | 'puter';
type PuterImageProvider = 'openai-image-generation' | 'gemini' | 'together' | 'xai';
type GeneratedMediaType = 'image' | 'video';

interface ProviderStatusResponse {
  gemini?: { hasKey: boolean };
  openrouter?: { hasKey: boolean };
  groq?: { hasKey: boolean };
  aimlapi?: { hasKey: boolean };
  huggingface?: { hasKey: boolean };
  pollinations?: { hasKey: boolean };
  pollo?: { hasKey: boolean };
  replicate?: { hasKey: boolean };
  bfl?: { hasKey: boolean };
  renderful?: { hasKey: boolean };
  kie?: { hasKey: boolean };
  fal?: { hasKey: boolean };
}

interface GeneratedImagePayload {
  id: string;
  url: string;
  source: 'url' | 'base64' | 'storage';
  mediaType?: GeneratedMediaType;
  createdAt?: string;
  expiresAt?: string;
  secondsUntilDelete?: number;
}

interface GenerateResponseData {
  provider: BackendImageProvider;
  model: string;
  prompt: string;
  size: string;
  n: number;
  latencyMs?: number;
  images: GeneratedImagePayload[];
}

interface PolloGeneration {
  id?: string;
  status?: string;
  url?: string | null;
  mediaType?: string;
  failMsg?: string | null;
}

interface PolloGenerateResponseData {
  provider: 'pollo';
  modelPath: string;
  taskId: string | null;
  status: string | null;
  generation?: PolloGeneration | null;
  images?: GeneratedImagePayload[];
  latencyMs?: number;
}

interface PolloTaskStatusResponse {
  taskId?: string;
  generations?: PolloGeneration[];
}

interface GeneratedImageCard {
  id: string;
  url: string;
  mediaType: GeneratedMediaType;
  provider: string;
  model: string;
  prompt: string;
  size: string;
  createdAt: string;
  expiresAt?: string;
}

interface StylePreset {
  id: string;
  label: string;
  suffix: string;
  chipClass: string;
}

const imageProviders: Array<{
  id: ImageProvider;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    id: 'gemini',
    label: 'Gemini Direct',
    description: 'Google Imagen API ผ่าน Gemini key ที่บันทึกใน Settings',
    icon: 'bi-stars'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'Gemini & GPT image models (ทุกรุ่นเสียเงิน)',
    icon: 'bi-clouds'
  },
  {
    id: 'aimlapi',
    label: 'Aimlapi',
    description: '43 image models (Flux, GPT, Gemini, DALL-E, SD, etc.) ทุกรุ่นเสียเงิน',
    icon: 'bi-lightning-charge-fill'
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    description: '18 models (FLUX, SD, Qwen, GLM, etc.) มี free credits $0.10/เดือน',
    icon: 'bi-cpu'
  },
  {
    id: 'pollinations',
    label: 'Pollinations',
    description: '12 models — 6 ฟรี (Flux, GPT, Imagen4) + 6 เสียเงิน ($1≈1 pollen)',
    icon: 'bi-palette'
  },
  {
    id: 'replicate',
    label: 'Replicate',
    description: '45 text-to-image models — all PAID',
    icon: 'bi-hdd-network'
  },
  {
    id: 'bfl',
    label: 'BFL (FLUX)',
    description: 'Black Forest Labs — FLUX models (async polling)',
    icon: 'bi-brush'
  },
  {
    id: 'renderful',
    label: 'Renderful',
    description: '20 text-to-image models — all PAID ($1 free credit)',
    icon: 'bi-diagram-3'
  },
  {
    id: 'kie',
    label: 'Kie.ai',
    description: '17 text-to-image models — all PAID (credit-based)',
    icon: 'bi-palette2'
  },
  {
    id: 'fal',
    label: 'fal.ai',
    description: '18 text-to-image models — all PAID (per-image/MP)',
    icon: 'bi-gpu-card'
  },
  {
    id: 'pollo',
    label: 'Pollo',
    description: '30 text-to-image models — all PAID (credit-based)',
    icon: 'bi-film'
  },
  {
    id: 'puter',
    label: 'Puter',
    description: '38 text-to-image models — all FREE (user-pays model)',
    icon: 'bi-box-arrow-in-up-right'
  }
];

const puterProviderOptions: Array<{ id: PuterImageProvider; label: string; description: string }> = [
  { id: 'openai-image-generation', label: 'OpenAI', description: '5 models (gpt-image / dall-e)' },
  { id: 'together', label: 'Together', description: '30 models (FLUX / Imagen / SD / etc.)' },
  { id: 'gemini', label: 'Google Gemini', description: '2 models (Nano Banana)' },
  { id: 'xai', label: 'xAI', description: '1 model (grok-2-image)' }
];

const puterModelsByProvider: Record<PuterImageProvider, string[]> = {
  'openai-image-generation': [
    'gpt-image-1.5',
    'gpt-image-1',
    'gpt-image-1-mini',
    'dall-e-3',
    'dall-e-2'
  ],
  gemini: [
    'gemini-2.5-flash-image-preview',
    'gemini-3-pro-image-preview'
  ],
  together: [
    'black-forest-labs/FLUX.2-pro',
    'black-forest-labs/FLUX.2-max',
    'black-forest-labs/FLUX.2-dev',
    'black-forest-labs/FLUX.2-flex',
    'black-forest-labs/FLUX.2-klein-4b',
    'black-forest-labs/FLUX.2-klein-9b',
    'black-forest-labs/FLUX.1.1-pro',
    'black-forest-labs/FLUX.1-pro',
    'black-forest-labs/FLUX.1-dev',
    'black-forest-labs/FLUX.1-dev-lora',
    'black-forest-labs/FLUX.1-schnell',
    'black-forest-labs/FLUX.1-schnell-Free',
    'black-forest-labs/FLUX.1-krea-dev',
    'black-forest-labs/FLUX.1-kontext-pro',
    'black-forest-labs/FLUX.1-kontext-max',
    'black-forest-labs/FLUX.1-kontext-dev',
    'google/imagen-4.0-ultra',
    'google/imagen-4.0-preview',
    'google/imagen-4.0-fast',
    'stabilityai/stable-diffusion-3-medium',
    'stabilityai/stable-diffusion-xl-base-1.0',
    'ByteDance-Seed/Seedream-4.0',
    'ByteDance-Seed/Seedream-3.0',
    'HiDream-ai/HiDream-I1-Full',
    'HiDream-ai/HiDream-I1-Dev',
    'HiDream-ai/HiDream-I1-Fast',
    'ideogram/ideogram-3.0',
    'Qwen/Qwen-Image',
    'Lykon/DreamShaper',
    'RunDiffusion/Juggernaut-pro-flux'
  ],
  xai: [
    'grok-2-image'
  ]
};

const sizeOptions = [
  { id: '1024x1024', label: 'Square', hint: '1:1' },
  { id: '1536x1024', label: 'Landscape', hint: '3:2' },
  { id: '1024x1536', label: 'Portrait', hint: '2:3' },
  { id: '1792x1024', label: 'Wide', hint: '16:9' }
];

const geminiAspectRatios = [
  { id: '1:1', label: 'Square', hint: '1:1' },
  { id: '3:4', label: 'Portrait', hint: '3:4' },
  { id: '4:3', label: 'Landscape', hint: '4:3' },
  { id: '9:16', label: 'Tall', hint: '9:16' },
  { id: '16:9', label: 'Wide', hint: '16:9' }
];

const geminiImageSizes: Array<{ id: string; label: string; description: string; models: string[] }> = [
  { id: '1K', label: '1K', description: '~1024px', models: ['imagen-4.0-generate-001', 'imagen-4.0-ultra-generate-001', 'imagen-4.0-fast-generate-001'] },
  { id: '2K', label: '2K', description: '~2048px', models: ['imagen-4.0-generate-001', 'imagen-4.0-ultra-generate-001'] }
];

const outputFormatOptions = [
  { id: 'image/png', label: 'PNG', description: 'Lossless' },
  { id: 'image/jpeg', label: 'JPEG', description: 'ปรับ compression ได้' }
];

const hfSizeOptions = [
  { id: '512x512', label: '512×512', hint: '1:1' },
  { id: '768x768', label: '768×768', hint: '1:1' },
  { id: '1024x1024', label: '1024×1024', hint: '1:1' },
  { id: '768x512', label: '768×512', hint: '3:2' },
  { id: '512x768', label: '512×768', hint: '2:3' },
  { id: '1024x768', label: '1024×768', hint: '4:3' },
  { id: '768x1024', label: '768×1024', hint: '3:4' },
  { id: '1024x576', label: '1024×576', hint: '16:9' },
  { id: '576x1024', label: '576×1024', hint: '9:16' }
];

const stylePresets: StylePreset[] = [
  {
    id: 'none',
    label: 'Balanced',
    suffix: '',
    chipClass: 'border-gray-200 text-gray-600 bg-white'
  },
  {
    id: 'photo',
    label: 'Photo Real',
    suffix: 'ultra realistic, detailed texture, soft natural lighting, editorial photography',
    chipClass: 'border-teal-200 text-teal-700 bg-teal-50'
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    suffix: 'cinematic composition, dramatic light, shallow depth of field, film grain',
    chipClass: 'border-orange-200 text-orange-700 bg-orange-50'
  },
  {
    id: 'illustration',
    label: 'Illustration',
    suffix: 'high detail digital illustration, clean shapes, rich color harmony',
    chipClass: 'border-sky-200 text-sky-700 bg-sky-50'
  },
  {
    id: 'product',
    label: 'Product Shot',
    suffix: 'studio product photography, commercial advertising style, premium branding, no text',
    chipClass: 'border-emerald-200 text-emerald-700 bg-emerald-50'
  }
];

const imageKeywords = [
  'image',
  'flux',
  'stable-diffusion',
  'sdxl',
  'dall-e',
  'recraft',
  'imagen',
  'qwen-image',
  'glm-image',
  'diffusion',
  'nano-banana',
  'seedream',
  'hunyuan',
  'grok-2-image',
  'reve/',
  'uso',
  'wan2',
  'wan-2',
  'z-image',
  'kling',
  'srpo',
  'lumina',
  'auraflow',
  'hyper-sd',
  'lightning'
];

const fallbackImageModels: Record<ImageProvider, string[]> = {
  gemini: [
    'imagen-4.0-generate-001',
    'imagen-4.0-ultra-generate-001',
    'imagen-4.0-fast-generate-001'
  ],
  openrouter: [
    'google/gemini-2.5-flash-image',
    'google/gemini-3-pro-image-preview',
    'openai/gpt-5-image-mini',
    'openai/gpt-5-image'
  ],
  aimlapi: [
    'flux/schnell', 'flux/dev', 'flux-pro/v1.1', 'google/gemini-2.5-flash-image',
    'openai/gpt-image-1', 'dall-e-3', 'stable-diffusion-v35-large', 'recraft-v3'
  ],
  huggingface: [
    'black-forest-labs/FLUX.1-schnell', 'black-forest-labs/FLUX.1-dev',
    'stabilityai/stable-diffusion-xl-base-1.0', 'stabilityai/stable-diffusion-3-medium-diffusers'
  ],
  pollinations: [
    'flux', 'gptimage', 'zimage', 'imagen-4', 'klein', 'klein-large',
    'kontext', 'nanobanana', 'nanobanana-pro', 'seedream', 'seedream-pro', 'gptimage-large'
  ],
  replicate: [
    'black-forest-labs/flux-schnell', 'black-forest-labs/flux-dev', 'black-forest-labs/flux-pro',
    'google/imagen-4', 'google/nano-banana', 'recraft-ai/recraft-v3',
    'stability-ai/stable-diffusion-3.5-large', 'stability-ai/sdxl'
  ],
  bfl: [
    'flux-dev',
    'flux-2-klein-4b',
    'flux-2-klein-9b',
    'flux-2-pro',
    'flux-2-flex',
    'flux-2-max',
    'flux-kontext-pro',
    'flux-kontext-max',
    'flux-pro-1.1',
    'flux-pro-1.1-ultra'
  ],
  renderful: [
    'black-forest-labs/flux-schnell',
    'black-forest-labs/flux-dev',
    'black-forest-labs/flux-2-pro',
    'bytedance/seedream-4.5',
    'bytedance/seedream-3.0',
    'alibaba/qwen-image',
    'openai/gpt-image'
  ],
  kie: [
    '4o-image',
    'flux-kontext-pro',
    'google/imagen4',
    'google/imagen4-fast',
    'seedream/4.5-text-to-image',
    'z-image',
    'grok-imagine/text-to-image'
  ],
  fal: [
    'fal-ai/flux/schnell',
    'fal-ai/flux/dev',
    'fal-ai/flux-2-pro',
    'fal-ai/nano-banana',
    'fal-ai/qwen-image',
    'fal-ai/recraft/v3/text-to-image',
    'xai/grok-imagine-image'
  ],
  pollo: [
    'pollo-image-v2',
    'flux-schnell',
    'flux-dev',
    'seedream-4-5',
    'nano-banana',
    'gpt-4o',
    'wan-v2-2-flash'
  ],
  puter: ['gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini', 'dall-e-3', 'dall-e-2']
};

const bflModelPrices: Record<string, string> = {
  'flux-dev': '$0.025',
  'flux-2-klein-4b': 'from $0.014',
  'flux-2-klein-9b': 'from $0.015',
  'flux-2-pro': 'from $0.03',
  'flux-2-flex': '$0.05',
  'flux-2-max': 'from $0.04',
  'flux-kontext-pro': '$0.04',
  'flux-kontext-max': '$0.08',
  'flux-pro-1.1': '$0.04',
  'flux-pro-1.1-ultra': '$0.06'
};

const PUTER_USERNAME_STORAGE_KEY = 'ezyai_puter_username';
const PUTER_TEMP_USER_STORAGE_KEY = 'ezyai_puter_temp_user';
const IMAGE_GEN_SETTINGS_STORAGE_KEY = 'ezyai_image_gen_settings';
const OPENROUTER_VERIFIED_IMAGE_MODELS = [
  'google/gemini-2.5-flash-image',
  'google/gemini-3-pro-image-preview',
  'openai/gpt-5-image-mini',
  'openai/gpt-5-image'
];

const openrouterModelPrices: Record<string, string> = {
  'google/gemini-2.5-flash-image': '$0.0003/1K tokens',
  'google/gemini-3-pro-image-preview': '$0.002/1K tokens',
  'openai/gpt-5-image-mini': '$0.0025/1K tokens',
  'openai/gpt-5-image': '$0.01/1K tokens'
};

const AIMLAPI_VERIFIED_IMAGE_MODELS = [
  // --- Flux (Black Forest Labs) ---
  'flux/schnell',
  'flux/dev',
  'flux-realism',
  'flux-pro',
  'flux-pro/v1.1',
  'flux-pro/v1.1-ultra',
  'flux/kontext-pro/text-to-image',
  'flux/kontext-max/text-to-image',
  'flux/srpo',
  'blackforestlabs/flux-2',
  'blackforestlabs/flux-2-lora',
  'blackforestlabs/flux-2-pro',
  // --- Google ---
  'google/gemini-2.5-flash-image',
  'google/gemini-3-pro-image-preview',
  'google/imagen4/preview',
  'google/imagen-4.0-generate-001',
  'google/imagen-4.0-fast-generate-001',
  'google/imagen-4.0-ultra-generate-001',
  'imagen-3.0-generate-002',
  'imagen-4.0-ultra-generate-preview-06-06',
  // --- OpenAI ---
  'openai/gpt-image-1',
  'openai/gpt-image-1-mini',
  'openai/gpt-image-1-5',
  'dall-e-2',
  'dall-e-3',
  // --- Alibaba ---
  'alibaba/qwen-image',
  'alibaba/z-image-turbo',
  'alibaba/z-image-turbo-lora',
  'alibaba/wan2.2-t2i-plus',
  'alibaba/wan2.2-t2i-flash',
  'alibaba/wan2.5-t2i-preview',
  'alibaba/wan-2-6-image',
  // --- ByteDance ---
  'bytedance/seedream-3.0',
  'bytedance/seedream-v4-text-to-image',
  'bytedance/seedream-4-5',
  'bytedance/uso',
  // --- Stability AI ---
  'stable-diffusion-v3-medium',
  'stable-diffusion-v35-large',
  // --- Others ---
  'recraft-v3',
  'x-ai/grok-2-image',
  'klingai/image-o1',
  'reve/create-image',
  'hunyuan/hunyuan-image-v3-text-to-image'
];

const aimlapiModelPrices: Record<string, string> = {
  // Flux
  'flux/schnell': '$0.004/img',
  'flux/dev': '$0.033/img',
  'flux-realism': '$0.046/img',
  'flux-pro': '$0.065/img',
  'flux-pro/v1.1': '$0.052/img',
  'flux-pro/v1.1-ultra': '$0.078/img',
  'flux/kontext-pro/text-to-image': '$0.052/img',
  'flux/kontext-max/text-to-image': '$0.104/img',
  'flux/srpo': '$0.033/MP',
  'blackforestlabs/flux-2': '$0.016/MP',
  'blackforestlabs/flux-2-lora': '$0.027/MP',
  'blackforestlabs/flux-2-pro': '$0.039/MP',
  // Google
  'google/gemini-2.5-flash-image': '$0.051/img',
  'google/gemini-3-pro-image-preview': '$0.195/img',
  'google/imagen4/preview': '$0.052/img',
  'google/imagen-4.0-generate-001': '$0.052/img',
  'google/imagen-4.0-fast-generate-001': '$0.026/img',
  'google/imagen-4.0-ultra-generate-001': '$0.078/img',
  'imagen-3.0-generate-002': '$0.039/img',
  'imagen-4.0-ultra-generate-preview-06-06': '$0.078/img',
  // OpenAI
  'openai/gpt-image-1': '$0.012~0.175/img',
  'openai/gpt-image-1-mini': '$0.007/img',
  'openai/gpt-image-1-5': '$6.5+/1M tokens',
  'dall-e-2': '$0.021~0.026/img',
  'dall-e-3': '$0.052~0.104/img',
  // Alibaba
  'alibaba/qwen-image': '$0.026/img',
  'alibaba/z-image-turbo': '$0.007/MP',
  'alibaba/z-image-turbo-lora': '$0.011/MP',
  'alibaba/wan2.2-t2i-plus': '$0.065/img',
  'alibaba/wan2.2-t2i-flash': '$0.033/img',
  'alibaba/wan2.5-t2i-preview': '$0.039/img',
  'alibaba/wan-2-6-image': '$0.039/img',
  // ByteDance
  'bytedance/seedream-3.0': '$0.032/img',
  'bytedance/seedream-v4-text-to-image': '$0.032/img',
  'bytedance/seedream-4-5': '$0.052/img',
  'bytedance/uso': '$0.13/MP',
  // Stability AI
  'stable-diffusion-v3-medium': '$0.046/img',
  'stable-diffusion-v35-large': '$0.085/img',
  // Others
  'recraft-v3': '$0.052/img',
  'x-ai/grok-2-image': '$0.091/img',
  'klingai/image-o1': '$0.036/img',
  'reve/create-image': '$0.031/img',
  'hunyuan/hunyuan-image-v3-text-to-image': '$0.13/MP'
};

const HF_VERIFIED_IMAGE_MODELS = [
  // hf-inference provider (free credits eligible)
  'black-forest-labs/FLUX.1-schnell',
  'black-forest-labs/FLUX.1-dev',
  'stabilityai/stable-diffusion-xl-base-1.0',
  'stabilityai/stable-diffusion-3-medium-diffusers',
  // fal-ai provider
  'Tongyi-MAI/Z-Image-Turbo',
  'Tongyi-MAI/Z-Image',
  'Qwen/Qwen-Image-2512',
  'Qwen/Qwen-Image',
  'stabilityai/stable-diffusion-3.5-large',
  'stabilityai/stable-diffusion-3.5-medium',
  'stabilityai/stable-diffusion-3-medium',
  'zai-org/GLM-Image',
  'tencent/HunyuanImage-3.0',
  'Alpha-VLLM/Lumina-Image-2.0',
  'ByteDance/Hyper-SD',
  'fal/FLUX.2-dev-Turbo',
  'fal/AuraFlow',
  // replicate provider
  'ByteDance/SDXL-Lightning'
];

const hfModelPrices: Record<string, string> = {
  // hf-inference — pay-per-compute, eligible for free credits ($0.10/mo free, $2/mo PRO)
  'black-forest-labs/FLUX.1-schnell': 'FREE credits',
  'black-forest-labs/FLUX.1-dev': 'FREE credits',
  'stabilityai/stable-diffusion-xl-base-1.0': 'FREE credits',
  'stabilityai/stable-diffusion-3-medium-diffusers': 'FREE credits',
  // fal-ai — pay-per-compute via HF billing
  'Tongyi-MAI/Z-Image-Turbo': 'fal-ai, pay-per-use',
  'Tongyi-MAI/Z-Image': 'fal-ai, pay-per-use',
  'Qwen/Qwen-Image-2512': 'fal-ai, pay-per-use',
  'Qwen/Qwen-Image': 'fal-ai, pay-per-use',
  'stabilityai/stable-diffusion-3.5-large': 'fal-ai, pay-per-use',
  'stabilityai/stable-diffusion-3.5-medium': 'fal-ai, pay-per-use',
  'stabilityai/stable-diffusion-3-medium': 'fal-ai, pay-per-use',
  'zai-org/GLM-Image': 'fal-ai, pay-per-use',
  'tencent/HunyuanImage-3.0': 'fal-ai, pay-per-use',
  'Alpha-VLLM/Lumina-Image-2.0': 'fal-ai, pay-per-use',
  'ByteDance/Hyper-SD': 'fal-ai, pay-per-use',
  'fal/FLUX.2-dev-Turbo': 'fal-ai, pay-per-use',
  'fal/AuraFlow': 'fal-ai, pay-per-use',
  // replicate — pay-per-compute via HF billing
  'ByteDance/SDXL-Lightning': 'replicate, pay-per-use'
};

const POLLINATIONS_VERIFIED_IMAGE_MODELS = [
  // Free (ใช้ได้ฟรี มี free credits 1 pollen/hr)
  'flux',
  'gptimage',
  'zimage',
  'imagen-4',
  'klein',
  'klein-large',
  // Paid only (ต้องมี pollen credits, $1 ≈ 1 pollen)
  'kontext',
  'nanobanana',
  'nanobanana-pro',
  'seedream',
  'seedream-pro',
  'gptimage-large'
];

const pollinationsModelPrices: Record<string, string> = {
  // Free models
  'flux': 'FREE — Flux Schnell',
  'gptimage': 'FREE — GPT Image 1 Mini',
  'zimage': 'FREE — Z-Image Turbo',
  'imagen-4': 'FREE — Google Imagen 4',
  'klein': 'FREE — FLUX.2 Klein 4B',
  'klein-large': 'FREE — FLUX.2 Klein 9B',
  // Paid models ($1 ≈ 1 pollen)
  'kontext': 'PAID ~$0.04 — FLUX.1 Kontext',
  'nanobanana': 'PAID per-token — Gemini 2.5 Flash Image',
  'nanobanana-pro': 'PAID per-token — Gemini 3 Pro Image 4K',
  'seedream': 'PAID ~$0.03 — Seedream 4.0',
  'seedream-pro': 'PAID ~$0.04 — Seedream 4.5 Pro 4K',
  'gptimage-large': 'PAID per-token — GPT Image 1.5'
};

const REPLICATE_VERIFIED_IMAGE_MODELS = [
  // Black Forest Labs — Flux
  'black-forest-labs/flux-schnell',
  'black-forest-labs/flux-dev',
  'black-forest-labs/flux-pro',
  'black-forest-labs/flux-1.1-pro-ultra',
  'black-forest-labs/flux-kontext-pro',
  'black-forest-labs/flux-kontext-max',
  'black-forest-labs/flux-2-max',
  'black-forest-labs/flux-dev-lora',
  // Google
  'google/imagen-4',
  'google/imagen-4-fast',
  'google/imagen-4-ultra',
  'google/imagen-3',
  'google/imagen-3-fast',
  'google/nano-banana',
  'google/nano-banana-pro',
  // ByteDance
  'bytedance/seedream-4.5',
  'bytedance/seedream-4',
  'bytedance/seedream-3',
  'bytedance/sdxl-lightning-4step',
  // Ideogram
  'ideogram-ai/ideogram-v3-turbo',
  'ideogram-ai/ideogram-v3-quality',
  'ideogram-ai/ideogram-v3-balanced',
  'ideogram-ai/ideogram-v2',
  'ideogram-ai/ideogram-v2-turbo',
  'ideogram-ai/ideogram-v2a',
  'ideogram-ai/ideogram-v2a-turbo',
  // Recraft / Qwen / Others
  'recraft-ai/recraft-v3',
  'qwen/qwen-image',
  'luma/photon',
  'luma/photon-flash',
  'minimax/image-01',
  'tencent/hunyuan-image-3',
  'bria/image-3.2',
  'bria/fibo',
  'leonardoai/lucid-origin',
  // Stability AI
  'stability-ai/stable-diffusion-3.5-large',
  'stability-ai/stable-diffusion-3.5-large-turbo',
  'stability-ai/stable-diffusion-3.5-medium',
  'stability-ai/sdxl',
  // Prunaai / Nvidia
  'prunaai/z-image-turbo',
  'prunaai/p-image',
  'prunaai/flux-fast',
  'nvidia/sana',
  'nvidia/sana-sprint-1.6b'
];

const replicateModelPrices: Record<string, string> = {
  // Flux
  'black-forest-labs/flux-schnell': '$0.003/img',
  'black-forest-labs/flux-dev': '$0.025/img',
  'black-forest-labs/flux-pro': '$0.055/img',
  'black-forest-labs/flux-1.1-pro-ultra': '$0.06/img',
  'black-forest-labs/flux-kontext-pro': '$0.04/img',
  'black-forest-labs/flux-kontext-max': '$0.08/img',
  'black-forest-labs/flux-2-max': '$0.055/img',
  'black-forest-labs/flux-dev-lora': '$0.004/img',
  // Google
  'google/imagen-4': '$0.08/img',
  'google/imagen-4-fast': '$0.04/img',
  'google/imagen-4-ultra': '$0.12/img',
  'google/imagen-3': '$0.05/img',
  'google/imagen-3-fast': '$0.03/img',
  'google/nano-banana': '$0.02/img',
  'google/nano-banana-pro': '$0.04/img',
  // ByteDance
  'bytedance/seedream-4.5': '$0.04/img',
  'bytedance/seedream-4': '$0.035/img',
  'bytedance/seedream-3': '$0.03/img',
  'bytedance/sdxl-lightning-4step': '$0.002/img',
  // Ideogram
  'ideogram-ai/ideogram-v3-turbo': '$0.05/img',
  'ideogram-ai/ideogram-v3-quality': '$0.09/img',
  'ideogram-ai/ideogram-v3-balanced': '$0.07/img',
  'ideogram-ai/ideogram-v2': '$0.08/img',
  'ideogram-ai/ideogram-v2-turbo': '$0.05/img',
  'ideogram-ai/ideogram-v2a': '$0.08/img',
  'ideogram-ai/ideogram-v2a-turbo': '$0.05/img',
  // Others
  'recraft-ai/recraft-v3': '$0.04/img',
  'qwen/qwen-image': '$0.03/img',
  'luma/photon': '$0.03/img',
  'luma/photon-flash': '$0.02/img',
  'minimax/image-01': '$0.03/img',
  'tencent/hunyuan-image-3': '$0.03/img',
  'bria/image-3.2': '$0.03/img',
  'bria/fibo': '$0.03/img',
  'leonardoai/lucid-origin': '$0.04/img',
  // Stability AI
  'stability-ai/stable-diffusion-3.5-large': '$0.065/img',
  'stability-ai/stable-diffusion-3.5-large-turbo': '$0.04/img',
  'stability-ai/stable-diffusion-3.5-medium': '$0.035/img',
  'stability-ai/sdxl': '$0.004/img',
  // Prunaai / Nvidia
  'prunaai/z-image-turbo': '$0.003/img',
  'prunaai/p-image': '$0.002/img',
  'prunaai/flux-fast': '$0.003/img',
  'nvidia/sana': '$0.003/img',
  'nvidia/sana-sprint-1.6b': '$0.002/img'
};

/* ── Renderful verified text-to-image models (20 models, all PAID) ── */
const RENDERFUL_VERIFIED_IMAGE_MODELS = [
  // Black Forest Labs — FLUX family
  'black-forest-labs/flux-schnell',
  'black-forest-labs/flux-dev',
  'black-forest-labs/flux-dev-lora',
  'black-forest-labs/flux-2',
  'black-forest-labs/flux-2-pro',
  'black-forest-labs/flux-2-flex',
  'black-forest-labs/flux-kontext-pro',
  'black-forest-labs/flux-kontext-max',
  // ByteDance — Seedream
  'bytedance/seedream-4.5',
  'bytedance/seedream-4',
  'bytedance/seedream-3.0',
  // Alibaba
  'alibaba/z-image',
  'alibaba/qwen-image',
  'alibaba/wan-2.2',
  'alibaba/wan-2.5',
  // OpenAI
  'openai/gpt-image',
  'openai/gpt-image-1.5',
  // xAI
  'xai/grok-imagine-image',
  // Google Vertex
  'vertex/nano-banana-pro',
  'vertex/nano-banana'
];

const renderfulModelPrices: Record<string, string> = {
  // Prices from Renderful API (dollar_cost min–max per image)
  // 7 models with confirmed API pricing
  'black-forest-labs/flux-schnell': '$0.01–0.04/img',
  'black-forest-labs/flux-dev': '$0.02–0.08/img',
  'black-forest-labs/flux-2-pro': '$0.05–0.20/img',
  'bytedance/seedream-4.5': '$0.04–0.16/img',
  'bytedance/seedream-3.0': '$0.02–0.08/img',
  'alibaba/qwen-image': '$0.02/img',
  'openai/gpt-image': '$0.05/img',
  // Models listed on website but not yet in live API — PAID (price TBD)
  'black-forest-labs/flux-dev-lora': 'PAID',
  'black-forest-labs/flux-2': 'PAID',
  'black-forest-labs/flux-2-flex': 'PAID',
  'black-forest-labs/flux-kontext-pro': 'PAID',
  'black-forest-labs/flux-kontext-max': 'PAID',
  'bytedance/seedream-4': 'PAID',
  'alibaba/z-image': 'PAID',
  'alibaba/wan-2.2': 'PAID',
  'alibaba/wan-2.5': 'PAID',
  'openai/gpt-image-1.5': 'PAID',
  'xai/grok-imagine-image': 'PAID',
  'vertex/nano-banana-pro': 'PAID',
  'vertex/nano-banana': 'PAID'
};

/* ── Kie.ai verified text-to-image models (17 models, all PAID) ── */
const KIE_VERIFIED_IMAGE_MODELS = [
  // First-party endpoints
  '4o-image',
  'flux-kontext-pro',
  'flux-kontext-max',
  // Market — Black Forest Labs
  'flux-2/flex-text-to-image',
  'flux-2/pro-text-to-image',
  // Market — Google
  'google/imagen4',
  'google/imagen4-fast',
  'google/imagen4-ultra',
  'google/nano-banana',
  // Market — OpenAI
  'gpt-image/1.5-text-to-image',
  // Market — ByteDance Seedream
  'seedream/4.5-text-to-image',
  'bytedance/seedream-v4-text-to-image',
  'bytedance/seedream',
  // Market — Alibaba
  'qwen/text-to-image',
  'z-image',
  // Market — xAI
  'grok-imagine/text-to-image',
  // Market — Ideogram
  'ideogram/character'
];

const kieModelPrices: Record<string, string> = {
  // 1 credit = $0.005 USD
  '4o-image': '$0.03/img',
  'flux-kontext-pro': 'PAID',
  'flux-kontext-max': 'PAID',
  'flux-2/flex-text-to-image': '$0.07–0.12/img',
  'flux-2/pro-text-to-image': '$0.025–0.035/img',
  'google/imagen4': '$0.04/img',
  'google/imagen4-fast': '$0.02/img',
  'google/imagen4-ultra': '$0.06/img',
  'google/nano-banana': '~$0.02/img',
  'gpt-image/1.5-text-to-image': '$0.03–0.04/img',
  'seedream/4.5-text-to-image': '~$0.032/img',
  'bytedance/seedream-v4-text-to-image': '$0.025/img',
  'bytedance/seedream': '$0.0175/img',
  'qwen/text-to-image': '~$0.01–0.02/img',
  'z-image': '$0.004/img',
  'grok-imagine/text-to-image': '$0.02/6imgs',
  'ideogram/character': '$0.06–0.12/img'
};

/* ── fal.ai verified text-to-image models (18 models, all PAID) ── */
const FAL_VERIFIED_IMAGE_MODELS = [
  // Black Forest Labs — FLUX family
  'fal-ai/flux/schnell',
  'fal-ai/flux/dev',
  'fal-ai/flux-krea-lora/stream',
  'fal-ai/flux-2-pro',
  'fal-ai/flux-2-flex',
  'fal-ai/flux-pro/kontext',
  // ByteDance — Seedream
  'fal-ai/bytedance/seedream/v4/text-to-image',
  'fal-ai/bytedance/seedream/v4.5/text-to-image',
  // Google — Nano Banana
  'fal-ai/nano-banana',
  'fal-ai/nano-banana-pro',
  // Alibaba — Qwen
  'fal-ai/qwen-image',
  // Recraft
  'fal-ai/recraft/v3/text-to-image',
  'fal-ai/recraft/v4/text-to-image',
  'fal-ai/recraft/v4/pro/text-to-image',
  // Kling
  'fal-ai/kling-image/v3/text-to-image',
  // xAI
  'xai/grok-imagine-image',
  // ImagineArt
  'imagineart/imagineart-1.5-preview/text-to-image',
  // BRIA
  'bria/fibo/generate'
];

const falModelPrices: Record<string, string> = {
  'fal-ai/flux/schnell': '$0.003/MP',
  'fal-ai/flux/dev': '$0.025/MP',
  'fal-ai/flux-krea-lora/stream': '$0.035/MP',
  'fal-ai/flux-2-pro': '$0.03/MP',
  'fal-ai/flux-2-flex': '$0.05/MP',
  'fal-ai/flux-pro/kontext': '$0.04/img',
  'fal-ai/bytedance/seedream/v4/text-to-image': '$0.03/img',
  'fal-ai/bytedance/seedream/v4.5/text-to-image': '$0.04/img',
  'fal-ai/nano-banana': '$0.039/img',
  'fal-ai/nano-banana-pro': '$0.15/img',
  'fal-ai/qwen-image': '$0.02/MP',
  'fal-ai/recraft/v3/text-to-image': '$0.04/img',
  'fal-ai/recraft/v4/text-to-image': '$0.04/img',
  'fal-ai/recraft/v4/pro/text-to-image': '$0.25/img',
  'fal-ai/kling-image/v3/text-to-image': '$0.028/img',
  'xai/grok-imagine-image': '$0.02/img',
  'imagineart/imagineart-1.5-preview/text-to-image': '$0.03/img',
  'bria/fibo/generate': 'PAID'
};

/* ── Pollo verified text-to-image models (30 models, all PAID — credit-based, 1 cr ≈ $0.06–0.08) ── */
const POLLO_VERIFIED_IMAGE_MODELS = [
  // Pollo native
  'pollo-image-v2',
  'pollo-image-v1-6',
  // FLUX family
  'flux-schnell',
  'flux-dev',
  'flux-dev-lora',
  'flux-1.1-pro',
  'flux-1.1-pro-ultra',
  'flux-2-max',
  'flux-kontext-pro',
  'flux-kontext-max',
  // Google / Vertex
  'imagen-4',
  'nano-banana',
  'nano-banana-2-google',
  // OpenAI
  'gpt-4o',
  'openai-gpt-image-1-5',
  'dall-e-3',
  // ByteDance — Seedream
  'seedream-4-5',
  'seedream-4-0',
  // Alibaba — Wan / Qwen
  'qwen-image',
  'wan-v2-2-flash',
  'wan-v2-2-plus',
  'wan2.5-t2i-preview',
  // xAI
  'grok-imagine-image',
  // Kling
  'kling-v3-image',
  'kling-v3-omni',
  'kling-image-o1',
  // Midjourney
  'midjourney-image',
  // Recraft
  'recraft-v3',
  // Ideogram
  'ideogram-v2-turbo',
  // Stability AI
  'stable-diffusion-3'
];

const polloModelPrices: Record<string, string> = {
  // Credits per image (1 credit ≈ $0.06–$0.08)
  'flux-schnell': '1 cr/img',
  'wan-v2-2-flash': '1 cr/img',
  'flux-dev': '2 cr/img',
  'flux-dev-lora': '2 cr/img',
  'wan-v2-2-plus': '2 cr/img',
  'wan2.5-t2i-preview': '2 cr/img',
  'pollo-image-v2': '3 cr/img',
  'pollo-image-v1-6': '3 cr/img',
  'seedream-4-5': '3 cr/img',
  'seedream-4-0': '3 cr/img',
  'kling-image-o1': '3 cr/img',
  'nano-banana': '4 cr/img',
  'qwen-image': '4 cr/img',
  'gpt-4o': '5 cr/img',
  'openai-gpt-image-1-5': '5 cr/img',
  'grok-imagine-image': '6 cr/img',
  'midjourney-image': '6 cr/img',
  'nano-banana-2-google': '6 cr/img',
  'imagen-4': '8 cr/img',
  'stable-diffusion-3': '10 cr/img',
  'flux-2-max': '12 cr/img',
  'flux-kontext-pro': '12 cr/img',
  'flux-1.1-pro': '12 cr/img',
  'recraft-v3': '12 cr/img',
  'dall-e-3': '12 cr/img',
  'ideogram-v2-turbo': '15 cr/img',
  'flux-1.1-pro-ultra': '16 cr/img',
  'flux-kontext-max': '24 cr/img',
  'kling-v3-image': '100 cr/img',
  'kling-v3-omni': '100 cr/img'
};

// Puter: ALL models are FREE for developers (user-pays model)
const puterModelPrices: Record<string, string> = {
  // OpenAI
  'gpt-image-1.5': 'FREE', 'gpt-image-1': 'FREE', 'gpt-image-1-mini': 'FREE',
  'dall-e-3': 'FREE', 'dall-e-2': 'FREE',
  // Gemini
  'gemini-2.5-flash-image-preview': 'FREE', 'gemini-3-pro-image-preview': 'FREE',
  // Together — FLUX
  'black-forest-labs/FLUX.2-pro': 'FREE', 'black-forest-labs/FLUX.2-max': 'FREE',
  'black-forest-labs/FLUX.2-dev': 'FREE', 'black-forest-labs/FLUX.2-flex': 'FREE',
  'black-forest-labs/FLUX.2-klein-4b': 'FREE', 'black-forest-labs/FLUX.2-klein-9b': 'FREE',
  'black-forest-labs/FLUX.1.1-pro': 'FREE', 'black-forest-labs/FLUX.1-pro': 'FREE',
  'black-forest-labs/FLUX.1-dev': 'FREE', 'black-forest-labs/FLUX.1-dev-lora': 'FREE',
  'black-forest-labs/FLUX.1-schnell': 'FREE', 'black-forest-labs/FLUX.1-schnell-Free': 'FREE',
  'black-forest-labs/FLUX.1-krea-dev': 'FREE',
  'black-forest-labs/FLUX.1-kontext-pro': 'FREE', 'black-forest-labs/FLUX.1-kontext-max': 'FREE',
  'black-forest-labs/FLUX.1-kontext-dev': 'FREE',
  // Together — Google Imagen
  'google/imagen-4.0-ultra': 'FREE', 'google/imagen-4.0-preview': 'FREE', 'google/imagen-4.0-fast': 'FREE',
  // Together — Stability AI
  'stabilityai/stable-diffusion-3-medium': 'FREE', 'stabilityai/stable-diffusion-xl-base-1.0': 'FREE',
  // Together — Others
  'ByteDance-Seed/Seedream-4.0': 'FREE', 'ByteDance-Seed/Seedream-3.0': 'FREE',
  'HiDream-ai/HiDream-I1-Full': 'FREE', 'HiDream-ai/HiDream-I1-Dev': 'FREE', 'HiDream-ai/HiDream-I1-Fast': 'FREE',
  'ideogram/ideogram-3.0': 'FREE', 'Qwen/Qwen-Image': 'FREE',
  'Lykon/DreamShaper': 'FREE', 'RunDiffusion/Juggernaut-pro-flux': 'FREE',
  // xAI
  'grok-2-image': 'FREE'
};

type PersistedImageGenSettings = {
  provider?: ImageProvider;
  model?: string;
  customModel?: string;
  puterImageProvider?: PuterImageProvider;
  puterTestMode?: boolean;
  prompt?: string;
  negativePrompt?: string;
  size?: string;
  quality?: string;
  stylePreset?: string;
  count?: number;
  seed?: string;
  outputFormat?: string;
  geminiImageSize?: string;
  geminiAspectRatio?: string;
  jpegQuality?: number;
  hfSize?: string;
};

function isImageProvider(value: unknown): value is ImageProvider {
  return imageProviders.some((provider) => provider.id === value);
}

function isPuterImageProvider(value: unknown): value is PuterImageProvider {
  return puterProviderOptions.some((provider) => provider.id === value);
}

function readPersistedImageGenSettings(): PersistedImageGenSettings {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(IMAGE_GEN_SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedImageGenSettings;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeModelIds(payload: any): string[] {
  const items = payload?.data?.data || payload?.data || payload?.models || [];
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => item?.id || item?.name)
    .filter((value) => typeof value === 'string' && value.trim().length > 0);
}

function prioritizeImageModels(models: string[]): string[] {
  if (!Array.isArray(models)) return [];
  const unique = Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));

  const scored = unique.map((model) => {
    const normalized = model.toLowerCase();
    let score = imageKeywords.reduce((sum, keyword) => (normalized.includes(keyword) ? sum + 1 : sum), 0);
    if (normalized.includes(':free')) score += 100;
    if (normalized.includes('schnell')) score += 8;
    if (normalized.includes('flux')) score += 4;
    return { model, score };
  });

  const primary = scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  const fallback = scored.filter((item) => item.score === 0).slice(0, 10);

  return [...primary, ...fallback].map((item) => item.model);
}

function mergeModels(remoteModels: string[], fallbackModels: string[]): string[] {
  const merged = Array.from(new Set([...(remoteModels || []), ...(fallbackModels || [])]));
  return merged.slice(0, 60);
}

function pickVerifiedOpenRouterImageModels(remoteModels: string[]): string[] {
  const normalized = Array.from(new Set((remoteModels || []).map((value) => value.trim()).filter(Boolean)));
  const available = new Set(normalized);
  const verified = OPENROUTER_VERIFIED_IMAGE_MODELS.filter((modelId) => available.has(modelId));
  return verified.length > 0 ? verified : [...OPENROUTER_VERIFIED_IMAGE_MODELS];
}

function pickVerifiedAimlapiImageModels(remoteModels: string[]): string[] {
  const normalized = Array.from(new Set((remoteModels || []).map((value) => value.trim()).filter(Boolean)));
  const available = new Set(normalized);
  const verified = AIMLAPI_VERIFIED_IMAGE_MODELS.filter((modelId) => available.has(modelId));
  return verified.length > 0 ? verified : [...AIMLAPI_VERIFIED_IMAGE_MODELS];
}

function pickVerifiedHfImageModels(remoteModels: string[]): string[] {
  const normalized = Array.from(new Set((remoteModels || []).map((value) => value.trim()).filter(Boolean)));
  const available = new Set(normalized);
  const verified = HF_VERIFIED_IMAGE_MODELS.filter((modelId) => available.has(modelId));
  return verified.length > 0 ? verified : [...HF_VERIFIED_IMAGE_MODELS];
}

function pickVerifiedPollinationsImageModels(remoteModels: string[]): string[] {
  const normalized = Array.from(new Set((remoteModels || []).map((value) => value.trim()).filter(Boolean)));
  // Filter out video models (veo, seedance, wan, grok-video, ltx)
  const videoKeywords = ['veo', 'seedance', 'wan', 'grok-video', 'ltx'];
  const imageOnly = normalized.filter((m) => !videoKeywords.some((vk) => m.toLowerCase().includes(vk)));
  const available = new Set(imageOnly);
  const verified = POLLINATIONS_VERIFIED_IMAGE_MODELS.filter((modelId) => available.has(modelId));
  return verified.length > 0 ? verified : [...POLLINATIONS_VERIFIED_IMAGE_MODELS];
}

function pickVerifiedReplicateImageModels(remoteModels: string[]): string[] {
  const normalized = Array.from(new Set((remoteModels || []).map((value) => value.trim()).filter(Boolean)));
  const available = new Set(normalized);
  const verified = REPLICATE_VERIFIED_IMAGE_MODELS.filter((modelId) => available.has(modelId));
  return verified.length > 0 ? verified : [...REPLICATE_VERIFIED_IMAGE_MODELS];
}

function pickVerifiedRenderfulImageModels(remoteModels: string[]): string[] {
  const normalized = Array.from(new Set((remoteModels || []).map((value) => value.trim()).filter(Boolean)));
  const available = new Set(normalized);
  const verified = RENDERFUL_VERIFIED_IMAGE_MODELS.filter((modelId) => available.has(modelId));
  return verified.length > 0 ? verified : [...RENDERFUL_VERIFIED_IMAGE_MODELS];
}

function pickVerifiedKieImageModels(remoteModels: string[]): string[] {
  const normalized = Array.from(new Set((remoteModels || []).map((value) => value.trim()).filter(Boolean)));
  const available = new Set(normalized);
  const verified = KIE_VERIFIED_IMAGE_MODELS.filter((modelId) => available.has(modelId));
  return verified.length > 0 ? verified : [...KIE_VERIFIED_IMAGE_MODELS];
}

function pickVerifiedFalImageModels(remoteModels: string[]): string[] {
  const normalized = Array.from(new Set((remoteModels || []).map((value) => value.trim()).filter(Boolean)));
  const available = new Set(normalized);
  const verified = FAL_VERIFIED_IMAGE_MODELS.filter((modelId) => available.has(modelId));
  return verified.length > 0 ? verified : [...FAL_VERIFIED_IMAGE_MODELS];
}

function pickVerifiedPolloImageModels(remoteModels: string[]): string[] {
  const normalized = Array.from(new Set((remoteModels || []).map((value) => value.trim()).filter(Boolean)));
  const available = new Set(normalized);
  const verified = POLLO_VERIFIED_IMAGE_MODELS.filter((modelId) => available.has(modelId));
  return verified.length > 0 ? verified : [...POLLO_VERIFIED_IMAGE_MODELS];
}

function sizeToAspectRatio(size: string): string {
  const [w, h] = size.split('x').map((value) => Number.parseInt(value, 10));
  if (!w || !h) return '1 / 1';
  return `${w} / ${h}`;
}

function sizeToRatio(size: string): { w: number; h: number } {
  const [w, h] = size.split('x').map((value) => Number.parseInt(value, 10));
  if (!w || !h) return { w: 1, h: 1 };
  return { w, h };
}

function inferMediaTypeFromUrl(url: string): GeneratedMediaType {
  const normalized = String(url || '').toLowerCase();
  if (
    normalized.includes('.mp4') ||
    normalized.includes('.webm') ||
    normalized.includes('.mov') ||
    normalized.startsWith('data:video/')
  ) {
    return 'video';
  }
  return 'image';
}

function formatDeleteCountdown(remainingMs: number): string {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'กำลังลบ...';
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export default function ImageGenPage() {
  const persisted = readPersistedImageGenSettings();
  const initialProvider = isImageProvider(persisted.provider) ? persisted.provider : 'openrouter';
  const initialPuterProvider = isPuterImageProvider(persisted.puterImageProvider) ? persisted.puterImageProvider : 'openai-image-generation';

  const [provider, setProvider] = useState<ImageProvider>(initialProvider);
  const providerRef = useRef<ImageProvider>(initialProvider);
  const [providerReady, setProviderReady] = useState<Record<ImageProvider, boolean>>({
    gemini: false,
    openrouter: false,
    aimlapi: false,
    huggingface: false,
    pollinations: false,
    replicate: false,
    bfl: false,
    renderful: false,
    kie: false,
    fal: false,
    pollo: false,
    puter: false
  });
  const [providerLoading, setProviderLoading] = useState(true);

  const [models, setModels] = useState<Record<ImageProvider, string[]>>({
    gemini: fallbackImageModels.gemini,
    openrouter: fallbackImageModels.openrouter,
    aimlapi: fallbackImageModels.aimlapi,
    huggingface: fallbackImageModels.huggingface,
    pollinations: fallbackImageModels.pollinations,
    replicate: fallbackImageModels.replicate,
    bfl: fallbackImageModels.bfl,
    renderful: fallbackImageModels.renderful,
    kie: fallbackImageModels.kie,
    fal: fallbackImageModels.fal,
    pollo: fallbackImageModels.pollo,
    puter: fallbackImageModels.puter
  });
  const [model, setModel] = useState(typeof persisted.model === 'string' ? persisted.model : '');
  const [customModel, setCustomModel] = useState(typeof persisted.customModel === 'string' ? persisted.customModel : '');
  const [modelLoading, setModelLoading] = useState<Record<ImageProvider, boolean>>({
    gemini: false,
    openrouter: false,
    aimlapi: false,
    huggingface: false,
    pollinations: false,
    replicate: false,
    bfl: false,
    renderful: false,
    kie: false,
    fal: false,
    pollo: false,
    puter: false
  });

  const [puterImageProvider, setPuterImageProvider] = useState<PuterImageProvider>(initialPuterProvider);
  const [puterTestMode, setPuterTestMode] = useState(!!persisted.puterTestMode);
  const [puterUseTempUser, setPuterUseTempUser] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(PUTER_TEMP_USER_STORAGE_KEY) === '1';
  });
  const [puterSignedIn, setPuterSignedIn] = useState(false);
  const [puterUserName, setPuterUserName] = useState<string | null>(null);

  const [prompt, setPrompt] = useState(typeof persisted.prompt === 'string' ? persisted.prompt : '');
  const [negativePrompt, setNegativePrompt] = useState(typeof persisted.negativePrompt === 'string' ? persisted.negativePrompt : '');
  const [size, setSize] = useState(
    typeof persisted.size === 'string' && sizeOptions.some((item) => item.id === persisted.size)
      ? persisted.size
      : '1024x1024'
  );
  const [quality, setQuality] = useState(
    persisted.quality === 'medium' || persisted.quality === 'high' || persisted.quality === 'auto'
      ? persisted.quality
      : 'auto'
  );
  const [stylePreset, setStylePreset] = useState(
    typeof persisted.stylePreset === 'string' && stylePresets.some((preset) => preset.id === persisted.stylePreset)
      ? persisted.stylePreset
      : 'none'
  );
  const [count, setCount] = useState(
    Number.isInteger(persisted.count) ? Math.max(1, Math.min(Number(persisted.count), 4)) : 1
  );
  const [seed, setSeed] = useState(typeof persisted.seed === 'string' ? persisted.seed : '');
  const [outputFormat, setOutputFormat] = useState(
    persisted.outputFormat === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  );
  const [geminiImageSize, setGeminiImageSize] = useState(
    persisted.geminiImageSize === '2K' ? '2K' : '1K'
  );
  const [geminiAspectRatio, setGeminiAspectRatio] = useState(
    typeof persisted.geminiAspectRatio === 'string' && geminiAspectRatios.some((r) => r.id === persisted.geminiAspectRatio)
      ? persisted.geminiAspectRatio
      : '1:1'
  );
  const [jpegQuality, setJpegQuality] = useState(
    Number.isInteger(persisted.jpegQuality) ? Math.max(0, Math.min(Number(persisted.jpegQuality), 100)) : 80
  );
  const [hfSize, setHfSize] = useState(
    typeof persisted.hfSize === 'string' && hfSizeOptions.some((s) => s.id === persisted.hfSize)
      ? persisted.hfSize
      : '1024x1024'
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [images, setImages] = useState<GeneratedImageCard[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [settingsSyncTick, setSettingsSyncTick] = useState(0);
  const [historySyncTick, setHistorySyncTick] = useState(0);

  const mergeImages = (nextImages: GeneratedImageCard[], mode: 'append' | 'replace' = 'append') => {
    setImages((prev) => {
      const source = mode === 'replace' ? [] : prev;
      const map = new Map<string, GeneratedImageCard>();
      for (const item of source) map.set(item.id, item);
      for (const item of nextImages) map.set(item.id, item);
      return Array.from(map.values())
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 80);
    });
  };

  const normalizeHistoryItems = (
    items: Array<any>,
    fallback: { provider: string; model: string; prompt: string; size: string; mediaType?: GeneratedMediaType }
  ): GeneratedImageCard[] => {
    if (!Array.isArray(items)) return [];
    return items
      .map((item, index) => ({
        id: String(item?.id || `${Date.now()}_${index}`),
        url: String(item?.url || item?.image_url || '').trim(),
        mediaType: (item?.mediaType || item?.media_type || fallback.mediaType || inferMediaTypeFromUrl(item?.url || '')) as GeneratedMediaType,
        provider: String(item?.provider || fallback.provider || '-'),
        model: String(item?.model || fallback.model || '-'),
        prompt: String(item?.prompt || fallback.prompt || ''),
        size: String(item?.size || fallback.size || '1024x1024'),
        createdAt: String(item?.createdAt || item?.created_at || new Date().toISOString()),
        expiresAt: item?.expiresAt || item?.expires_at || undefined
      }))
      .filter((item) => item.url.length > 0);
  };

  const refreshPuterAuth = async (silent = true) => {
    try {
      const signedIn = !!puter.auth.isSignedIn();
      setPuterSignedIn(signedIn);
      setProviderReady((prev) => ({ ...prev, puter: signedIn }));

      if (signedIn) {
        const cachedUsername = typeof window !== 'undefined'
          ? window.localStorage.getItem(PUTER_USERNAME_STORAGE_KEY)
          : null;
        setPuterUserName(cachedUsername || null);
      } else {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(PUTER_USERNAME_STORAGE_KEY);
        }
        setPuterUserName(null);
      }
    } catch {
      setPuterSignedIn(false);
      setPuterUserName(null);
      setProviderReady((prev) => ({ ...prev, puter: false }));
      if (!silent) toast.error('ไม่สามารถเชื่อมต่อ Puter auth ได้');
    }
  };

  const handlePuterSignIn = async (): Promise<boolean> => {
    try {
      const result = await puter.auth.signIn({ attempt_temp_user_creation: puterUseTempUser });
      if (typeof window !== 'undefined' && typeof result?.username === 'string' && result.username.trim()) {
        window.localStorage.setItem(PUTER_USERNAME_STORAGE_KEY, result.username.trim());
      }
      await refreshPuterAuth(false);
      toast.success(puterUseTempUser ? 'Puter guest sign-in สำเร็จ' : 'Puter sign-in สำเร็จ');
      return true;
    } catch (error: any) {
      const message = error?.error === 'auth_window_closed'
        ? 'ปิดหน้าต่าง sign in ก่อนเสร็จ'
        : (error?.message || 'Puter sign-in ไม่สำเร็จ');
      toast.error(message);
      return false;
    }
  };

  const handlePuterSignOut = async () => {
    try {
      puter.auth.signOut();
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(PUTER_USERNAME_STORAGE_KEY);
      }
      await refreshPuterAuth(true);
      toast.success('Puter sign-out แล้ว');
    } catch {
      toast.error('Puter sign-out ไม่สำเร็จ');
    }
  };

  useEffect(() => {
    void refreshPuterAuth(true);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeDataSync((detail) => {
      if (detail.topics.includes('settings') || detail.topics.includes('all')) {
        setSettingsSyncTick((prev) => prev + 1);
      }
      if (detail.topics.includes('image_history') || detail.topics.includes('all')) {
        setHistorySyncTick((prev) => prev + 1);
      }
    }, { topics: ['settings', 'image_history'] });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PUTER_TEMP_USER_STORAGE_KEY, puterUseTempUser ? '1' : '0');
  }, [puterUseTempUser]);


  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setImages((prev) => prev.filter((item) => {
      if (!item.expiresAt) return true;
      return Date.parse(item.expiresAt) > nowMs;
    }));
  }, [nowMs]);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await get<ApiResponse<any>>('/api/settings/image-gen/history?limit=80');
        if (!response.success) return;
        const items = normalizeHistoryItems(response.data?.items || [], {
          provider: providerRef.current,
          model: '',
          prompt: '',
          size: '1024x1024',
          mediaType: 'image'
        });
        mergeImages(items, 'replace');
      } catch {
        // ignore history loading errors
      }
    };

    void loadHistory();
    const poll = window.setInterval(() => {
      void loadHistory();
    }, 60000);
    return () => window.clearInterval(poll);
  }, [historySyncTick]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload: PersistedImageGenSettings = {
      provider,
      model,
      customModel,
      puterImageProvider,
      puterTestMode,
      prompt,
      negativePrompt,
      size,
      quality,
      stylePreset,
      count,
      seed,
      outputFormat,
      geminiImageSize,
      geminiAspectRatio,
      jpegQuality,
      hfSize
    };
    try {
      window.localStorage.setItem(IMAGE_GEN_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage write errors
    }
  }, [
    provider,
    model,
    customModel,
    puterImageProvider,
    puterTestMode,
    prompt,
    negativePrompt,
    size,
    quality,
    stylePreset,
    count,
    seed,
    outputFormat,
    geminiImageSize,
    geminiAspectRatio,
    jpegQuality,
    hfSize
  ]);

  useEffect(() => {
    const loadProvidersAndModels = async () => {
      setProviderLoading(true);

      try {
        const providerRes = await get<ApiResponse<ProviderStatusResponse>>('/api/settings/ai-test/providers');
        if (providerRes.success && providerRes.data) {
          const nextProviderReady: Record<ImageProvider, boolean> = {
            gemini: !!providerRes.data.gemini?.hasKey,
            openrouter: !!providerRes.data.openrouter?.hasKey,
            aimlapi: !!providerRes.data.aimlapi?.hasKey,
            huggingface: !!providerRes.data.huggingface?.hasKey,
            pollinations: !!providerRes.data.pollinations?.hasKey,
            replicate: !!providerRes.data.replicate?.hasKey,
            bfl: !!providerRes.data.bfl?.hasKey,
            renderful: !!providerRes.data.renderful?.hasKey,
            kie: !!providerRes.data.kie?.hasKey,
            fal: !!providerRes.data.fal?.hasKey,
            pollo: !!providerRes.data.pollo?.hasKey,
            puter: puterSignedIn
          };
          setProviderReady(nextProviderReady);
        }
      } catch {
        toast.error('โหลดสถานะ provider ไม่สำเร็จ');
      } finally {
        setProviderLoading(false);
      }

      const targets: BackendImageProvider[] = ['openrouter', 'aimlapi', 'huggingface', 'pollinations', 'replicate', 'bfl', 'renderful', 'kie', 'fal', 'pollo'];
      await Promise.all(targets.map(async (target) => {
        try {
          setModelLoading((prev) => ({ ...prev, [target]: true }));
          const response = await get<ApiResponse<any>>(`/api/settings/ai-test/${target}/models`);
          if (!response.success) return;
          const normalizedIds = normalizeModelIds(response.data);
          const ids = target === 'openrouter'
            ? pickVerifiedOpenRouterImageModels(normalizedIds)
            : target === 'aimlapi'
            ? pickVerifiedAimlapiImageModels(normalizedIds)
            : target === 'huggingface'
            ? pickVerifiedHfImageModels(normalizedIds)
            : target === 'pollinations'
            ? pickVerifiedPollinationsImageModels(normalizedIds)
            : target === 'replicate'
            ? pickVerifiedReplicateImageModels(normalizedIds)
            : target === 'renderful'
            ? pickVerifiedRenderfulImageModels(normalizedIds)
            : target === 'kie'
            ? pickVerifiedKieImageModels(normalizedIds)
            : target === 'fal'
            ? pickVerifiedFalImageModels(normalizedIds)
            : target === 'pollo'
            ? pickVerifiedPolloImageModels(normalizedIds)
            : prioritizeImageModels(normalizedIds);
          const useVerifiedOnly = target === 'openrouter' || target === 'aimlapi' || target === 'huggingface' || target === 'pollinations' || target === 'replicate' || target === 'renderful' || target === 'kie' || target === 'fal' || target === 'pollo';
          setModels((prev) => ({
            ...prev,
            [target]: useVerifiedOnly
              ? ids
              : mergeModels(ids, fallbackImageModels[target])
          }));
        } catch {
          // silently fall back to custom model input
        } finally {
          setModelLoading((prev) => ({ ...prev, [target]: false }));
        }
      }));
    };

    void loadProvidersAndModels();
  }, [puterSignedIn, settingsSyncTick]);

  useEffect(() => {
    if (provider !== 'puter') return;
    setModels((prev) => ({
      ...prev,
      puter: puterModelsByProvider[puterImageProvider]
    }));
  }, [provider, puterImageProvider]);

  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  useEffect(() => {
    if (provider !== 'pollo') return;
    if (count !== 1) setCount(1);
  }, [provider, count]);

  const currentModelOptions = useMemo(() => {
    if (provider === 'puter') return puterModelsByProvider[puterImageProvider];
    return models[provider];
  }, [provider, models, puterImageProvider]);

  useEffect(() => {
    if (currentModelOptions.length === 0) return;
    setModel((prev) => (currentModelOptions.includes(prev) ? prev : currentModelOptions[0]));
  }, [currentModelOptions]);

  const selectedStyle = useMemo(
    () => stylePresets.find((preset) => preset.id === stylePreset) || stylePresets[0],
    [stylePreset]
  );

  const effectivePrompt = useMemo(() => {
    const base = prompt.trim();
    if (!base) return '';
    if (!selectedStyle.suffix) return base;
    return `${base}, ${selectedStyle.suffix}`;
  }, [prompt, selectedStyle]);

  const activeModel = useMemo(() => {
    if (provider === 'openrouter') {
      return model.trim();
    }
    const manual = customModel.trim();
    if (manual) return manual;
    return model.trim();
  }, [customModel, model, provider]);

  const waitPolloTaskResult = async (taskId: string): Promise<PolloGeneration> => {
    const deadline = Date.now() + 3 * 60 * 1000;

    while (Date.now() < deadline) {
      const statusResponse = await get<ApiResponse<PolloTaskStatusResponse>>(`/api/settings/pollo/tasks/${encodeURIComponent(taskId)}`);
      if (!statusResponse.success) {
        throw new Error(statusResponse.error || 'ไม่สามารถอ่านสถานะงานจาก Pollo ได้');
      }

      const generation = Array.isArray(statusResponse.data?.generations) ? statusResponse.data.generations[0] : null;
      const status = String(generation?.status || '').toLowerCase();
      if (status === 'succeed') {
        return generation || {};
      }
      if (status === 'failed') {
        throw new Error(generation?.failMsg || 'Pollo generation failed');
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error('Pollo ยังประมวลผลไม่เสร็จ กรุณาลองใหม่อีกครั้ง');
  };

  const handleGenerate = async () => {
    const effectiveProvider = providerRef.current;

    if (!prompt.trim()) {
      toast.error('กรุณาใส่ Prompt');
      return;
    }

    if (effectiveProvider !== 'puter' && !providerReady[effectiveProvider]) {
      toast.error(`ยังไม่ได้ตั้งค่า API key สำหรับ ${effectiveProvider}`);
      return;
    }

    if (!activeModel) {
      toast.error('กรุณาเลือกหรือระบุ model');
      return;
    }

    setIsGenerating(true);
    setLatencyMs(null);

    try {
      if (effectiveProvider === 'puter') {
        let signedIn = puterSignedIn;
        if (!signedIn) {
          signedIn = await handlePuterSignIn();
        }

        if (!signedIn) {
          throw new Error('ต้อง Sign In Puter ก่อนใช้งาน');
        }

        const startedAt = Date.now();
        const ratio = sizeToRatio(size);
        const puterOptions: any = {
          prompt: effectivePrompt,
          provider: puterImageProvider,
          model: activeModel,
          ratio,
          test_mode: puterTestMode
        };

        if (negativePrompt.trim()) puterOptions.negative_prompt = negativePrompt.trim();
        if (quality !== 'auto') puterOptions.quality = quality;
        if (seed.trim()) puterOptions.seed = Number.parseInt(seed, 10);

        const generatedAt = new Date().toISOString();
        const nextImages: GeneratedImageCard[] = [];
        for (let index = 0; index < count; index += 1) {
          const imageElement = await puter.ai.txt2img(puterOptions);
          const imageUrl = imageElement?.src || '';
          if (!imageUrl) continue;
          nextImages.push({
            id: `${Date.now()}_${index}_puter`,
            url: imageUrl,
            mediaType: 'image',
            provider: `puter:${puterImageProvider}`,
            model: activeModel,
            prompt: effectivePrompt,
            size,
            createdAt: generatedAt
          });
        }

        if (nextImages.length === 0) {
          throw new Error('Puter ตอบกลับสำเร็จแต่ไม่พบภาพ');
        }

        let persistedCards: GeneratedImageCard[] = [];
        try {
          const persistResponse = await post<ApiResponse<any>>('/api/settings/image-gen/history/persist', {
            provider: `puter:${puterImageProvider}`,
            model: activeModel,
            prompt: effectivePrompt,
            size,
            latencyMs: Date.now() - startedAt,
            items: nextImages.map((item) => ({ url: item.url, mediaType: item.mediaType }))
          });
          if (persistResponse.success) {
            persistedCards = normalizeHistoryItems(persistResponse.data?.items || [], {
              provider: `puter:${puterImageProvider}`,
              model: activeModel,
              prompt: effectivePrompt,
              size,
              mediaType: 'image'
            });
          }
        } catch {
          // fallback to local card only
        }

        mergeImages(persistedCards.length > 0 ? persistedCards : nextImages);
        setLatencyMs(Date.now() - startedAt);
        toast.success(`สร้างภาพสำเร็จ ${(persistedCards.length > 0 ? persistedCards : nextImages).length} ภาพ`);
        return;
      }

      if (effectiveProvider === 'pollo') {
        const startedAt = Date.now();
        const polloResponse = await post<ApiResponse<PolloGenerateResponseData>>('/api/settings/pollo/generate', {
          modelPath: activeModel,
          prompt: effectivePrompt,
          size,
          waitForResult: true,
          seed: seed.trim() ? Number.parseInt(seed, 10) : undefined
        });

        if (!polloResponse.success || !polloResponse.data) {
          throw new Error(polloResponse.error || 'Pollo generation failed');
        }

        let generation = polloResponse.data.generation || null;
        const status = String(polloResponse.data.status || generation?.status || '').toLowerCase();
        const taskId = polloResponse.data.taskId;

        if (!generation && status === 'processing' && taskId) {
          generation = await waitPolloTaskResult(taskId);
        }

        const mediaUrl = String(generation?.url || '').trim();
        if (!mediaUrl) {
          throw new Error('Pollo ตอบกลับสำเร็จแต่ยังไม่พบ media URL');
        }

        const mediaTypeRaw = String(generation?.mediaType || '').toLowerCase();
        const mediaType: GeneratedMediaType = mediaTypeRaw === 'video'
          ? 'video'
          : inferMediaTypeFromUrl(mediaUrl);

        const persistedCards = normalizeHistoryItems(polloResponse.data.images || [], {
          provider: 'pollo',
          model: activeModel,
          prompt: effectivePrompt,
          size,
          mediaType
        });

        if (persistedCards.length > 0) {
          mergeImages(persistedCards);
        } else {
          const generatedAt = new Date().toISOString();
          const card: GeneratedImageCard = {
            id: taskId || `${Date.now()}_pollo`,
            url: mediaUrl,
            mediaType,
            provider: 'pollo',
            model: activeModel,
            prompt: effectivePrompt,
            size,
            createdAt: generatedAt
          };
          mergeImages([card]);
        }

        setLatencyMs(typeof polloResponse.data.latencyMs === 'number' ? polloResponse.data.latencyMs : (Date.now() - startedAt));
        toast.success(`สร้าง${mediaType === 'video' ? 'วิดีโอ' : 'ภาพ'}สำเร็จ`);
        return;
      }

      const generatePayload: Record<string, unknown> = {
        provider: effectiveProvider,
        model: activeModel,
        prompt: effectivePrompt,
        negative_prompt: negativePrompt.trim() || undefined,
        size,
        n: count,
        quality,
        seed: seed.trim() ? Number.parseInt(seed, 10) : undefined
      };

      if (effectiveProvider === 'gemini') {
        generatePayload.gemini_aspect_ratio = geminiAspectRatio;
        generatePayload.gemini_image_size = geminiImageSize;
        generatePayload.output_mime_type = outputFormat;
        if (outputFormat === 'image/jpeg') {
          generatePayload.jpeg_quality = jpegQuality;
        }
      }

      if (effectiveProvider === 'huggingface') {
        generatePayload.size = hfSize;
        generatePayload.output_mime_type = outputFormat;
      }

      const response = await post<ApiResponse<GenerateResponseData>>('/api/settings/image-gen/generate', generatePayload);

      const data = response.data;
      if (!response.success || !data?.images?.length) {
        throw new Error(response.error || 'Provider ไม่คืนข้อมูลภาพ');
      }

      const nextImages = normalizeHistoryItems(data.images, {
        provider: data.provider,
        model: data.model,
        prompt: data.prompt,
        size: data.size,
        mediaType: 'image'
      });

      mergeImages(nextImages);
      setLatencyMs(typeof data.latencyMs === 'number' ? data.latencyMs : null);
      toast.success(`สร้างภาพสำเร็จ ${nextImages.length} ภาพ`);
    } catch (error: any) {
      const status = error?.response?.status;
      let message = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'สร้างภาพไม่สำเร็จ';
      if (typeof error === 'string' && error.trim()) {
        message = error;
      }

      if (effectiveProvider === 'puter') {
        const normalized = String(message).toLowerCase();
        const isAuthError = normalized.includes('401') || normalized.includes('unauthorized') || normalized.includes('auth');
        if (isAuthError) {
          puter.auth.signOut();
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(PUTER_USERNAME_STORAGE_KEY);
          }
          await refreshPuterAuth(true);
          toast.error('Puter session หมดอายุ กรุณา Sign In ใหม่');
          return;
        }
      }
      toast.error(status ? `${message} (HTTP ${status})` : message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (target: GeneratedImageCard) => {
    const defaultExt = target.mediaType === 'video' ? 'mp4' : 'png';
    const filename = `image-gen_${target.id}.${defaultExt}`;

    try {
      if (target.url.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = target.url;
        a.download = filename;
        a.click();
        return;
      }

      const imageResponse = await fetch(target.url);
      const blob = await imageResponse.blob();
      const blobUrl = URL.createObjectURL(blob);
      const contentExt = blob.type.includes('video/')
        ? 'mp4'
        : blob.type.includes('image/jpeg')
          ? 'jpg'
          : blob.type.includes('image/webp')
            ? 'webp'
            : defaultExt;
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `image-gen_${target.id}.${contentExt}`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error('ดาวน์โหลดไฟล์ไม่สำเร็จ');
    }
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteImage = async (itemId: string) => {
    setIsDeleting(true);
    try {
      await del<ApiResponse<any>>(`/api/settings/image-gen/history/${itemId}`);
      setImages((prev) => prev.filter((img) => img.id !== itemId));
      toast.success('ลบภาพแล้ว');
    } catch {
      toast.error('ลบภาพไม่สำเร็จ');
    } finally {
      setIsDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  const copyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('คัดลอก prompt แล้ว');
    } catch {
      toast.error('คัดลอกไม่สำเร็จ');
    }
  };

  return (
    <div className="space-y-0">
      <PageHeader
        title=""
        className="mb-0"
      />

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-4">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Provider + Model</h3>
            <p className="mt-1 text-xs text-gray-500">เลือก endpoint และโมเดลที่ต้องการสำหรับการสร้างภาพ</p>

            <div className="mt-4 space-y-2">
              {imageProviders.map((item) => {
                const active = provider === item.id;
                const ready = item.id === 'puter' ? puterSignedIn : providerReady[item.id];
                const statusText = item.id === 'puter'
                  ? (ready ? 'Signed In' : 'Sign In Required')
                  : (providerLoading ? '...' : ready ? 'Connected' : 'No key');
                return (
                  <div key={item.id} className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        providerRef.current = item.id;
                        setProvider(item.id);
                      }}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${active
                        ? 'border-teal-300 bg-teal-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-500'}`}>
                          <i className={`bi ${item.icon}`}></i>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ready ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {statusText}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-gray-500">{item.description}</p>
                        </div>
                      </div>
                    </button>

                    {active && (
                      <div className="rounded-xl border border-gray-200 bg-white p-3">
                        {item.id === 'puter' && (
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-700">Puter API Provider</label>
                            <select
                              value={puterImageProvider}
                              onChange={(event) => setPuterImageProvider(event.target.value as PuterImageProvider)}
                              className="input-modern text-sm"
                            >
                              {puterProviderOptions.map((providerOption) => (
                                <option key={providerOption.id} value={providerOption.id}>
                                  {providerOption.label} - {providerOption.description}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className={`${item.id === 'puter' ? 'mt-3' : ''} space-y-2`}>
                          <label className="text-xs font-medium text-gray-700">Model</label>
                          <select
                            value={model}
                            onChange={(event) => setModel(event.target.value)}
                            className="input-modern text-sm"
                            disabled={item.id !== 'puter' && modelLoading[item.id]}
                          >
                            <option value="">Select model...</option>
                            {currentModelOptions.map((modelOption) => {
                              const bflPrice = provider === 'bfl' ? bflModelPrices[modelOption] : null;
                              const orPrice = provider === 'openrouter' ? openrouterModelPrices[modelOption] : null;
                              const aimlPrice = provider === 'aimlapi' ? aimlapiModelPrices[modelOption] : null;
                              const hfPrice = provider === 'huggingface' ? hfModelPrices[modelOption] : null;
                              const pollPrice = provider === 'pollinations' ? pollinationsModelPrices[modelOption] : null;
                              const replPrice = provider === 'replicate' ? replicateModelPrices[modelOption] : null;
                              const rendPrice = provider === 'renderful' ? renderfulModelPrices[modelOption] : null;
                              const kiePrice = provider === 'kie' ? kieModelPrices[modelOption] : null;
                              const falPrice = provider === 'fal' ? falModelPrices[modelOption] : null;
                              const polloPrice = provider === 'pollo' ? polloModelPrices[modelOption] : null;
                              const puterPrice = provider === 'puter' ? puterModelPrices[modelOption] : null;
                              const priceTag = bflPrice || orPrice || aimlPrice || hfPrice || pollPrice || replPrice || rendPrice || kiePrice || falPrice || polloPrice || puterPrice;
                              const label = priceTag
                                ? `${modelOption}  [${priceTag}]`
                                : modelOption;
                              return (
                              <option key={modelOption} value={modelOption}>
                                {label}
                              </option>
                              );
                            })}
                          </select>
                          <input
                            value={customModel}
                            onChange={(event) => setCustomModel(event.target.value)}
                            className="input-modern text-sm"
                            placeholder={item.id === 'openrouter'
                              ? 'OpenRouter ใช้เฉพาะรุ่นที่รองรับ image generation'
                              : (item.id === 'aimlapi' || item.id === 'huggingface' || item.id === 'pollinations' || item.id === 'replicate' || item.id === 'renderful' || item.id === 'kie' || item.id === 'fal' || item.id === 'pollo' || item.id === 'puter')
                              ? 'ใช้เฉพาะรุ่นที่รองรับ image generation'
                              : 'หรือพิมพ์ model id เอง (optional)'}
                            disabled={item.id === 'openrouter' || item.id === 'aimlapi' || item.id === 'huggingface' || item.id === 'pollinations' || item.id === 'replicate' || item.id === 'renderful' || item.id === 'kie' || item.id === 'fal' || item.id === 'pollo' || item.id === 'puter'}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {provider === 'puter' && (
              <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-sky-800">Puter Auth</p>
                    <p className="text-[11px] text-sky-700">
                      {puterSignedIn ? `Signed in as ${puterUserName || 'user'}` : 'ต้อง sign in ก่อน generate'}
                    </p>
                  </div>
                  {puterSignedIn ? (
                    <button
                      type="button"
                      onClick={handlePuterSignOut}
                      className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-700"
                    >
                      Sign Out
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handlePuterSignIn()}
                      className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Sign In
                    </button>
                  )}
                </div>
                <a
                  href="https://docs.puter.com/getting-started/"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-700 hover:underline"
                >
                  <i className="bi bi-box-arrow-up-right"></i>
                  Puter docs: Getting Started
                </a>
                <label className="mt-2 flex items-start gap-2 text-[11px] text-sky-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={puterUseTempUser}
                    onChange={(event) => setPuterUseTempUser(event.target.checked)}
                  />
                  <span>
                    ใช้ Temporary account (guest) - เร็วแต่ session อาจหมดเร็วกว่า
                  </span>
                </label>
              </div>
            )}

            {provider === 'pollo' && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
                Pollo เป็น task-based generation และผลลัพธ์อาจเป็นวิดีโอ ต้องมีเครดิตในบัญชี Pollo ก่อนใช้งาน
              </div>
            )}

          </section>

        </div>

        <div className="space-y-5 xl:col-span-8">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {imageProviders.find((item) => item.id === provider)?.label || provider.toUpperCase()}
                </h3>
                <p className="text-xs text-gray-500">{activeModel || '-'}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="hidden sm:flex items-center gap-2">
                  <span className="badge bg-slate-100 text-slate-700 border border-slate-200">
                    Generated: {images.length}
                  </span>
                  <span className="badge bg-teal-50 text-teal-700 border border-teal-100">
                    <i className="bi bi-image mr-1"></i>
                    Text to Image
                  </span>
                  {latencyMs != null && (
                    <span className="badge bg-slate-100 text-slate-600 border border-slate-200">{latencyMs} ms</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  Prompt in queue: <span className="font-medium text-gray-700">{effectivePrompt || '-'}</span>
                </div>
              </div>
            </div>

            {images.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gradient-to-br from-slate-50 to-white px-6 py-14 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
                  <i className="bi bi-image text-2xl"></i>
                </div>
                <p className="text-sm font-semibold text-gray-800">พร้อมสร้างภาพแล้ว</p>
                <p className="mt-1 text-xs text-gray-500">
                  ตั้ง Prompt ด้านล่าง แล้วกด Generate เพื่อเริ่มสร้าง
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {images.map((item) => {
                  const expiresAtMs = item.expiresAt ? Date.parse(item.expiresAt) : Number.NaN;
                  const remainingMs = Number.isFinite(expiresAtMs) ? (expiresAtMs - nowMs) : Number.NaN;
                  const hasExpiry = Number.isFinite(remainingMs);

                  return (
                  <article key={item.id} className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    {/* Delete X button */}
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(item.id)}
                      className="absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                      title="ลบภาพ"
                    >
                      <i className="bi bi-x-lg text-[10px]"></i>
                    </button>

                    {/* Delete confirmation panel */}
                    {deleteConfirmId === item.id && (
                      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 rounded-t-2xl border-b border-red-200 bg-red-50 px-3 py-2.5">
                        <p className="text-xs font-medium text-red-700">ลบภาพนี้ถาวร?</p>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
                          >
                            ยกเลิก
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteImage(item.id)}
                            disabled={isDeleting}
                            className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {isDeleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="relative overflow-hidden bg-gray-100" style={{ aspectRatio: sizeToAspectRatio(item.size) }}>
                      {item.mediaType === 'video' ? (
                        <video
                          src={item.url}
                          className="h-full w-full object-cover"
                          controls
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={item.url}
                          alt={item.prompt}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      )}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => copyPrompt(item.prompt)}
                          className="rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-medium text-gray-700"
                        >
                          Copy Prompt
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(item)}
                          className="rounded-lg bg-teal-500 px-2.5 py-1 text-[11px] font-medium text-white"
                        >
                          Download
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 p-3">
                      <p className="line-clamp-2 text-xs text-gray-700">{item.prompt}</p>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{item.provider}</span>
                        <span
                          className="max-w-[180px] truncate rounded-full bg-gray-100 px-2 py-0.5 text-gray-700"
                          title={item.model}
                        >
                          {item.model || '-'}
                        </span>
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700">{item.mediaType}</span>
                        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-700">{item.size}</span>
                        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-orange-700">
                          {new Date(item.createdAt).toLocaleTimeString('th-TH')}
                        </span>
                        {hasExpiry && (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">
                            ลบใน {formatDeleteCountdown(remainingMs)}
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
                })}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                  <i className="bi bi-stars"></i>
                  Prompt Studio
                </div>
                <span className="text-[11px] text-gray-400">{prompt.length.toLocaleString()} chars</span>
              </div>

              <div className="relative mt-3">
                <i className="bi bi-magic absolute left-4 top-4 text-gray-400"></i>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault();
                      void handleGenerate();
                    }
                  }}
                  className="min-h-[140px] w-full resize-y rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 py-3 pl-11 pr-4 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                  placeholder="What do you want to create? อธิบายภาพที่ต้องการได้เต็มที่..."
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {stylePresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setStylePreset(preset.id)}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${stylePreset === preset.id
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                        : `${preset.chipClass} hover:-translate-y-0.5 hover:shadow-sm`
                        }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt('');
                      setNegativePrompt('');
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    <i className="bi bi-eraser"></i>
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-teal-600 to-cyan-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-teal-200 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isGenerating ? (
                      <>
                        <i className="bi bi-arrow-repeat animate-spin"></i>
                        Generating...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-arrow-up-circle"></i>
                        Generate
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-700">Negative prompt</label>
                  <input
                    value={negativePrompt}
                    onChange={(event) => setNegativePrompt(event.target.value)}
                    className="input-modern text-sm"
                    placeholder="สิ่งที่ไม่ต้องการในภาพ เช่น blurry, watermark"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Seed (optional)</label>
                  <input
                    value={seed}
                    onChange={(event) => setSeed(event.target.value.replace(/[^\d]/g, ''))}
                    className="input-modern text-sm"
                    placeholder="เช่น 42"
                  />
                </div>
              </div>

            </div>

            <div className="border-t border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 sm:p-5">
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-700">
                    {provider === 'huggingface' ? 'Image Size' : 'Aspect Ratio'}
                  </p>
                  {provider === 'gemini' ? (
                    <div className="grid grid-cols-3 gap-2 lg:grid-cols-5">
                      {geminiAspectRatios.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setGeminiAspectRatio(item.id)}
                          className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${geminiAspectRatio === item.id
                            ? 'border-teal-300 bg-teal-50 text-teal-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                        >
                          <p className="font-semibold">{item.label}</p>
                          <p className="text-[10px] opacity-80">{item.hint}</p>
                        </button>
                      ))}
                    </div>
                  ) : provider === 'huggingface' ? (
                    <div className="grid grid-cols-3 gap-2 lg:grid-cols-5">
                      {hfSizeOptions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setHfSize(item.id)}
                          className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${hfSize === item.id
                            ? 'border-teal-300 bg-teal-50 text-teal-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                        >
                          <p className="font-semibold">{item.label}</p>
                          <p className="text-[10px] opacity-80">{item.hint}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                      {sizeOptions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSize(item.id)}
                          className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${size === item.id
                            ? 'border-teal-300 bg-teal-50 text-teal-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                        >
                          <p className="font-semibold">{item.label}</p>
                          <p className="text-[10px] opacity-80">{item.hint}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {(provider === 'gemini' || provider === 'huggingface') && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {provider === 'gemini' && (
                      <div>
                        <p className="mb-2 text-xs font-medium text-gray-700">Image Size</p>
                        <div className="grid grid-cols-2 gap-2">
                          {geminiImageSizes.filter((s) => {
                            const activeModel = customModel.trim() || model;
                            return s.models.includes(activeModel) || s.id === '1K';
                          }).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setGeminiImageSize(item.id)}
                              className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${geminiImageSize === item.id
                                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                }`}
                            >
                              <p className="font-semibold">{item.label}</p>
                              <p className="text-[10px] opacity-80">{item.description}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="mb-2 text-xs font-medium text-gray-700">Output Format</p>
                      <div className="grid grid-cols-2 gap-2">
                        {outputFormatOptions.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setOutputFormat(item.id)}
                            className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${outputFormat === item.id
                              ? 'border-violet-300 bg-violet-50 text-violet-700'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                              }`}
                          >
                            <p className="font-semibold">{item.label}</p>
                            <p className="text-[10px] opacity-80">{item.description}</p>
                          </button>
                        ))}
                      </div>
                      {outputFormat === 'image/jpeg' && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[10px] text-gray-500">
                            <span>Compression Quality</span>
                            <span className="font-medium text-gray-700">{jpegQuality}%</span>
                          </div>
                          <input
                            type="range"
                            min={10}
                            max={100}
                            step={5}
                            value={jpegQuality}
                            onChange={(event) => setJpegQuality(Number.parseInt(event.target.value, 10))}
                            className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-violet-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-gray-200 bg-white/80 p-3">
                  <div className="grid items-end gap-3 md:grid-cols-12">
                    <div className="md:col-span-4">
                      <label className="mb-1 block text-xs font-medium text-gray-700">Quality</label>
                      <select
                        value={quality}
                        onChange={(event) => setQuality(event.target.value)}
                        className="input-modern text-sm"
                      >
                        <option value="auto">Auto</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>

                    <div className="md:col-span-4">
                      <label className="mb-1 block text-xs font-medium text-gray-700">Count</label>
                      <select
                        value={count}
                        onChange={(event) => setCount(Number.parseInt(event.target.value, 10))}
                        disabled={provider === 'pollo'}
                        className="input-modern text-sm"
                      >
                        <option value={1}>1 image</option>
                        <option value={2}>2 images</option>
                        <option value={3}>3 images</option>
                        <option value={4}>4 images</option>
                      </select>
                    </div>

                    <div className="md:col-span-4">
                      <div className="flex h-full flex-wrap items-center gap-2 md:justify-end">
                        {provider === 'pollo' ? (
                          <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700">
                            Pollo สร้างได้ทีละ 1 งาน
                          </span>
                        ) : (
                          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                            Ctrl/Cmd + Enter to Generate
                          </span>
                        )}

                        {provider === 'puter' && (
                          <label className="inline-flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700">
                            <input
                              type="checkbox"
                              checked={puterTestMode}
                              onChange={(event) => setPuterTestMode(event.target.checked)}
                            />
                            Puter test mode
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
