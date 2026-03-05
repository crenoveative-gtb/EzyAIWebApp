const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const FormData = require('form-data');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { VertexAI } = require('@google-cloud/vertexai');
const { exec } = require('child_process');
// youtube-transcript package removed — custom implementation below
const ytdlp = require('yt-dlp-exec');
const dotenv = require('dotenv');
const { createSupabaseStore } = require('./supabaseStore');

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 4300);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:4301';
const AIMLAPI_BASE_URL = process.env.AIMLAPI_BASE_URL || 'https://api.aimlapi.com/v1';
const HUGGINGFACE_BASE_URL = process.env.HUGGINGFACE_BASE_URL || 'https://router.huggingface.co/hf-inference';
const HUGGINGFACE_FAL_URL = 'https://router.huggingface.co/fal-ai';
const HUGGINGFACE_REPLICATE_URL = 'https://router.huggingface.co/replicate';
const POLLINATIONS_BASE_URL = process.env.POLLINATIONS_BASE_URL || 'https://gen.pollinations.ai';
const POLLO_BASE_URL = process.env.POLLO_BASE_URL || 'https://pollo.ai/api/platform';
const REPLICATE_BASE_URL = process.env.REPLICATE_BASE_URL || 'https://api.replicate.com/v1';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_PROJECT_ID || '';
const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'global';
const AGENT_WORKSPACE_ROOT = path.resolve(process.env.AGENT_WORKSPACE_ROOT || path.resolve(__dirname, '..', '..'));
const AGENT_DEFAULT_MODEL = process.env.AGENT_DEFAULT_MODEL || 'claude-sonnet-4-6';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const SUPABASE_DB_SCHEMA = process.env.SUPABASE_DB_SCHEMA || 'EzyAIAgent';
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'Dev_Test';
const SUPABASE_STORAGE_FOLDER = process.env.SUPABASE_STORAGE_FOLDER || 'EzyAIAgent';
const IMAGE_GEN_RETENTION_DAYS = Number.parseInt(process.env.IMAGE_GEN_RETENTION_DAYS || '4', 10) || 4;
const IMAGE_GEN_CLEANUP_INTERVAL_MS = Number.parseInt(process.env.IMAGE_GEN_CLEANUP_INTERVAL_MS || `${60 * 1000}`, 10) || 60000;
const IMAGE_GEN_HISTORY_MAX_LIMIT = 200;

if (!SUPABASE_URL || !SUPABASE_DB_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase config: SUPABASE_URL, SUPABASE_DB_URL, SUPABASE_SERVICE_ROLE_KEY');
}

const dbPool = new Pool({
  connectionString: SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const store = createSupabaseStore({
  supabaseUrl: SUPABASE_URL,
  dbUrl: SUPABASE_DB_URL,
  supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  schemaName: SUPABASE_DB_SCHEMA,
  bucketName: SUPABASE_STORAGE_BUCKET,
  folderName: SUPABASE_STORAGE_FOLDER
});

const providerFieldMap = {
  gemini: 'geminiApiKey',
  openrouter: 'openrouterApiKey',
  groq: 'groqApiKey',
  aimlapi: 'aimlapiApiKey',
  huggingface: 'huggingfaceApiKey',
  pollinations: 'pollinationsApiKey',
  replicate: 'replicateApiKey',
  pollo: 'polloApiKey',
  bfl: 'bflApiKey',
  renderful: 'renderfulApiKey',
  kie: 'kieApiKey',
  fal: 'falApiKey'
};

const settingsProviders = Object.keys(providerFieldMap);
const allowedProviders = ['gemini', 'openrouter', 'groq', 'aimlapi'];
const openAiCompatibleImageProviders = ['openrouter', 'aimlapi'];
const imageGenerationProviders = [...openAiCompatibleImageProviders, 'huggingface', 'pollinations', 'replicate', 'gemini', 'bfl', 'renderful', 'kie', 'fal'];
const modelListProviders = [...allowedProviders, 'huggingface', 'pollinations', 'pollo', 'replicate', 'bfl', 'renderful', 'kie', 'fal'];
const openAiCompatibleTranscriptionProviders = ['openrouter', 'groq', 'aimlapi'];
const crossPlatformTargetIds = ['tiktok', 'x', 'threads', 'instagram'];
const huggingFaceImageModels = [
  // hf-inference (free credits eligible)
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

const huggingFaceModelProviders = {
  'black-forest-labs/FLUX.1-schnell': 'hf-inference',
  'black-forest-labs/FLUX.1-dev': 'hf-inference',
  'stabilityai/stable-diffusion-xl-base-1.0': 'hf-inference',
  'stabilityai/stable-diffusion-3-medium-diffusers': 'hf-inference',
  'Tongyi-MAI/Z-Image-Turbo': 'fal-ai',
  'Tongyi-MAI/Z-Image': 'fal-ai',
  'Qwen/Qwen-Image-2512': 'fal-ai',
  'Qwen/Qwen-Image': 'fal-ai',
  'stabilityai/stable-diffusion-3.5-large': 'fal-ai',
  'stabilityai/stable-diffusion-3.5-medium': 'fal-ai',
  'stabilityai/stable-diffusion-3-medium': 'fal-ai',
  'zai-org/GLM-Image': 'fal-ai',
  'tencent/HunyuanImage-3.0': 'fal-ai',
  'Alpha-VLLM/Lumina-Image-2.0': 'fal-ai',
  'ByteDance/Hyper-SD': 'fal-ai',
  'fal/FLUX.2-dev-Turbo': 'fal-ai',
  'fal/AuraFlow': 'fal-ai',
  'ByteDance/SDXL-Lightning': 'replicate'
};

function getHuggingFaceBaseUrl(model) {
  const provider = huggingFaceModelProviders[model];
  if (provider === 'fal-ai') return HUGGINGFACE_FAL_URL;
  if (provider === 'replicate') return HUGGINGFACE_REPLICATE_URL;
  return HUGGINGFACE_BASE_URL;
}
const pollinationsImageModels = [
  // Free (no paid_only flag)
  'flux',
  'gptimage',
  'zimage',
  'imagen-4',
  'klein',
  'klein-large',
  // Paid only
  'kontext',
  'nanobanana',
  'nanobanana-pro',
  'seedream',
  'seedream-pro',
  'gptimage-large'
];
const replicateImageModels = [
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
const polloGenerationModels = [
  // Pollo native
  'pollo-image-v2',
  'pollo-image-v1-6',
  // FLUX family (Black Forest Labs)
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
const bflImageModels = [
  { id: 'flux-dev', price: '$0.025' },
  { id: 'flux-2-klein-4b', price: 'from $0.014' },
  { id: 'flux-2-klein-9b', price: 'from $0.015' },
  { id: 'flux-2-pro', price: 'from $0.03' },
  { id: 'flux-2-flex', price: '$0.05' },
  { id: 'flux-2-max', price: 'from $0.04' },
  { id: 'flux-kontext-pro', price: '$0.04' },
  { id: 'flux-kontext-max', price: '$0.08' },
  { id: 'flux-pro-1.1', price: '$0.04' },
  { id: 'flux-pro-1.1-ultra', price: '$0.06' }
];
const renderfulImageModels = [
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
const kieImageModels = [
  // First-party endpoints
  '4o-image',
  'flux-kontext-pro',
  'flux-kontext-max',
  // Market models — Black Forest Labs
  'flux-2/flex-text-to-image',
  'flux-2/pro-text-to-image',
  // Market models — Google
  'google/imagen4',
  'google/imagen4-fast',
  'google/imagen4-ultra',
  'google/nano-banana',
  // Market models — OpenAI
  'gpt-image/1.5-text-to-image',
  // Market models — ByteDance Seedream
  'seedream/4.5-text-to-image',
  'bytedance/seedream-v4-text-to-image',
  'bytedance/seedream',
  // Market models — Alibaba
  'qwen/text-to-image',
  'z-image',
  // Market models — xAI
  'grok-imagine/text-to-image',
  // Market models — Ideogram
  'ideogram/character'
];
const falImageModels = [
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
const vertexAnthropicModels = ['claude-sonnet-4-6'];

function normalizeStoredKeys(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    geminiApiKey: typeof source.geminiApiKey === 'string' ? source.geminiApiKey.trim() : '',
    openrouterApiKey: typeof source.openrouterApiKey === 'string' ? source.openrouterApiKey.trim() : '',
    groqApiKey: typeof source.groqApiKey === 'string' ? source.groqApiKey.trim() : '',
    aimlapiApiKey: typeof source.aimlapiApiKey === 'string' ? source.aimlapiApiKey.trim() : '',
    huggingfaceApiKey: typeof source.huggingfaceApiKey === 'string' ? source.huggingfaceApiKey.trim() : '',
    pollinationsApiKey: typeof source.pollinationsApiKey === 'string' ? source.pollinationsApiKey.trim() : '',
    replicateApiKey: typeof source.replicateApiKey === 'string' ? source.replicateApiKey.trim() : '',
    polloApiKey: typeof source.polloApiKey === 'string' ? source.polloApiKey.trim() : '',
    bflApiKey: typeof source.bflApiKey === 'string' ? source.bflApiKey.trim() : '',
    renderfulApiKey: typeof source.renderfulApiKey === 'string' ? source.renderfulApiKey.trim() : '',
    kieApiKey: typeof source.kieApiKey === 'string' ? source.kieApiKey.trim() : '',
    falApiKey: typeof source.falApiKey === 'string' ? source.falApiKey.trim() : ''
  };
}

async function readStoredKeys(userId) {
  const keys = normalizeStoredKeys(await store.readStoredKeys(userId));
  if (!keys.geminiApiKey && GOOGLE_API_KEY) {
    keys.geminiApiKey = GOOGLE_API_KEY;
  }
  return keys;
}

async function writeStoredKeys(userId, nextKeys) {
  const normalized = normalizeStoredKeys(nextKeys);
  return store.writeStoredKeys(userId, normalized);
}

function maskKey(value) {
  if (!value) return null;
  const key = value.trim();
  if (!key) return null;
  if (key.length <= 8) {
    return `${key.slice(0, 2)}***${key.slice(-2)}`;
  }
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

function buildSettingsResponse(keys) {
  return {
    geminiApiKey: maskKey(keys.geminiApiKey),
    hasGeminiKey: !!keys.geminiApiKey,
    openrouterApiKey: maskKey(keys.openrouterApiKey),
    hasOpenrouterKey: !!keys.openrouterApiKey,
    groqApiKey: maskKey(keys.groqApiKey),
    hasGroqKey: !!keys.groqApiKey,
    aimlapiApiKey: maskKey(keys.aimlapiApiKey),
    hasAimlapiKey: !!keys.aimlapiApiKey,
    huggingfaceApiKey: maskKey(keys.huggingfaceApiKey),
    hasHuggingfaceKey: !!keys.huggingfaceApiKey,
    pollinationsApiKey: maskKey(keys.pollinationsApiKey),
    hasPollinationsKey: !!keys.pollinationsApiKey,
    replicateApiKey: maskKey(keys.replicateApiKey),
    hasReplicateKey: !!keys.replicateApiKey,
    polloApiKey: maskKey(keys.polloApiKey),
    hasPolloKey: !!keys.polloApiKey,
    bflApiKey: maskKey(keys.bflApiKey),
    hasBflKey: !!keys.bflApiKey,
    renderfulApiKey: maskKey(keys.renderfulApiKey),
    hasRenderfulKey: !!keys.renderfulApiKey,
    kieApiKey: maskKey(keys.kieApiKey),
    hasKieKey: !!keys.kieApiKey,
    falApiKey: maskKey(keys.falApiKey),
    hasFalKey: !!keys.falApiKey
  };
}

function getProviderKey(keys, provider) {
  const field = providerFieldMap[provider];
  return field ? (keys[field] || '').trim() : '';
}

function normalizeChatRole(role) {
  if (role === 'system' || role === 'user' || role === 'assistant') {
    return role;
  }
  return null;
}

function buildOpenAiCompatiblePayload(body) {
  const sourceMessages = Array.isArray(body?.messages) ? body.messages : [];
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const systemPrompt = typeof body?.system_prompt === 'string' ? body.system_prompt.trim() : '';

  const normalizedMessages = sourceMessages
    .map((message) => {
      const role = normalizeChatRole(message?.role);
      const content = typeof message?.content === 'string' ? message.content.trim() : '';
      if (!role || !content) return null;
      return { role, content };
    })
    .filter(Boolean);

  if (systemPrompt && !normalizedMessages.some((message) => message.role === 'system')) {
    normalizedMessages.unshift({ role: 'system', content: systemPrompt });
  }

  if (normalizedMessages.length === 0 && prompt) {
    normalizedMessages.push({ role: 'user', content: prompt });
  }

  return {
    model: body?.model,
    messages: normalizedMessages,
    temperature: typeof body?.temperature === 'number' ? body.temperature : undefined,
    top_p: typeof body?.top_p === 'number' ? body.top_p : undefined,
    max_tokens: typeof body?.max_tokens === 'number' ? body.max_tokens : undefined,
    presence_penalty: typeof body?.presence_penalty === 'number' ? body.presence_penalty : undefined,
    frequency_penalty: typeof body?.frequency_penalty === 'number' ? body.frequency_penalty : undefined,
    stream: false
  };
}

function pickTextFromOpenAiResponse(payload) {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

function buildGeminiRequestParts(messages, prompt, systemPrompt) {
  const sourceMessages = Array.isArray(messages) ? messages : [];
  const collectedSystemText = [];
  const contents = [];

  if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
    collectedSystemText.push(systemPrompt.trim());
  }

  for (const message of sourceMessages) {
    const role = normalizeChatRole(message?.role);
    const content = typeof message?.content === 'string' ? message.content.trim() : '';
    if (!role || !content) continue;
    if (role === 'system') {
      collectedSystemText.push(content);
      continue;
    }
    contents.push({
      role: role === 'assistant' ? 'model' : 'user',
      parts: [{ text: content }]
    });
  }

  if (contents.length === 0 && typeof prompt === 'string' && prompt.trim()) {
    contents.push({ role: 'user', parts: [{ text: prompt.trim() }] });
  }

  const mergedSystemText = collectedSystemText.join('\n\n').trim();
  const systemInstruction = mergedSystemText
    ? { parts: [{ text: mergedSystemText }] }
    : undefined;

  return {
    contents: contents.length > 0 ? contents : null,
    systemInstruction
  };
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.response = { status, data: { error: { message } } };
  return error;
}

function normalizeVertexAnthropicModel(model) {
  if (typeof model !== 'string') return '';
  const normalized = model.trim().replace(/^models\//, '');
  if (!normalized) return '';
  if (normalized.startsWith('publishers/anthropic/models/')) return normalized;
  if (normalized.startsWith('claude-')) return `publishers/anthropic/models/${normalized}`;
  return '';
}

function isVertexAnthropicModel(model) {
  return Boolean(normalizeVertexAnthropicModel(model));
}

function withVertexAnthropicModels(models) {
  const merged = Array.isArray(models) ? [...models] : [];
  for (const model of vertexAnthropicModels) {
    if (!merged.includes(model)) {
      merged.push(model);
    }
  }
  return merged;
}

async function generateVertexAnthropicText({
  apiKey,
  model,
  messages,
  prompt,
  systemPrompt,
  temperature,
  topP,
  maxTokens
}) {
  const normalizedModel = normalizeVertexAnthropicModel(model);
  if (!normalizedModel) {
    throw createHttpError(400, 'Vertex Anthropic model is invalid');
  }

  if (!GOOGLE_CLOUD_PROJECT) {
    throw createHttpError(400, 'Missing GOOGLE_CLOUD_PROJECT for Vertex Anthropic models');
  }

  const { contents, systemInstruction } = buildGeminiRequestParts(messages, prompt, systemPrompt);
  if (!contents) {
    throw createHttpError(400, 'messages หรือ prompt ต้องมีอย่างน้อย 1 รายการ');
  }

  const client = new VertexAI({
    project: GOOGLE_CLOUD_PROJECT,
    location: GOOGLE_CLOUD_LOCATION,
    apiKey
  });

  const modelClient = client.getGenerativeModel({ model: normalizedModel });
  const payload = {
    contents,
    generationConfig: {
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      topP: typeof topP === 'number' ? topP : 0.9,
      maxOutputTokens: typeof maxTokens === 'number' ? maxTokens : 1024
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = systemInstruction;
  }

  const result = await modelClient.generateContent(payload);

  const responsePayload = result?.response || result;
  return {
    model: normalizedModel.replace(/^publishers\/anthropic\/models\//, ''),
    text: pickGeminiText(responsePayload),
    usage: responsePayload?.usageMetadata || null
  };
}

async function listGeminiModels(apiKey) {
  const endpoints = [
    'https://generativelanguage.googleapis.com/v1beta/models',
    'https://generativelanguage.googleapis.com/v1/models'
  ];

  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
        timeout: 30000
      });
      return response.data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function normalizeGeminiModelNames(payload) {
  const models = Array.isArray(payload?.models) ? payload.models : [];
  return models
    .filter((model) => {
      if (!Array.isArray(model?.supportedGenerationMethods)) {
        return true;
      }
      return model.supportedGenerationMethods.includes('generateContent');
    })
    .map((model) => model?.name || model?.model || '')
    .filter((name) => typeof name === 'string' && name.trim().length > 0)
    .map((name) => name.replace(/^models\//, ''));
}

function pickGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';

  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function getRemoteError(error, fallback) {
  const status = error?.response?.status || 500;
  const remoteError = error?.response?.data?.error;
  const remoteMessage = typeof remoteError === 'string' ? remoteError : remoteError?.message;
  let message =
    remoteMessage ||
    error?.response?.data?.message ||
    error?.response?.data?.detail ||
    error?.message ||
    fallback;

  // Translate common low-level network errors to user-friendly Thai messages
  const msgLower = String(message || '').toLowerCase();
  if (msgLower.includes('socket hang up') || msgLower.includes('econnreset')) {
    message = 'การเชื่อมต่อกับ API ถูกตัด (socket hang up) — อาจเกิดจากไฟล์ใหญ่เกิน หรือ API ไม่ตอบสนอง กรุณาลองใหม่';
  } else if (msgLower.includes('etimedout') || msgLower.includes('timeout')) {
    message = 'การเชื่อมต่อกับ API หมดเวลา (timeout) — กรุณาลองใหม่อีกครั้ง';
  } else if (msgLower.includes('econnrefused')) {
    message = 'ไม่สามารถเชื่อมต่อกับ API ได้ (connection refused)';
  }

  return { status, message };
}

function resolveProviderBaseUrl(provider) {
  if (provider === 'openrouter') return 'https://openrouter.ai/api/v1';
  if (provider === 'groq') return 'https://api.groq.com/openai/v1';
  return AIMLAPI_BASE_URL;
}

function buildProviderHeaders(provider, apiKey, contentType = 'application/json') {
  const headers = {
    Authorization: `Bearer ${apiKey}`
  };
  if (contentType) headers['Content-Type'] = contentType;

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = PUBLIC_BASE_URL;
    headers['X-Title'] = 'Isolated AI Pages';
  }

  return headers;
}

async function generateTextWithProvider({
  provider,
  model,
  apiKey,
  messages,
  prompt,
  systemPrompt,
  temperature = 0.7,
  topP = 0.9,
  maxTokens = 1024,
  presencePenalty,
  frequencyPenalty,
  timeoutMs = 60000
}) {
  const normalizedModel = typeof model === 'string' ? model.trim() : '';
  if (!normalizedModel) {
    const error = new Error('Model is required');
    error.response = { status: 400, data: { error: { message: error.message } } };
    throw error;
  }

  if (provider === 'gemini') {
    if (isVertexAnthropicModel(normalizedModel)) {
      return generateVertexAnthropicText({
        apiKey,
        model: normalizedModel,
        messages,
        prompt,
        systemPrompt,
        temperature,
        topP,
        maxTokens
      });
    }

    const normalizedGeminiModel = normalizedModel.replace(/^models\//, '');
    const { contents, systemInstruction } = buildGeminiRequestParts(messages, prompt, systemPrompt);

    if (!contents) {
      throw createHttpError(400, 'messages หรือ prompt ต้องมีอย่างน้อย 1 รายการ');
    }

    const payload = {
      contents,
      generationConfig: {
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        topP: typeof topP === 'number' ? topP : 0.9,
        maxOutputTokens: typeof maxTokens === 'number' ? maxTokens : 1024
      }
    };

    if (systemInstruction) {
      payload.systemInstruction = systemInstruction;
    }

    const versions = ['v1beta', 'v1'];
    let response;
    let lastError;

    for (const version of versions) {
      try {
        const requestUrl = `https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(normalizedGeminiModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        response = await axios.post(requestUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: timeoutMs
        });
        break;
      } catch (error) {
        lastError = error;
        const message = error?.response?.data?.error?.message || error?.response?.data?.message || '';
        const shouldRetry = version === 'v1beta' && (error?.response?.status === 404 || message.includes('v1beta'));
        if (!shouldRetry) {
          throw error;
        }
      }
    }

    if (!response) {
      throw lastError;
    }

    return {
      model: normalizedModel,
      text: pickGeminiText(response.data),
      usage: response.data?.usageMetadata || null
    };
  }

  const payload = buildOpenAiCompatiblePayload({
    model: normalizedModel,
    messages,
    prompt,
    system_prompt: systemPrompt,
    temperature,
    top_p: topP,
    max_tokens: maxTokens,
    presence_penalty: presencePenalty,
    frequency_penalty: frequencyPenalty
  });

  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    const error = new Error('messages หรือ prompt ต้องมีอย่างน้อย 1 รายการ');
    error.response = { status: 400, data: { error: { message: error.message } } };
    throw error;
  }

  const baseUrl = resolveProviderBaseUrl(provider);
  const response = await axios.post(`${baseUrl}/chat/completions`, payload, {
    headers: buildProviderHeaders(provider, apiKey),
    timeout: timeoutMs
  });

  return {
    model: response.data?.model || normalizedModel,
    text: pickTextFromOpenAiResponse(response.data),
    usage: response.data?.usage || null
  };
}

const dangerousCommandPatterns = [
  /\brm\s+-rf\b/i,
  /\bdel\s+\/s\b/i,
  /\bformat\b/i,
  /\bshutdown\b/i,
  /\bpoweroff\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-fdx\b/i,
  /\bRemove-Item\b.*\b-Recurse\b.*\b-Force\b/i
];

function resolveSafePath(targetPath) {
  const normalized = typeof targetPath === 'string' ? targetPath.trim() : '';
  if (!normalized) {
    throw createHttpError(400, 'path is required');
  }

  const absolutePath = path.resolve(AGENT_WORKSPACE_ROOT, normalized);
  const workspaceRootWithSep = `${AGENT_WORKSPACE_ROOT}${path.sep}`;
  if (absolutePath !== AGENT_WORKSPACE_ROOT && !absolutePath.startsWith(workspaceRootWithSep)) {
    throw createHttpError(403, 'Path is outside workspace');
  }

  const blockedRoots = [path.join(AGENT_WORKSPACE_ROOT, '.git')];
  if (blockedRoots.some((blocked) => absolutePath === blocked || absolutePath.startsWith(`${blocked}${path.sep}`))) {
    throw createHttpError(403, 'Path is blocked');
  }

  return absolutePath;
}

function parseJsonLoose(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const direct = (() => {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  })();
  if (direct && typeof direct === 'object') return direct;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch {
      return null;
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const sliced = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(sliced);
    } catch {
      return null;
    }
  }

  return null;
}

function runCommandTool(command, timeoutMs = 90000, workdir = '.') {
  return new Promise((resolve, reject) => {
    const candidate = typeof command === 'string' ? command.trim() : '';
    if (!candidate) {
      return reject(createHttpError(400, 'command is required'));
    }

    if (dangerousCommandPatterns.some((pattern) => pattern.test(candidate))) {
      return reject(createHttpError(403, 'Command blocked by safety policy'));
    }

    const cwd = resolveSafePath(workdir);
    exec(candidate, { cwd, timeout: Math.min(Math.max(timeoutMs, 1000), 180000), windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        return resolve({
          ok: false,
          code: typeof error.code === 'number' ? error.code : 1,
          stdout: String(stdout || '').slice(0, 8000),
          stderr: String(stderr || error.message || '').slice(0, 8000)
        });
      }

      return resolve({
        ok: true,
        code: 0,
        stdout: String(stdout || '').slice(0, 8000),
        stderr: String(stderr || '').slice(0, 8000)
      });
    });
  });
}

async function runAgentTool(action, args) {
  const safeArgs = args && typeof args === 'object' ? args : {};

  if (action === 'read_file') {
    const filePath = resolveSafePath(safeArgs.path);
    const maxChars = Number.isFinite(Number(safeArgs.max_chars))
      ? Math.min(Math.max(Number(safeArgs.max_chars), 200), 30000)
      : 8000;
    const content = await fs.promises.readFile(filePath, 'utf8');
    return { path: safeArgs.path, content: content.slice(0, maxChars), truncated: content.length > maxChars };
  }

  if (action === 'search_code') {
    const query = typeof safeArgs.query === 'string' ? safeArgs.query.trim() : '';
    if (!query) {
      throw createHttpError(400, 'query is required');
    }
    const maxResults = Number.isFinite(Number(safeArgs.max_results))
      ? Math.min(Math.max(Number(safeArgs.max_results), 1), 200)
      : 60;
    const cmd = `rg -n --hidden --no-ignore-vcs --max-count ${maxResults} ${JSON.stringify(query)} .`;
    const result = await runCommandTool(cmd, 60000, '.');
    return {
      query,
      output: (result.stdout || result.stderr || '').split(/\r?\n/).filter(Boolean).slice(0, maxResults)
    };
  }

  if (action === 'write_file') {
    const filePath = resolveSafePath(safeArgs.path);
    const content = typeof safeArgs.content === 'string' ? safeArgs.content : '';
    const mode = safeArgs.mode === 'append' ? 'append' : 'overwrite';
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    if (mode === 'append') {
      await fs.promises.appendFile(filePath, content, 'utf8');
    } else {
      await fs.promises.writeFile(filePath, content, 'utf8');
    }
    return { path: safeArgs.path, bytes: Buffer.byteLength(content, 'utf8'), mode };
  }

  if (action === 'run_command') {
    const result = await runCommandTool(safeArgs.command, safeArgs.timeout_ms, safeArgs.workdir || '.');
    return result;
  }

  throw createHttpError(400, `Unsupported tool action: ${action}`);
}

async function runAgentLoop({
  apiKey,
  model,
  goal,
  context,
  maxSteps
}) {
  const toolHistory = [];
  const localMaxSteps = Number.isFinite(Number(maxSteps)) ? Math.min(Math.max(Number(maxSteps), 1), 10) : 6;

  const systemInstruction = [
    'You are a software engineering coding agent.',
    'Decide one action per turn using valid JSON only.',
    'Allowed actions: read_file, search_code, write_file, run_command, final.',
    'Return this JSON schema exactly:',
    '{',
    '  "thought": "short reasoning",',
    '  "action": "read_file|search_code|write_file|run_command|final",',
    '  "args": { },',
    '  "final": "required only when action is final"',
    '}',
    'Never include markdown code fences.',
    'If you have enough information and work is complete, use action=final.'
  ].join('\n');

  const historyMessages = [
    { role: 'user', content: `SYSTEM:\n${systemInstruction}` },
    { role: 'user', content: `GOAL:\n${goal}` },
    { role: 'user', content: `CONTEXT:\n${context || 'No extra context provided.'}` }
  ];

  for (let stepIndex = 0; stepIndex < localMaxSteps; stepIndex += 1) {
    const generated = await generateTextWithProvider({
      provider: 'gemini',
      model,
      apiKey,
      messages: historyMessages,
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 1400,
      timeoutMs: 120000
    });

    const raw = (generated.text || '').trim();
    const parsed = parseJsonLoose(raw);
    if (!parsed || typeof parsed !== 'object') {
      toolHistory.push({
        step: stepIndex + 1,
        action: 'model_output_error',
        result: raw.slice(0, 1000)
      });
      historyMessages.push({ role: 'assistant', content: raw || '{}' });
      historyMessages.push({
        role: 'user',
        content: 'Your response was not valid JSON. Reply with valid JSON only, following the schema.'
      });
      continue;
    }

    const action = typeof parsed.action === 'string' ? parsed.action.trim() : '';
    const thought = typeof parsed.thought === 'string' ? parsed.thought.trim() : '';
    const args = parsed.args && typeof parsed.args === 'object' ? parsed.args : {};

    if (action === 'final') {
      return {
        done: true,
        summary: typeof parsed.final === 'string' ? parsed.final : 'Agent finished.',
        steps: toolHistory
      };
    }

    try {
      const result = await runAgentTool(action, args);
      toolHistory.push({
        step: stepIndex + 1,
        thought,
        action,
        args,
        result
      });

      historyMessages.push({ role: 'assistant', content: JSON.stringify({ thought, action, args }) });
      historyMessages.push({
        role: 'user',
        content: `TOOL_RESULT:\n${JSON.stringify(result).slice(0, 12000)}\nContinue with next JSON action.`
      });
    } catch (error) {
      const { status, message } = getRemoteError(error, 'Tool execution failed');
      toolHistory.push({
        step: stepIndex + 1,
        thought,
        action,
        args,
        error: { status, message }
      });
      historyMessages.push({ role: 'assistant', content: JSON.stringify({ thought, action, args }) });
      historyMessages.push({
        role: 'user',
        content: `TOOL_ERROR:\n${message}\nAdjust and continue with next JSON action.`
      });
    }
  }

  return {
    done: false,
    summary: 'Reached max steps before completion.',
    steps: toolHistory
  };
}

function pickTranscriptionText(payload) {
  if (typeof payload?.text === 'string' && payload.text.trim()) {
    return payload.text.trim();
  }

  const fromSegments = Array.isArray(payload?.segments)
    ? payload.segments
      .map((segment) => (typeof segment?.text === 'string' ? segment.text : ''))
      .filter(Boolean)
      .join(' ')
      .trim()
    : '';

  if (fromSegments) return fromSegments;

  const channelText = payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  if (typeof channelText === 'string' && channelText.trim()) {
    return channelText.trim();
  }

  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return '';
}

function chunkLongText(text, maxChars = 12000) {
  const source = typeof text === 'string' ? text.trim() : '';
  if (!source) return [];
  if (source.length <= maxChars) return [source];

  const chunks = [];
  let cursor = 0;
  while (cursor < source.length) {
    let end = Math.min(cursor + maxChars, source.length);
    if (end < source.length) {
      const near = source.lastIndexOf('\n', end);
      if (near > cursor + Math.floor(maxChars * 0.5)) {
        end = near;
      } else {
        const dot = source.lastIndexOf('.', end);
        if (dot > cursor + Math.floor(maxChars * 0.6)) end = dot + 1;
      }
    }
    const part = source.slice(cursor, end).trim();
    if (part) chunks.push(part);
    cursor = end;
  }
  return chunks;
}

function normalizeLanguageHint(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'auto' || normalized === 'auto-detect') return '';
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(normalized)) return '';
  return normalized;
}

function sanitizeSummaryOutput(text) {
  const source = String(text || '').replace(/\r/g, '\n').trim();
  if (!source) return '';

  const lines = source.split('\n');
  const shouldDropLeadingLine = (line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed) return true;
    if (/^[-_*#`~\s]{3,}$/.test(trimmed)) return true;
    if (/^```/.test(trimmed)) return true;
    if (/^นี่คือสรุป/.test(trimmed)) return true;
    if (/^สรุปเนื้อหาจาก/.test(trimmed)) return true;
    return false;
  };

  while (lines.length > 0 && shouldDropLeadingLine(lines[0])) {
    lines.shift();
  }

  while (lines.length > 0 && /^```/.test(String(lines[lines.length - 1] || '').trim())) {
    lines.pop();
  }

  return lines.join('\n').trim();
}

function isHttpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isBlockedHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (host.endsWith('.local')) return true;
  const ipv4Match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const a = Number.parseInt(ipv4Match[1], 10);
    const b = Number.parseInt(ipv4Match[2], 10);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function guessFilenameFromUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    const pathname = parsed.pathname || '';
    const rawName = pathname.split('/').pop() || 'remote-media.bin';
    return rawName.trim() || 'remote-media.bin';
  } catch {
    return 'remote-media.bin';
  }
}

function isYouTubeUrl(urlString) {
  if (!isHttpUrl(urlString)) return false;
  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.toLowerCase();
    return host.includes('youtube.com') || host.includes('youtu.be');
  } catch {
    return false;
  }
}

function extractYouTubeVideoId(urlString) {
  if (!isHttpUrl(urlString)) return null;
  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('youtu.be')) {
      const idFromPath = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      return idFromPath || null;
    }

    if (host.includes('youtube.com')) {
      const queryId = parsed.searchParams.get('v');
      if (queryId) return queryId;

      const parts = parsed.pathname.split('/').filter(Boolean);
      const shortsIndex = parts.findIndex((part) => part === 'shorts' || part === 'embed' || part === 'live');
      if (shortsIndex >= 0 && parts[shortsIndex + 1]) return parts[shortsIndex + 1];
    }

    return null;
  } catch {
    return null;
  }
}

function decodeXmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function parseTranscriptXml(xml) {
  const RE_TEXT = /<text start="([^"]*)" dur="([^"]*)"[^>]*>([^<]*)<\/text>/g;
  const results = [];
  let match;
  while ((match = RE_TEXT.exec(xml)) !== null) {
    const text = decodeXmlEntities(match[3]).trim();
    if (text) {
      results.push({
        text,
        offset: parseFloat(match[1]),
        duration: parseFloat(match[2])
      });
    }
  }
  return results;
}

function normalizeTranscriptText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTranscriptVtt(vtt) {
  if (typeof vtt !== 'string' || !vtt.trim()) return '';

  const lines = vtt
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^WEBVTT/i.test(line))
    .filter((line) => !/^\d+$/.test(line))
    .filter((line) => !/^\d{2}:\d{2}(?::\d{2})?\.\d{3}\s+-->\s+\d{2}:\d{2}(?::\d{2})?\.\d{3}/.test(line))
    .filter((line) => !/^NOTE\b/i.test(line))
    .filter((line) => !/^STYLE\b/i.test(line))
    .filter((line) => !/^REGION\b/i.test(line))
    .map((line) => line.replace(/<[^>]+>/g, ' '))
    .map((line) => decodeXmlEntities(line))
    .map((line) => normalizeTranscriptText(line))
    .filter(Boolean);

  return normalizeTranscriptText(lines.join(' '));
}

function parseTranscriptJson3(raw) {
  try {
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const chunks = [];
    for (const event of events) {
      const segs = Array.isArray(event?.segs) ? event.segs : [];
      for (const seg of segs) {
        const text = normalizeTranscriptText(decodeXmlEntities(seg?.utf8 || ''));
        if (text) chunks.push(text);
      }
    }
    return normalizeTranscriptText(chunks.join(' '));
  } catch {
    return '';
  }
}

function parseTranscriptPayload(payload, extHint) {
  const source = typeof payload === 'string' ? payload : String(payload || '');
  const ext = String(extHint || '').toLowerCase();

  if (!source.trim()) return '';
  if (ext === 'vtt') {
    return parseTranscriptVtt(source);
  }
  if (ext === 'json3') {
    return parseTranscriptJson3(source);
  }

  const xmlRows = parseTranscriptXml(source);
  if (xmlRows.length > 0) {
    return normalizeTranscriptText(xmlRows.map((row) => row.text).join(' '));
  }

  const fromVtt = parseTranscriptVtt(source);
  if (fromVtt) return fromVtt;

  return parseTranscriptJson3(source);
}

function pickCaptionTrack(captionTracks, preferredLang) {
  if (!Array.isArray(captionTracks) || captionTracks.length === 0) return null;
  const lang = typeof preferredLang === 'string' ? preferredLang.trim().toLowerCase() : '';

  if (lang) {
    // exact match
    const exact = captionTracks.find((t) => (t.languageCode || '').toLowerCase() === lang);
    if (exact) return exact;
    // prefix match (e.g. 'th' matches 'th-TH')
    const prefix = captionTracks.find((t) => (t.languageCode || '').toLowerCase().startsWith(lang));
    if (prefix) return prefix;
  }

  // prefer manual captions over auto-generated ones
  const manual = captionTracks.find((t) => t.kind !== 'asr');
  return manual || captionTracks[0];
}

const YT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function extractCaptionTracksFromHtml(videoId) {
  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const response = await axios.get(url, {
    headers: { 'User-Agent': YT_USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
    responseType: 'text',
    timeout: 20000
  });
  const html = typeof response.data === 'string' ? response.data : '';

  if (html.includes('class="g-recaptcha"')) {
    throw new Error('YouTube is receiving too many requests (captcha required)');
  }
  if (!html.includes('"playabilityStatus":')) {
    throw new Error('Video unavailable');
  }

  // Strategy: extract ytInitialPlayerResponse JSON
  const playerRespMatch = html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|<\/script>)/s);
  if (playerRespMatch?.[1]) {
    try {
      const playerResp = JSON.parse(playerRespMatch[1]);
      const tracks = playerResp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) return tracks;
    } catch { /* parse failed, try next strategy */ }
  }

  // Fallback: split on "captions": like the old package did
  const splitted = html.split('"captions":');
  if (splitted.length > 1) {
    // Find the end delimiter — could be ,"videoDetails" or ,"microformat" etc.
    const afterCaptions = splitted[1];
    for (const delimiter of [',"videoDetails', ',"microformat', ',"playbackTracking', ',"storyboards']) {
      const idx = afterCaptions.indexOf(delimiter);
      if (idx > 0) {
        try {
          const parsed = JSON.parse(afterCaptions.slice(0, idx).replace(/\n/g, ''));
          const tracks = parsed?.playerCaptionsTracklistRenderer?.captionTracks;
          if (Array.isArray(tracks) && tracks.length > 0) return tracks;
        } catch { /* continue to next delimiter */ }
      }
    }
  }

  return null;
}

async function extractCaptionTracksFromInnerTube(videoId) {
  const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
  const payload = {
    context: {
      client: {
        hl: 'en',
        gl: 'US',
        clientName: 'WEB',
        clientVersion: '2.20241120.01.00'
      }
    },
    videoId
  };

  const response = await axios.post(
    `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}&prettyPrint=false`,
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    }
  );

  const data = response.data;
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (Array.isArray(tracks) && tracks.length > 0) return tracks;
  return null;
}

function parseYtDlpJsonOutput(rawOutput) {
  if (!rawOutput) return null;
  if (typeof rawOutput === 'object') return rawOutput;

  const source = String(rawOutput || '').trim();
  if (!source) return null;

  try {
    return JSON.parse(source);
  } catch {
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(source.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function extractYouTubeInfoWithYtDlp(urlString) {
  const attempts = [
    { extractorArgs: 'youtube:player_client=android' },
    {},
    { extractorArgs: 'youtube:player_client=all' }
  ];

  let lastError = null;
  for (const extraOptions of attempts) {
    try {
      const output = await ytdlp(urlString, {
        quiet: true,
        noWarnings: true,
        noCheckCertificates: true,
        noPlaylist: true,
        skipDownload: true,
        dumpSingleJson: true,
        jsRuntimes: 'node',
        ...extraOptions
      }, {
        timeout: 90000
      });

      const parsed = parseYtDlpJsonOutput(output);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('ไม่สามารถอ่านข้อมูลวิดีโอ YouTube ได้');
}

function pickYtDlpSubtitleTrack(source, preferredLang) {
  if (!source || typeof source !== 'object') return null;

  const preferred = typeof preferredLang === 'string' ? preferredLang.trim().toLowerCase() : '';
  const preferredShort = preferred.split('-')[0];
  const ranked = [];

  for (const [languageCode, tracks] of Object.entries(source)) {
    if (!Array.isArray(tracks)) continue;

    const lang = String(languageCode || '').toLowerCase();
    let langScore = 0;
    if (preferred) {
      if (lang === preferred) langScore += 100;
      else if (preferredShort && lang.startsWith(preferredShort)) langScore += 80;
    }
    if (lang.startsWith('en')) langScore += 10;

    for (const track of tracks) {
      const url = String(track?.url || '').trim();
      if (!url) continue;

      const ext = String(track?.ext || '').trim().toLowerCase();
      const extScore = { json3: 30, srv3: 25, vtt: 20, ttml: 10 }[ext] || 0;
      ranked.push({
        url,
        ext,
        score: langScore + extScore
      });
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked[0] || null;
}

async function loadTranscriptFromYouTubeWithYtDlp(urlString, language) {
  const info = await extractYouTubeInfoWithYtDlp(urlString);
  const subtitleTrack =
    pickYtDlpSubtitleTrack(info?.subtitles, language) ||
    pickYtDlpSubtitleTrack(info?.automatic_captions, language);

  if (!subtitleTrack?.url) {
    throw new Error('ไม่พบ transcript/captions สำหรับวิดีโอ YouTube นี้');
  }

  const response = await axios.get(subtitleTrack.url, {
    responseType: 'text',
    timeout: 25000,
    maxRedirects: 5,
    headers: {
      'User-Agent': YT_USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  const transcript = parseTranscriptPayload(response.data, subtitleTrack.ext);
  if (!transcript) {
    throw new Error('ไม่พบ transcript/captions สำหรับวิดีโอ YouTube นี้');
  }

  return transcript;
}

function resolveAudioMimeType(ext) {
  const value = String(ext || '').toLowerCase();
  if (value === 'webm') return 'audio/webm';
  if (value === 'm4a' || value === 'mp4') return 'audio/mp4';
  if (value === 'mp3') return 'audio/mpeg';
  if (value === 'wav') return 'audio/wav';
  if (value === 'ogg' || value === 'opus') return 'audio/ogg';
  return 'application/octet-stream';
}

function createLargeAudioError(sizeBytes, maxBytes) {
  const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
  const maxMB = (maxBytes / (1024 * 1024)).toFixed(0);
  const error = new Error(
    `ไฟล์เสียงจาก YouTube มีขนาด ${sizeMB} MB เกินกว่าที่ transcription API รองรับ (สูงสุด ${maxMB} MB) ` +
    'ลองวิดีโอที่สั้นลง หรือติดตั้ง ffmpeg เพื่อบีบอัด'
  );
  error.response = { status: 413, data: { error: { message: error.message } } };
  return error;
}

function toFiniteNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function selectBestYouTubeAudioFormat(formats, maxBytes) {
  if (!Array.isArray(formats) || formats.length === 0) return null;

  const candidates = formats
    .map((item) => {
      const audioCodec = String(item?.acodec || '').toLowerCase();
      const videoCodec = String(item?.vcodec || '').toLowerCase();
      const mediaUrl = String(item?.url || '').trim();
      if (!mediaUrl || !audioCodec || audioCodec === 'none') return null;

      const sizeBytes = toFiniteNumber(item?.filesize) || toFiniteNumber(item?.filesize_approx);
      const abr = toFiniteNumber(item?.abr) || toFiniteNumber(item?.tbr);

      return {
        url: mediaUrl,
        ext: String(item?.ext || 'm4a').trim().toLowerCase(),
        abr,
        sizeBytes,
        audioOnly: !videoCodec || videoCodec === 'none'
      };
    })
    .filter(Boolean);

  if (candidates.length === 0) return null;

  const knownUnderLimit = candidates
    .filter((item) => item.sizeBytes > 0 && item.sizeBytes <= maxBytes)
    .sort((a, b) => {
      if (a.audioOnly !== b.audioOnly) return Number(b.audioOnly) - Number(a.audioOnly);
      return b.abr - a.abr;
    });
  if (knownUnderLimit.length > 0) return knownUnderLimit[0];

  const maybeUnderLimit = candidates
    .filter((item) => item.sizeBytes === 0 || item.sizeBytes <= maxBytes)
    .sort((a, b) => {
      if (a.audioOnly !== b.audioOnly) return Number(b.audioOnly) - Number(a.audioOnly);
      return a.abr - b.abr;
    });
  if (maybeUnderLimit.length > 0) return maybeUnderLimit[0];

  return candidates.sort((a, b) => {
    if (a.audioOnly !== b.audioOnly) return Number(b.audioOnly) - Number(a.audioOnly);
    if (a.sizeBytes !== b.sizeBytes) return a.sizeBytes - b.sizeBytes;
    return a.abr - b.abr;
  })[0];
}

async function downloadBufferWithSizeLimit(url, headers, maxBytes) {
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 300000,
    maxRedirects: 5,
    headers,
    validateStatus: (status) => status >= 200 && status < 400
  });

  const contentLength = Number.parseInt(String(response.headers?.['content-length'] || ''), 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    response.data.destroy();
    throw createLargeAudioError(contentLength, maxBytes);
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    response.data.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        response.data.destroy(createLargeAudioError(totalBytes, maxBytes));
        return;
      }
      chunks.push(chunk);
    });

    response.data.on('error', fail);
    response.data.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
  });
}

async function downloadYouTubeAudioViaDirectStream(urlString, videoId, maxBytes) {
  const info = await extractYouTubeInfoWithYtDlp(urlString);
  const bestFormat = selectBestYouTubeAudioFormat(info?.formats, maxBytes);
  if (!bestFormat?.url) {
    throw new Error('ไม่พบ stream เสียงสำหรับวิดีโอ YouTube นี้');
  }

  const buffer = await downloadBufferWithSizeLimit(bestFormat.url, {
    'User-Agent': YT_USER_AGENT,
    Referer: 'https://www.youtube.com/',
    Origin: 'https://www.youtube.com'
  }, maxBytes);

  if (!buffer || buffer.length <= 0) {
    throw new Error('ไฟล์เสียง YouTube ว่างเปล่า');
  }

  const ext = bestFormat.ext || 'm4a';
  return {
    buffer,
    originalname: `${videoId}.${ext}`,
    mimetype: resolveAudioMimeType(ext),
    size: buffer.length
  };
}

async function loadTranscriptFromYouTube(urlString, language) {
  const videoId = extractYouTubeVideoId(urlString);
  if (!videoId) {
    throw new Error('ลิงก์ YouTube ไม่ถูกต้อง');
  }

  let captionTracks = null;
  let lastError = null;

  // Strategy 1: Scrape HTML page for ytInitialPlayerResponse
  try {
    captionTracks = await extractCaptionTracksFromHtml(videoId);
  } catch (err) {
    lastError = err;
    console.error('[youtube-transcript] HTML extraction failed:', err.message);
  }

  // Strategy 2: InnerTube API
  if (!captionTracks) {
    try {
      captionTracks = await extractCaptionTracksFromInnerTube(videoId);
    } catch (err) {
      lastError = err;
      console.error('[youtube-transcript] InnerTube extraction failed:', err.message);
    }
  }

  // Strategy 3: Use yt-dlp metadata to fetch subtitle URL (same fallback style as EzyAIAgent_02)
  if (!captionTracks || captionTracks.length === 0) {
    try {
      return await loadTranscriptFromYouTubeWithYtDlp(urlString, language);
    } catch (err) {
      lastError = err;
      console.error('[youtube-transcript] yt-dlp subtitle extraction failed:', err.message);
      throw lastError || new Error('ไม่พบ transcript/captions สำหรับวิดีโอ YouTube นี้');
    }
  }

  const track = pickCaptionTrack(captionTracks, language);
  if (!track?.baseUrl) {
    try {
      return await loadTranscriptFromYouTubeWithYtDlp(urlString, language);
    } catch {
      throw new Error('ไม่พบ transcript/captions สำหรับวิดีโอ YouTube นี้');
    }
  }

  const baseUrl = decodeXmlEntities(track.baseUrl);
  const captionResp = await axios.get(baseUrl, {
    responseType: 'text',
    timeout: 15000,
    headers: {
      'User-Agent': YT_USER_AGENT
    }
  });

  const text = parseTranscriptPayload(captionResp.data, 'xml');

  if (!text) {
    throw new Error('ไม่พบ transcript/captions สำหรับวิดีโอ YouTube นี้');
  }

  return text;
}

function mapYouTubeErrorMessage(raw) {
  const original = String(raw || '').trim();
  if (!original) {
    return 'ไม่สามารถดึง audio จาก YouTube ได้';
  }

  for (const phrase of [
    'ลิงก์ YouTube ไม่ถูกต้อง',
    'ไม่พบ transcript/captions สำหรับวิดีโอ YouTube นี้',
    'ไม่สามารถดึงเสียงจาก YouTube ได้',
    'ดาวน์โหลดเสียงจาก YouTube ไม่สำเร็จ',
    'ไฟล์เสียง YouTube ว่างเปล่า',
    'ไม่พบ stream เสียงสำหรับวิดีโอ YouTube นี้',
    'ไฟล์เสียงจาก YouTube มีขนาด'
  ]) {
    if (original.includes(phrase)) {
      return original;
    }
  }

  const text = original.toLowerCase();
  if (text.includes('enoent') || text.includes('not found') || text.includes('is not recognized')) {
    return 'ไม่พบโปรแกรม yt-dlp ในระบบ กรุณาติดตั้ง yt-dlp ก่อน (pip install yt-dlp หรือดาวน์โหลดจาก github.com/yt-dlp/yt-dlp)';
  }
  if (text.includes('disabled') || text.includes('not available') || text.includes('no transcript')) {
    return 'ไม่พบ transcript/captions สำหรับวิดีโอ YouTube นี้';
  }
  if (text.includes('video unavailable')) {
    return 'ไม่สามารถเข้าถึงวิดีโอ YouTube นี้ได้';
  }
  if (text.includes('too many request') || text.includes('captcha')) {
    return 'YouTube จำกัดคำขอชั่วคราว กรุณาลองใหม่อีกครั้ง';
  }
  if (text.includes('private')) {
    return 'วิดีโอ YouTube นี้เป็นแบบ private';
  }
  if (text.includes('age') && text.includes('restricted')) {
    return 'วิดีโอ YouTube นี้ติดข้อจำกัดอายุ';
  }
  if (text.includes('sign in') || text.includes('login')) {
    return 'วิดีโอ YouTube นี้ต้องเข้าสู่ระบบก่อนจึงจะเข้าถึงได้';
  }
  if (text.includes('timed out')) {
    return 'การดึงข้อมูลจาก YouTube ใช้เวลานานเกินกำหนด กรุณาลองวิดีโอที่สั้นลงหรือใช้ transcript โดยตรง';
  }
  return 'ไม่สามารถดึง audio จาก YouTube ได้';
}

async function downloadYouTubeAudio(urlString) {
  const videoId = extractYouTubeVideoId(urlString);
  if (!videoId) {
    const error = new Error('ลิงก์ YouTube ไม่ถูกต้อง');
    error.response = { status: 400, data: { error: { message: error.message } } };
    throw error;
  }

  const normalizedUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const maxBytes = 25 * 1024 * 1024;
  let tmpDir = null;

  try {
    // Strategy A: direct stream via yt-dlp metadata (faster and avoids full yt-dlp file download timeout).
    try {
      return await downloadYouTubeAudioViaDirectStream(normalizedUrl, videoId, maxBytes);
    } catch (directError) {
      console.warn('[downloadYouTubeAudio] direct stream failed, fallback to yt-dlp download:', directError?.message || directError);
    }

    // Strategy B: legacy yt-dlp download fallback.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezyai-yt-audio-'));
    const outputTemplate = path.join(tmpDir, 'audio.%(ext)s');
    const formatOptions = ['worstaudio', 'bestaudio/best'];
    let downloadError;

    for (const fmt of formatOptions) {
      try {
        // clean up any previous attempt files
        for (const f of fs.readdirSync(tmpDir)) {
          try { fs.unlinkSync(path.join(tmpDir, f)); } catch { /* ignore */ }
        }

        await ytdlp(normalizedUrl, {
          noWarnings: true,
          noCheckCertificates: true,
          noPlaylist: true,
          restrictFilenames: true,
          noProgress: true,
          quiet: true,
          format: fmt,
          output: outputTemplate,
          jsRuntimes: 'node'
        }, {
          timeout: 240000
        });
        downloadError = null;
        break;
      } catch (err) {
        downloadError = err;
        // worstaudio may not exist; try next format
      }
    }

    if (downloadError) throw downloadError;

    const candidates = fs.readdirSync(tmpDir)
      .filter((file) => file.startsWith('audio.'))
      .map((file) => {
        const fullPath = path.join(tmpDir, file);
        const stat = fs.statSync(fullPath);
        return { file, fullPath, size: stat.size };
      })
      .sort((a, b) => b.size - a.size);

    const picked = candidates[0];
    if (!picked || picked.size <= 0) {
      const error = new Error('ไม่สามารถดึงเสียงจาก YouTube ได้');
      error.response = { status: 400, data: { error: { message: error.message } } };
      throw error;
    }

    if (picked.size > maxBytes) {
      throw createLargeAudioError(picked.size, maxBytes);
    }

    const ext = picked.file.split('.').pop() || 'bin';
    const buffer = fs.readFileSync(picked.fullPath);

    return {
      buffer,
      originalname: `${videoId}.${ext}`,
      mimetype: resolveAudioMimeType(ext),
      size: buffer.length
    };
  } catch (error) {
    const rawMessage = error?.response?.data?.error?.message || error?.stderr || error?.message || error;
    console.error('[downloadYouTubeAudio] error:', rawMessage);
    const wrappedMessage = mapYouTubeErrorMessage(rawMessage);
    const wrapped = new Error(wrappedMessage);
    wrapped.response = { status: error?.response?.status || 400, data: { error: { message: wrapped.message } } };
    throw wrapped;
  } finally {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore temp cleanup errors
      }
    }
  }
}

async function loadMediaFromUrl(urlString) {
  if (!isHttpUrl(urlString)) {
    const error = new Error('URL ไม่ถูกต้อง');
    error.response = { status: 400, data: { error: { message: error.message } } };
    throw error;
  }

  const parsed = new URL(urlString);
  if (isBlockedHost(parsed.hostname)) {
    const error = new Error('URL นี้ไม่อนุญาตให้ดึงข้อมูล');
    error.response = { status: 400, data: { error: { message: error.message } } };
    throw error;
  }

  const response = await axios.get(urlString, {
    responseType: 'arraybuffer',
    timeout: 180000,
    maxBodyLength: 200 * 1024 * 1024,
    maxContentLength: 200 * 1024 * 1024
  });

  const contentType = typeof response.headers?.['content-type'] === 'string'
    ? response.headers['content-type']
    : 'application/octet-stream';
  const contentLengthHeader = Number.parseInt(String(response.headers?.['content-length'] || ''), 10);
  const size = Number.isNaN(contentLengthHeader) ? Buffer.byteLength(response.data) : contentLengthHeader;

  return {
    buffer: Buffer.from(response.data),
    originalname: guessFilenameFromUrl(urlString),
    mimetype: contentType,
    size
  };
}

function decodeHtmlEntities(value) {
  const source = String(value || '');
  if (!source) return '';

  const namedEntities = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  };

  return source
    .replace(/&#(\d+);/g, (_match, code) => {
      const parsed = Number.parseInt(code, 10);
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => {
      const parsed = Number.parseInt(code, 16);
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : '';
    })
    .replace(/&([a-z]+);/gi, (match, code) => namedEntities[code.toLowerCase()] || match);
}

function normalizePlainText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlToPlainText(html) {
  const text = String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|main|h1|h2|h3|h4|h5|h6|li|ul|ol|blockquote|tr|table)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ');

  return normalizePlainText(decodeHtmlEntities(text));
}

function extractMetaContent(html, marker) {
  const tags = String(html || '').match(/<meta\s+[^>]*>/gi) || [];
  const normalizedMarker = String(marker || '').toLowerCase();
  if (!normalizedMarker) return '';

  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (!lower.includes(normalizedMarker)) continue;
    const contentMatch = tag.match(/content=["']([^"']+)["']/i);
    if (contentMatch?.[1]) {
      return normalizePlainText(contentMatch[1]);
    }
  }

  return '';
}

function safeJsonParse(input) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function stripBoilerplateLines(text) {
  const source = normalizePlainText(text);
  if (!source) return '';

  const noisePatterns = [
    /\b(cookie|privacy policy|terms of use|all rights reserved|advertisement|sponsored)\b/i,
    /\b(sign in|log in|register|subscribe|newsletter|follow us|accept cookies)\b/i,
    /\b(related articles|recommended for you|read more|continue reading)\b/i,
    /\b(แชร์บทความ|อ่านเพิ่มเติม|บทความที่เกี่ยวข้อง|สมัครรับข่าวสาร|นโยบายความเป็นส่วนตัว)\b/i
  ];

  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (line.length <= 2) return false;
      if (line.length <= 140 && noisePatterns.some((pattern) => pattern.test(line))) return false;
      return true;
    });

  return normalizePlainText(lines.join('\n'));
}

function collectLongTextFromObject(value, keyHint = '', depth = 0, output = []) {
  if (depth > 9 || value == null) return output;

  if (typeof value === 'string') {
    const cleaned = normalizePlainText(value);
    if (!cleaned || cleaned.length < 80) return output;

    const key = String(keyHint || '').toLowerCase();
    const prefersKey = /(article|content|body|text|description|headline|summary|story|post|caption)/.test(key);
    if (prefersKey || cleaned.length >= 260) {
      output.push(cleaned);
    }
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectLongTextFromObject(item, keyHint, depth + 1, output);
    }
    return output;
  }

  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      collectLongTextFromObject(nested, key, depth + 1, output);
    }
  }

  return output;
}

function extractJsonLdCandidatesFromHtml(html) {
  const source = String(html || '');
  if (!source) return [];

  const scripts = source.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  const candidates = [];

  for (const scriptTag of scripts) {
    const raw = scriptTag
      .replace(/^<script\b[^>]*>/i, '')
      .replace(/<\/script>$/i, '')
      .trim();

    if (!raw || raw.length > 2 * 1024 * 1024) continue;

    const parsed = safeJsonParse(raw);
    if (!parsed) continue;

    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;

      const articleBody = normalizePlainText(node.articleBody || node.text || '');
      const description = normalizePlainText(node.description || '');
      const headline = normalizePlainText(node.headline || node.name || '');
      const mergedTopLevel = normalizePlainText([headline, description, articleBody].filter(Boolean).join('\n\n'));
      if (mergedTopLevel.length >= 120) candidates.push(mergedTopLevel);

      collectLongTextFromObject(node, '', 0, candidates);
    }
  }

  return candidates;
}

function extractEmbeddedStateCandidatesFromHtml(html) {
  const source = String(html || '');
  if (!source) return [];

  const candidates = [];
  const scriptPatterns = [
    /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>[\s\S]*?<\/script>/gi,
    /<script\b[^>]*id=["']__NUXT_DATA__["'][^>]*>[\s\S]*?<\/script>/gi,
    /<script\b[^>]*type=["']application\/json["'][^>]*>[\s\S]*?<\/script>/gi
  ];

  for (const pattern of scriptPatterns) {
    const matches = source.match(pattern) || [];
    for (const tag of matches) {
      const raw = tag
        .replace(/^<script\b[^>]*>/i, '')
        .replace(/<\/script>$/i, '')
        .trim();
      if (!raw || raw.length > 2 * 1024 * 1024) continue;

      const parsed = safeJsonParse(raw);
      if (!parsed) continue;
      collectLongTextFromObject(parsed, '', 0, candidates);
    }
  }

  return candidates;
}

function pickLongestText(candidates) {
  const unique = Array.from(new Set(
    (Array.isArray(candidates) ? candidates : [])
      .map((item) => normalizePlainText(item))
      .map((item) => stripBoilerplateLines(item))
      .filter((item) => item.length >= 80)
  ));

  if (unique.length === 0) return '';

  const noiseTerms = [
    'cookie',
    'privacy',
    'terms',
    'subscribe',
    'login',
    'register',
    'advertisement',
    'sponsored',
    'read more',
    'related articles',
    'นโยบายความเป็นส่วนตัว',
    'เงื่อนไขการใช้งาน',
    'สมัครรับข่าวสาร',
    'อ่านเพิ่มเติม'
  ];

  return unique
    .map((text) => {
      const paragraphScore = Math.min((text.match(/\n/g) || []).length, 40);
      const sentenceScore = Math.min((text.match(/[.!?]/g) || []).length, 120);
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const avgWordLength = wordCount > 0 ? text.replace(/\s+/g, '').length / wordCount : 0;
      const lexicalScore = Math.max(0, Math.min(120, Math.round(avgWordLength * 12)));
      const noisePenalty = noiseTerms.reduce((sum, term) => {
        const count = (text.toLowerCase().match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        return sum + Math.min(count, 6);
      }, 0);
      const score = text.length + paragraphScore * 32 + sentenceScore * 6 + lexicalScore * 10 - noisePenalty * 140;
      return { text, score };
    })
    .sort((a, b) => b.score - a.score)[0].text;
}

function extractArticleTextFromHtml(html) {
  const sanitized = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<canvas[\s\S]*?<\/canvas>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ');

  const candidates = [];
  const articleMatches = sanitized.match(/<article\b[^>]*>[\s\S]*?<\/article>/gi) || [];
  const mainMatches = sanitized.match(/<main\b[^>]*>[\s\S]*?<\/main>/gi) || [];
  const paragraphMatches = sanitized.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
  const contentMatches = sanitized.match(/<(article|main|section|div)\b[^>]*(?:class|id)=["'][^"']*(?:article|entry|content|story|post|body|markdown|rich-text)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi) || [];
  const itempropMatches = sanitized.match(/<(article|section|div)\b[^>]*itemprop=["']articleBody["'][^>]*>[\s\S]*?<\/\1>/gi) || [];
  const bodyMatch = sanitized.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);

  articleMatches.forEach((item) => candidates.push(htmlToPlainText(item)));
  mainMatches.forEach((item) => candidates.push(htmlToPlainText(item)));
  contentMatches.forEach((item) => candidates.push(htmlToPlainText(item)));
  itempropMatches.forEach((item) => candidates.push(htmlToPlainText(item)));

  if (paragraphMatches.length > 0) {
    candidates.push(htmlToPlainText(paragraphMatches.join('\n')));
  }

  if (bodyMatch?.[1]) {
    candidates.push(htmlToPlainText(bodyMatch[1]));
  }

  candidates.push(...extractJsonLdCandidatesFromHtml(html));
  candidates.push(...extractEmbeddedStateCandidatesFromHtml(html));

  const picked = pickLongestText(candidates);
  return stripBoilerplateLines(picked || htmlToPlainText(sanitized));
}

async function loadArticleFromUrl(urlString) {
  if (!isHttpUrl(urlString)) {
    const error = new Error('URL บทความไม่ถูกต้อง');
    error.response = { status: 400, data: { error: { message: error.message } } };
    throw error;
  }

  const parsed = new URL(urlString);
  if (isBlockedHost(parsed.hostname)) {
    const error = new Error('URL นี้ไม่อนุญาตให้ดึงข้อมูล');
    error.response = { status: 400, data: { error: { message: error.message } } };
    throw error;
  }

  const response = await axios.get(urlString, {
    responseType: 'text',
    timeout: 45000,
    maxBodyLength: 6 * 1024 * 1024,
    maxContentLength: 6 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'th-TH,th;q=0.95,en-US;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'Upgrade-Insecure-Requests': '1'
    },
    validateStatus: (status) => status >= 200 && status < 400
  });

  const html = typeof response.data === 'string' ? response.data : '';
  if (!html.trim()) {
    const error = new Error('ไม่พบเนื้อหา HTML จาก URL ที่ระบุ');
    error.response = { status: 400, data: { error: { message: error.message } } };
    throw error;
  }

  const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
  const looksLikeHtml = /^<!doctype|<html|<head|<body/i.test(html.trim());
  if (!looksLikeHtml && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    const error = new Error('URL นี้ไม่ใช่หน้าเว็บบทความ (HTML)');
    error.response = { status: 400, data: { error: { message: error.message } } };
    throw error;
  }

  const titleFromTagMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = normalizePlainText(
    titleFromTagMatch?.[1]
    || extractMetaContent(html, 'og:title')
    || extractMetaContent(html, 'twitter:title')
    || extractMetaContent(html, 'name="title"')
  ) || null;

  const description = normalizePlainText(
    extractMetaContent(html, 'name="description"')
    || extractMetaContent(html, 'og:description')
    || extractMetaContent(html, 'twitter:description')
    || extractMetaContent(html, 'name="twitter:description"')
  ) || null;

  const articleText = extractArticleTextFromHtml(html);
  const titleAndDescriptionText = normalizePlainText([title, description].filter(Boolean).join('\n\n'));
  const mergedText = normalizePlainText(
    articleText && articleText.length >= 120
      ? articleText
      : [articleText, titleAndDescriptionText].filter(Boolean).join('\n\n')
  );

  if (!mergedText || mergedText.length < 120) {
    const error = new Error('ไม่สามารถสกัดเนื้อหาบทความจาก URL นี้ได้');
    error.response = { status: 400, data: { error: { message: error.message } } };
    throw error;
  }

  return {
    title,
    description,
    text: mergedText.slice(0, 28000)
  };
}

function toStringValue(value, fallback = '') {
  if (typeof value === 'string') return normalizePlainText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function toStringArray(value, limit = 10) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\n|,/g)
      : [];

  return source
    .map((item) => toStringValue(item))
    .filter(Boolean)
    .slice(0, limit);
}

function toHashtagArray(value, limit = 10) {
  return toStringArray(value, limit)
    .map((item) => item.replace(/\s+/g, '').replace(/^#+/, ''))
    .filter(Boolean)
    .map((item) => `#${item}`);
}

function toSlideArray(value, limit = 10) {
  const items = Array.isArray(value) ? value : [];
  return items
    .slice(0, limit)
    .map((item, index) => {
      if (typeof item === 'string') {
        const body = toStringValue(item);
        if (!body) return null;
        return { title: `Slide ${index + 1}`, body };
      }

      if (!item || typeof item !== 'object') return null;

      const title = toStringValue(item.title || item.headline || item.topic || `Slide ${index + 1}`);
      const body = toStringValue(item.body || item.text || item.description || item.message);
      if (!title && !body) return null;
      return {
        title: title || `Slide ${index + 1}`,
        body: body || ''
      };
    })
    .filter(Boolean);
}

function getObjectByAliases(source, aliases) {
  const container = source && typeof source === 'object' ? source : {};
  const keys = Array.isArray(aliases) ? aliases : [];

  const parseLooseObjectString = (value) => {
    const text = String(value || '').trim();
    if (!text) return null;
    if (!(text.startsWith('{') || text.startsWith('['))) return null;
    const direct = safeJsonParse(text);
    if (direct && typeof direct === 'object') return direct;

    const repaired = text
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*:)/g, '$1"$2"$3')
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, inner) => `"${String(inner).replace(/"/g, '\\"')}"`);
    const parsed = safeJsonParse(repaired);
    return parsed && typeof parsed === 'object' ? parsed : null;
  };

  for (const key of keys) {
    const value = container[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseLooseObjectString(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    }
    if (typeof value === 'string') {
      return { text: value };
    }
  }

  return {};
}

function normalizeJsonLikeText(raw) {
  const source = String(raw || '').trim();
  if (!source) return '';

  let text = source
    .replace(/^\uFEFF/, '')
    .replace(/```(?:json|javascript|js)?/gi, '')
    .replace(/```/g, '')
    .trim();

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  text = text
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, inner) => `"${String(inner).replace(/"/g, '\\"')}"`);

  return text;
}

function extractJsonObjectFromText(text) {
  const source = typeof text === 'string' ? text.trim() : '';
  if (!source) return null;

  const attempts = [source];
  const fencedMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    attempts.push(fencedMatch[1].trim());
  }

  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    attempts.push(source.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      const normalized = normalizeJsonLikeText(candidate);
      if (!normalized) continue;
      const parsed = safeJsonParse(normalized);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  }

  return null;
}

function normalizeGeneratedFieldText(value) {
  const source = normalizePlainText(value);
  if (!source) return '';

  let text = source
    .replace(/^```(?:json|javascript|js)?/i, '')
    .replace(/```$/i, '')
    .trim();

  if (text.startsWith('{') && /"(source_summary|platform_outputs|core_message)"/i.test(text)) {
    return '';
  }
  if (/^`{3,}/.test(text)) {
    text = text.replace(/^`+|`+$/g, '').trim();
  }
  if (text === '{}' || text === '[]') return '';
  return text;
}

function hasUsablePlatformOutput(platformId, payload) {
  if (!payload || typeof payload !== 'object') return false;

  const hasText = (value, min = 24) => normalizeGeneratedFieldText(value).length >= min;
  const hasArrayText = (value, minItems = 1, minLen = 16) =>
    Array.isArray(value) &&
    value.filter((item) => normalizeGeneratedFieldText(String(item || '')).length >= minLen).length >= minItems;

  if (platformId === 'tiktok') {
    return hasText(payload.script, 80) || (hasText(payload.hook, 20) && hasArrayText(payload.shotList, 2, 8));
  }
  if (platformId === 'x') {
    return hasText(payload.post, 40) || hasArrayText(payload.thread, 2, 20);
  }
  if (platformId === 'threads') {
    return hasText(payload.post, 40);
  }
  if (platformId === 'instagram') {
    return hasArrayText(payload.carouselSlides, 3, 20) || hasText(payload.caption, 60);
  }
  return Object.values(payload).some((field) => {
    if (Array.isArray(field)) return hasArrayText(field);
    return hasText(field, 20);
  });
}

function normalizeCrossPlatformOutput(parsedPayload, requestedPlatforms) {
  const parsed = parsedPayload && typeof parsedPayload === 'object' ? parsedPayload : {};
  const platformRootCandidate =
    parsed.platform_outputs ||
    parsed.platformOutputs ||
    parsed.platform_output ||
    parsed.platforms ||
    parsed.outputs ||
    {};
  const hasTopLevelPlatforms =
    parsed.tiktok || parsed.tikTok || parsed.tik_tok ||
    parsed.x || parsed.twitter ||
    parsed.threads || parsed.threads_post ||
    parsed.instagram || parsed.ig;
  const platformRoot = platformRootCandidate && typeof platformRootCandidate === 'object' ? platformRootCandidate : {};
  const fallbackRoot = hasTopLevelPlatforms ? parsed : {};
  const normalizedPlatforms = {};
  const targets = Array.isArray(requestedPlatforms) ? requestedPlatforms : [];

  if (targets.includes('tiktok')) {
    const tiktok = getObjectByAliases(
      { ...fallbackRoot, ...platformRoot },
      ['tiktok', 'tikTok', 'tik_tok', 'tikTokOutput', 'tiktok_output']
    );
    normalizedPlatforms.tiktok = {
      angle: normalizeGeneratedFieldText(toStringValue(tiktok.angle || tiktok.content_angle || tiktok.angle_strategy || tiktok.story_angle)),
      hook: normalizeGeneratedFieldText(toStringValue(tiktok.hook || tiktok.opening_hook || tiktok.scroll_hook || tiktok.opening)),
      script: normalizeGeneratedFieldText(toStringValue(tiktok.script || tiktok.voiceover || tiktok.text || tiktok.main_body || tiktok.body)),
      shotList: toStringArray(tiktok.shot_list || tiktok.shotList || tiktok.scenes || tiktok.b_roll_ideas, 10),
      caption: normalizeGeneratedFieldText(toStringValue(tiktok.caption)),
      hashtags: toHashtagArray(tiktok.hashtags, 10),
      bestPostingWindow: normalizeGeneratedFieldText(toStringValue(tiktok.best_posting_window || tiktok.posting_window || tiktok.best_time))
    };
  }

  if (targets.includes('x')) {
    const x = getObjectByAliases(
      { ...fallbackRoot, ...platformRoot },
      ['x', 'twitter', 'tweet', 'x_output', 'twitter_output']
    );
    normalizedPlatforms.x = {
      post: normalizeGeneratedFieldText(toStringValue(x.post || x.tweet || x.summary_post || x.text || x.main_post)),
      thread: toStringArray(x.thread || x.thread_posts || x.posts, 8),
      hashtags: toHashtagArray(x.hashtags, 8),
      bestPostingWindow: normalizeGeneratedFieldText(toStringValue(x.best_posting_window || x.posting_window || x.best_time))
    };
  }

  if (targets.includes('threads')) {
    const threads = getObjectByAliases(
      { ...fallbackRoot, ...platformRoot },
      ['threads', 'meta_threads', 'thread_social', 'threads_output']
    );
    normalizedPlatforms.threads = {
      post: normalizeGeneratedFieldText(toStringValue(threads.post || threads.thread || threads.text || threads.main_post)),
      hook: normalizeGeneratedFieldText(toStringValue(threads.hook || threads.opening)),
      cta: normalizeGeneratedFieldText(toStringValue(threads.cta)),
      hashtags: toHashtagArray(threads.hashtags, 8),
      bestPostingWindow: normalizeGeneratedFieldText(toStringValue(threads.best_posting_window || threads.posting_window || threads.best_time))
    };
  }

  if (targets.includes('instagram')) {
    const instagram = getObjectByAliases(
      { ...fallbackRoot, ...platformRoot },
      ['instagram', 'ig', 'instagram_output']
    );
    normalizedPlatforms.instagram = {
      carouselSlides: toSlideArray(
        instagram.carousel_slides || instagram.carouselSlides || instagram.slides || instagram.carousel,
        10
      ),
      caption: normalizeGeneratedFieldText(toStringValue(instagram.caption || instagram.post)),
      visualBrief: normalizeGeneratedFieldText(toStringValue(
        instagram.graphic_brief || instagram.visual_brief || instagram.design_direction || instagram.visual_direction
      )),
      reelHook: normalizeGeneratedFieldText(toStringValue(instagram.reel_hook || instagram.hook)),
      hashtags: toHashtagArray(instagram.hashtags, 12),
      bestPostingWindow: normalizeGeneratedFieldText(toStringValue(instagram.best_posting_window || instagram.posting_window || instagram.best_time))
    };
  }

  return {
    sourceSummary: normalizeGeneratedFieldText(toStringValue(parsed.source_summary || parsed.article_summary || parsed.summary || parsed.sourceSummary)),
    coreMessage: normalizeGeneratedFieldText(toStringValue(parsed.core_message || parsed.key_message || parsed.main_message || parsed.coreMessage)),
    platformOutputs: normalizedPlatforms,
    repurposingNotes: toStringArray(parsed.repurposing_notes || parsed.optimization_notes || parsed.notes, 10)
  };
}

function scoreTextQuality(value) {
  const text = normalizePlainText(value);
  if (!text) return 0;
  if (text.length >= 280) return 90;
  if (text.length >= 180) return 70;
  if (text.length >= 100) return 50;
  if (text.length >= 50) return 30;
  return 10;
}

function scoreArrayQuality(value) {
  if (!Array.isArray(value) || value.length === 0) return 0;
  return Math.min(90, value.reduce((sum, item) => sum + scoreTextQuality(String(item || '')), 0));
}

function scoreRepurposeOutput(output, requestedPlatforms) {
  const normalized = output && typeof output === 'object' ? output : {};
  const platformOutputs = normalized.platformOutputs && typeof normalized.platformOutputs === 'object'
    ? normalized.platformOutputs
    : {};

  let score = 0;
  score += scoreTextQuality(normalized.sourceSummary);
  score += scoreTextQuality(normalized.coreMessage);
  score += scoreArrayQuality(normalized.repurposingNotes);

  for (const platform of requestedPlatforms || []) {
    const payload = platformOutputs[platform];
    if (!payload || typeof payload !== 'object') continue;

    if (platform === 'tiktok') {
      score += scoreTextQuality(payload.hook);
      score += scoreTextQuality(payload.script);
      score += scoreArrayQuality(payload.shotList);
      score += scoreTextQuality(payload.caption);
    } else if (platform === 'x') {
      score += scoreTextQuality(payload.post);
      score += scoreArrayQuality(payload.thread);
    } else if (platform === 'threads') {
      score += scoreTextQuality(payload.post);
      score += scoreTextQuality(payload.hook);
      score += scoreTextQuality(payload.cta);
    } else if (platform === 'instagram') {
      score += scoreArrayQuality(payload.carouselSlides);
      score += scoreTextQuality(payload.caption);
      score += scoreTextQuality(payload.visualBrief);
    }

    score += scoreArrayQuality(payload.hashtags);
    score += scoreTextQuality(payload.bestPostingWindow);
  }

  return score;
}

function buildCrossPlatformRepairPrompt({
  sourceUrl,
  sourceTitle,
  sourceDescription,
  sourceText,
  requestedPlatforms,
  outputLanguage,
  brandVoice,
  targetAudience,
  objective,
  cta,
  draftOutput
}) {
  const languageInstruction = outputLanguage === 'th'
    ? 'ใช้ภาษาไทยทั้งหมด'
    : outputLanguage === 'en'
      ? 'Use English for all outputs.'
      : 'ใช้ภาษาให้สอดคล้องกับบทความต้นฉบับ';

  const schemaTemplates = {
    tiktok: `"tiktok": {
      "angle": "แนวทางเล่าเรื่อง",
      "hook": "ประโยคเปิด",
      "script": "สคริปต์แบบพร้อมอ่าน",
      "shot_list": ["ช็อตที่ 1", "ช็อตที่ 2"],
      "caption": "แคปชัน",
      "hashtags": ["#example"],
      "best_posting_window": "ช่วงเวลาที่แนะนำ"
    }`,
    x: `"x": {
      "post": "โพสต์หลัก",
      "thread": ["โพสต์ย่อย 1", "โพสต์ย่อย 2"],
      "hashtags": ["#example"],
      "best_posting_window": "ช่วงเวลาที่แนะนำ"
    }`,
    threads: `"threads": {
      "post": "โพสต์หลัก",
      "hook": "ประโยคเปิด",
      "cta": "คำกระตุ้นให้มีส่วนร่วม",
      "hashtags": ["#example"],
      "best_posting_window": "ช่วงเวลาที่แนะนำ"
    }`,
    instagram: `"instagram": {
      "carousel_slides": [
        { "title": "สไลด์ 1", "body": "รายละเอียด" }
      ],
      "caption": "แคปชัน",
      "graphic_brief": "แนวภาพ/กราฟิก",
      "reel_hook": "hook สำหรับ reel",
      "hashtags": ["#example"],
      "best_posting_window": "ช่วงเวลาที่แนะนำ"
    }`
  };

  const selectedSchemas = (requestedPlatforms || []).map((id) => schemaTemplates[id]).filter(Boolean).join(',\n      ');
  const contextLines = [];
  if (brandVoice) contextLines.push(`- Brand voice: ${brandVoice}`);
  if (targetAudience) contextLines.push(`- Target audience: ${targetAudience}`);
  if (objective) contextLines.push(`- Campaign objective: ${objective}`);
  if (cta) contextLines.push(`- Preferred CTA: ${cta}`);

  return `คุณคือ Senior Cross-Platform Content Strategist และ Data Quality Editor

งาน: ซ่อมและปรับปรุงผลลัพธ์ให้เป็น JSON schema ที่ถูกต้อง ครบทุกแพลตฟอร์ม และยึดข้อมูลจาก source เท่านั้น

ข้อกำหนดบังคับ:
1) ${languageInstruction}
2) ห้ามใส่ข้อมูลที่ไม่มีใน source (ถ้าไม่พบ ให้ใช้ข้อความที่อนุรักษ์นิยมและไม่กล่าวเกินจริง)
3) ตอบเป็น JSON object เท่านั้น ห้ามใส่ markdown/code fence
4) แต่ละแพลตฟอร์มต้องมีข้อความที่นำไปใช้งานได้จริง ไม่ใช่ placeholder
5) ถ้า draft เดิมไม่ครบ ให้เติมจาก source

บริบท:
${contextLines.length > 0 ? contextLines.join('\n') : '- ไม่มีบริบทเสริม'}

Source URL: ${sourceUrl}
Source Title: ${sourceTitle || 'N/A'}
Source Description: ${sourceDescription || 'N/A'}

Source Content:
"""${String(sourceText || '').slice(0, 14000)}"""

Draft output to repair:
"""${String(draftOutput || '').slice(0, 14000)}"""

ตอบกลับตาม schema นี้:
{
  "source_summary": "สรุปบทความ 2-3 ประโยค",
  "core_message": "สารหลักที่ต้องคงไว้ 1 ประโยค",
  "platform_outputs": {
      ${selectedSchemas}
  },
  "repurposing_notes": [
    "คำแนะนำเชิงกลยุทธ์ 1",
    "คำแนะนำเชิงกลยุทธ์ 2"
  ]
}`;
}

function buildMissingPlatformsCompletionPrompt({
  sourceUrl,
  sourceTitle,
  sourceDescription,
  sourceText,
  outputLanguage,
  brandVoice,
  targetAudience,
  objective,
  cta,
  missingPlatforms,
  currentOutput
}) {
  const languageInstruction = outputLanguage === 'th'
    ? 'ใช้ภาษาไทยทั้งหมด'
    : outputLanguage === 'en'
      ? 'Use English for all outputs.'
      : 'ใช้ภาษาให้สอดคล้องกับบทความต้นฉบับ';

  const schemaTemplates = {
    tiktok: `"tiktok": {
      "angle": "แนวทางเล่าเรื่อง",
      "hook": "ประโยคเปิด",
      "script": "สคริปต์แบบพร้อมอ่าน",
      "shot_list": ["ช็อตที่ 1", "ช็อตที่ 2"],
      "caption": "แคปชัน",
      "hashtags": ["#example"],
      "best_posting_window": "ช่วงเวลาที่แนะนำ"
    }`,
    x: `"x": {
      "post": "โพสต์หลัก",
      "thread": ["โพสต์ย่อย 1", "โพสต์ย่อย 2"],
      "hashtags": ["#example"],
      "best_posting_window": "ช่วงเวลาที่แนะนำ"
    }`,
    threads: `"threads": {
      "post": "โพสต์หลัก",
      "hook": "ประโยคเปิด",
      "cta": "คำกระตุ้นให้มีส่วนร่วม",
      "hashtags": ["#example"],
      "best_posting_window": "ช่วงเวลาที่แนะนำ"
    }`,
    instagram: `"instagram": {
      "carousel_slides": [
        { "title": "สไลด์ 1", "body": "รายละเอียด" }
      ],
      "caption": "แคปชัน",
      "graphic_brief": "แนวภาพ/กราฟิก",
      "reel_hook": "hook สำหรับ reel",
      "hashtags": ["#example"],
      "best_posting_window": "ช่วงเวลาที่แนะนำ"
    }`
  };

  const contextLines = [];
  if (brandVoice) contextLines.push(`- Brand voice: ${brandVoice}`);
  if (targetAudience) contextLines.push(`- Target audience: ${targetAudience}`);
  if (objective) contextLines.push(`- Campaign objective: ${objective}`);
  if (cta) contextLines.push(`- Preferred CTA: ${cta}`);

  const schemaText = (missingPlatforms || []).map((id) => schemaTemplates[id]).filter(Boolean).join(',\n      ');

  return `คุณคือ Senior Cross-Platform Content Strategist

งาน: เติมเฉพาะแพลตฟอร์มที่ยังขาดให้ครบ โดยอิงข้อมูลจาก source เท่านั้น

ข้อกำหนด:
1) ${languageInstruction}
2) ห้ามบิดเบือนข้อเท็จจริง
3) ห้ามส่ง markdown/code fence
4) ตอบกลับเป็น JSON object ตาม schema ที่กำหนดเท่านั้น
5) ทุก platform ที่ถูกขอ ต้องมีข้อความใช้งานได้จริง (ไม่ใช่ placeholder)

บริบท:
${contextLines.length > 0 ? contextLines.join('\n') : '- ไม่มีบริบทเสริม'}

Platforms to fill:
${(missingPlatforms || []).join(', ')}

Current output:
"""${String(currentOutput || '').slice(0, 12000)}"""

Source URL: ${sourceUrl}
Source Title: ${sourceTitle || 'N/A'}
Source Description: ${sourceDescription || 'N/A'}

Source Content:
"""${String(sourceText || '').slice(0, 12000)}"""

ตอบกลับตาม schema นี้:
{
  "platform_outputs": {
      ${schemaText}
  }
}`;
}

function buildDeterministicPlatformFallback(platformId, normalizedOutput, sourceData) {
  const sourceSummary = normalizePlainText(
    normalizedOutput?.sourceSummary ||
    [sourceData?.title, sourceData?.description, String(sourceData?.text || '').slice(0, 500)].filter(Boolean).join('\n')
  );
  const core = normalizePlainText(normalizedOutput?.coreMessage || sourceSummary.split(/[\n.!?]/).filter(Boolean)[0] || sourceSummary);

  const keySentences = sourceSummary
    .split(/[\n.!?]/)
    .map((line) => normalizePlainText(line))
    .filter((line) => line.length >= 24)
    .slice(0, 6);

  if (platformId === 'tiktok') {
    return {
      angle: core || 'สรุปประเด็นสำคัญจากข่าวแบบเข้าใจง่าย',
      hook: core ? `${core}` : 'สรุปข่าวนี้ใน 45 วินาที',
      script: keySentences.join('\n') || sourceSummary,
      shotList: ['เปิดด้วยประเด็นหลัก 1 ประโยค', 'แสดงข้อมูลสำคัญ/ตัวเลข', 'ปิดด้วยข้อคิดหรือผลกระทบ'],
      caption: core || sourceSummary.slice(0, 180),
      hashtags: ['#ข่าว', '#สรุปข่าว'],
      bestPostingWindow: ''
    };
  }

  if (platformId === 'x') {
    return {
      post: core || sourceSummary.slice(0, 240),
      thread: keySentences.slice(0, 4),
      hashtags: ['#ข่าว', '#เศรษฐกิจ'],
      bestPostingWindow: ''
    };
  }

  if (platformId === 'threads') {
    return {
      post: sourceSummary.slice(0, 520),
      hook: core,
      cta: 'คุณมองประเด็นนี้อย่างไร?',
      hashtags: ['#ข่าว', '#ประเด็นร้อน'],
      bestPostingWindow: ''
    };
  }

  if (platformId === 'instagram') {
    const slides = keySentences.slice(0, 5).map((line, idx) => ({
      title: `สไลด์ ${idx + 1}`,
      body: line
    }));
    return {
      carouselSlides: slides,
      caption: sourceSummary.slice(0, 800),
      visualBrief: 'โทนข่าวเชิงข้อมูล อ่านง่าย ใช้ key number และ keyword เด่น',
      reelHook: core,
      hashtags: ['#ข่าว', '#สรุปข่าว', '#อัปเดต'],
      bestPostingWindow: ''
    };
  }

  return {};
}

function trimToLength(text, maxLength) {
  const value = normalizeGeneratedFieldText(text);
  if (!value) return '';
  if (!Number.isFinite(maxLength) || maxLength <= 0) return value;
  if (value.length <= maxLength) return value;

  const sliced = value.slice(0, maxLength);
  const lastBreak = Math.max(sliced.lastIndexOf('\n'), sliced.lastIndexOf('.'), sliced.lastIndexOf(' '));
  if (lastBreak > Math.floor(maxLength * 0.55)) {
    return sliced.slice(0, lastBreak).trim();
  }
  return sliced.trim();
}

function normalizeHashtags(value, limit = 8) {
  const raw = toHashtagArray(value, limit * 2);
  const seen = new Set();
  const out = [];
  for (const tag of raw) {
    const normalized = tag.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(tag);
    if (out.length >= limit) break;
  }
  return out;
}

function diversifyRepeatedField(primary, fallback, label) {
  const p = normalizeGeneratedFieldText(primary);
  const f = normalizeGeneratedFieldText(fallback);
  if (!p) return f;
  if (!f) return p;

  const pNorm = p.toLowerCase().replace(/\s+/g, ' ').trim();
  const fNorm = f.toLowerCase().replace(/\s+/g, ' ').trim();
  if (pNorm === fNorm) {
    if (label === 'hook') {
      return `${p.split(/[.!?]/)[0] || p} ลองมาดูประเด็นสำคัญแบบสั้น ๆ`;
    }
    if (label === 'caption') {
      return `${p}\n\nสรุปสั้น: ประเด็นหลักและผลกระทบที่ควรรู้`;
    }
    return `${p}\n\n(ขยายรายละเอียดต่อจากประเด็นหลัก)`;
  }
  return p;
}

function sanitizePlatformPayload(platformId, payload, sourceSummary, coreMessage) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const summarySeed = normalizeGeneratedFieldText(sourceSummary);
  const coreSeed = normalizeGeneratedFieldText(coreMessage) || summarySeed;

  if (platformId === 'tiktok') {
    const hook = trimToLength(diversifyRepeatedField(source.hook, coreSeed, 'hook'), 120);
    const angle = trimToLength(diversifyRepeatedField(source.angle, coreSeed, 'angle'), 180);
    const script = trimToLength(source.script || summarySeed, 1200);
    const caption = trimToLength(diversifyRepeatedField(source.caption, summarySeed, 'caption'), 280);
    const shotList = toStringArray(source.shotList || source.shot_list || [], 6)
      .map((item) => trimToLength(item, 120))
      .filter(Boolean);
    return {
      angle,
      hook,
      script,
      shotList,
      caption,
      hashtags: normalizeHashtags(source.hashtags, 6),
      bestPostingWindow: trimToLength(source.bestPostingWindow || source.best_posting_window || '', 80)
    };
  }

  if (platformId === 'x') {
    const post = trimToLength(source.post || coreSeed, 260);
    const thread = toStringArray(source.thread || source.posts || [], 5)
      .map((item) => trimToLength(item, 260))
      .filter(Boolean);
    return {
      post,
      thread,
      hashtags: normalizeHashtags(source.hashtags, 5),
      bestPostingWindow: trimToLength(source.bestPostingWindow || source.best_posting_window || '', 80)
    };
  }

  if (platformId === 'threads') {
    const hook = trimToLength(diversifyRepeatedField(source.hook, coreSeed, 'hook'), 140);
    const post = trimToLength(source.post || summarySeed, 700);
    const cta = trimToLength(source.cta || 'คุณคิดเห็นอย่างไรกับประเด็นนี้?', 120);
    return {
      hook,
      post,
      cta,
      hashtags: normalizeHashtags(source.hashtags, 6),
      bestPostingWindow: trimToLength(source.bestPostingWindow || source.best_posting_window || '', 80)
    };
  }

  if (platformId === 'instagram') {
    const caption = trimToLength(source.caption || summarySeed, 1000);
    const reelHook = trimToLength(diversifyRepeatedField(source.reelHook || source.reel_hook, coreSeed, 'hook'), 140);
    const visualBrief = trimToLength(source.visualBrief || source.graphic_brief || 'โทนข้อมูลชัด อ่านง่าย เน้น insight หลัก', 220);
    const rawSlides = Array.isArray(source.carouselSlides || source.carousel_slides) ? (source.carouselSlides || source.carousel_slides) : [];
    const carouselSlides = toSlideArray(rawSlides, 6).map((slide, idx) => ({
      title: trimToLength(slide.title || `Slide ${idx + 1}`, 60),
      body: trimToLength(slide.body || '', 220)
    })).filter((slide) => slide.body);
    return {
      caption,
      visualBrief,
      reelHook,
      hashtags: normalizeHashtags(source.hashtags, 8),
      bestPostingWindow: trimToLength(source.bestPostingWindow || source.best_posting_window || '', 80),
      carouselSlides
    };
  }

  return source;
}

function enforceRepurposeOutputQuality(output, requestedPlatforms) {
  const normalized = output && typeof output === 'object' ? output : {};
  const targets = Array.isArray(requestedPlatforms) ? requestedPlatforms : [];
  const next = {
    sourceSummary: trimToLength(normalized.sourceSummary || '', 700),
    coreMessage: trimToLength(normalized.coreMessage || '', 220),
    platformOutputs: {},
    repurposingNotes: toStringArray(normalized.repurposingNotes || [], 6)
      .map((item) => trimToLength(item, 180))
      .filter(Boolean)
  };

  for (const platformId of targets) {
    next.platformOutputs[platformId] = sanitizePlatformPayload(
      platformId,
      normalized.platformOutputs?.[platformId],
      next.sourceSummary,
      next.coreMessage
    );
  }

  // Cross-platform dedupe for common fields.
  const used = new Set();
  for (const platformId of targets) {
    const payload = next.platformOutputs?.[platformId];
    if (!payload || typeof payload !== 'object') continue;

    for (const field of ['hook', 'caption', 'post', 'reelHook']) {
      const value = normalizeGeneratedFieldText(payload[field]);
      if (!value) continue;
      const norm = value.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!used.has(norm)) {
        used.add(norm);
        continue;
      }

      const seed = next.coreMessage || next.sourceSummary;
      const diversified = diversifyRepeatedField(value, `${seed} (${platformId})`, field);
      payload[field] = trimToLength(diversified, field === 'post' ? 260 : 180);
      used.add(normalizeGeneratedFieldText(payload[field]).toLowerCase().replace(/\s+/g, ' ').trim());
    }
  }

  if (next.repurposingNotes.length === 0) {
    next.repurposingNotes = [
      'ตรวจข้อเท็จจริงตัวเลข/ชื่อเฉพาะก่อนโพสต์',
      'ทดสอบ 2 hook ต่อแพลตฟอร์มเพื่อเลือกเวอร์ชันที่ engagement สูงกว่า'
    ];
  }

  return next;
}

function buildCrossPlatformRepurposePrompt({
  sourceUrl,
  sourceTitle,
  sourceDescription,
  sourceText,
  requestedPlatforms,
  outputLanguage,
  brandVoice,
  targetAudience,
  objective,
  cta
}) {
  const languageInstruction = outputLanguage === 'th'
    ? 'ใช้ภาษาไทยทั้งหมด'
    : outputLanguage === 'en'
      ? 'Use English for all outputs.'
      : 'ใช้ภาษาให้สอดคล้องกับบทความต้นฉบับ';

  const platformGuides = {
    tiktok: '- TikTok: โทนเร็ว Hook ใน 1-2 วินาที, script 30-45 วินาที, มี shot list ที่ถ่ายทำได้จริง',
    x: '- X (Twitter): post หลักต้องกระชับทรงพลัง และ optional thread 3-5 ทวีตสำหรับขยายประเด็น',
    threads: '- Threads: โทนบทสนทนาเป็นกันเอง แต่ยังมีมุมเชิงลึกและชวนคอมเมนต์',
    instagram: '- Instagram: วางโครง carousel 5-8 สไลด์ + caption + visual brief สำหรับทีมออกแบบ'
  };

  const jsonTemplates = {
    tiktok: `"tiktok": {
        "angle": "แนวทางเล่าเรื่อง",
        "hook": "ประโยคเปิด",
        "script": "สคริปต์แบบพร้อมอ่าน",
        "shot_list": ["ช็อตที่ 1", "ช็อตที่ 2"],
        "caption": "แคปชัน",
        "hashtags": ["#example"],
        "best_posting_window": "ช่วงเวลาที่แนะนำ"
      }`,
    x: `"x": {
        "post": "โพสต์หลัก",
        "thread": ["โพสต์ย่อย 1", "โพสต์ย่อย 2"],
        "hashtags": ["#example"],
        "best_posting_window": "ช่วงเวลาที่แนะนำ"
      }`,
    threads: `"threads": {
        "post": "โพสต์หลัก",
        "hook": "ประโยคเปิด",
        "cta": "คำกระตุ้นให้มีส่วนร่วม",
        "hashtags": ["#example"],
        "best_posting_window": "ช่วงเวลาที่แนะนำ"
      }`,
    instagram: `"instagram": {
        "carousel_slides": [
          { "title": "สไลด์ 1", "body": "รายละเอียด" }
        ],
        "caption": "แคปชัน",
        "graphic_brief": "แนวภาพ/กราฟิก",
        "reel_hook": "hook สำหรับ reel",
        "hashtags": ["#example"],
        "best_posting_window": "ช่วงเวลาที่แนะนำ"
      }`
  };

  const contextLines = [];
  if (brandVoice) contextLines.push(`- Brand voice: ${brandVoice}`);
  if (targetAudience) contextLines.push(`- Target audience: ${targetAudience}`);
  if (objective) contextLines.push(`- Campaign objective: ${objective}`);
  if (cta) contextLines.push(`- Preferred CTA: ${cta}`);

  const platformInstructionText = requestedPlatforms.map((id) => platformGuides[id]).filter(Boolean).join('\n');
  const platformSchemaText = requestedPlatforms.map((id) => jsonTemplates[id]).filter(Boolean).join(',\n      ');

  return `คุณคือ Senior Cross-Platform Content Strategist ที่ชำนาญการดัดแปลงคอนเทนต์ให้เหมาะกับ Algorithm และวัฒนธรรมของแต่ละแพลตฟอร์ม

งานของคุณคืออ่านบทความต้นฉบับ แล้วแตกหน่อเป็นหลายรูปแบบคอนเทนต์ตามแพลตฟอร์มเป้าหมาย โดยห้ามบิดเบือนข้อเท็จจริง

ข้อกำหนดสำคัญ:
1) ${languageInstruction}
2) รักษาแก่นสารสำคัญของบทความไว้
3) เนื้อหาของแต่ละแพลตฟอร์มต้องโทนต่างกันชัดเจน
4) หลีกเลี่ยงคำพูดกว้างเกินจริงหรือ claim ที่ตรวจสอบไม่ได้
5) ตอบกลับเป็น JSON object อย่างเดียว ห้ามใส่ Markdown code fence
6) ห้ามใช้ placeholder เช่น "ใส่ข้อความ...", "..." หรือข้อความคลุมเครือที่เอาไปใช้จริงไม่ได้
7) ถ้า source ไม่มีข้อมูลพอสำหรับจุดใด ให้ใส่ข้อความแบบอนุรักษ์นิยมและไม่กล่าวเกินจริง

Platform Guidelines:
${platformInstructionText}

บริบทเพิ่มเติม:
${contextLines.length > 0 ? contextLines.join('\n') : '- ไม่มีบริบทเสริม'}

Source URL: ${sourceUrl}
Source Title: ${sourceTitle || 'N/A'}
Source Description: ${sourceDescription || 'N/A'}

Source Content:
"""${sourceText.slice(0, 14000)}"""

ตอบกลับตาม schema นี้:
{
  "source_summary": "สรุปบทความ 2-3 ประโยค",
  "core_message": "สารหลักที่ต้องคงไว้ 1 ประโยค",
  "platform_outputs": {
      ${platformSchemaText}
  },
  "repurposing_notes": [
    "คำแนะนำเชิงกลยุทธ์ 1",
    "คำแนะนำเชิงกลยุทธ์ 2"
  ]
}`;
}

async function summarizeTranscriptWithProvider({
  provider,
  model,
  apiKey,
  transcript,
  style,
  language
}) {
  const summaryStyle = typeof style === 'string' && style.trim() ? style.trim() : 'bullet';
  const summaryLanguage = typeof language === 'string' && language.trim() ? language.trim() : 'th';
  const chunks = chunkLongText(transcript, 10000);
  const styleKey = summaryStyle.toLowerCase();
  const styleGuidelines = {
    bullet: 'สรุปแบบ Bullet Points ที่ละเอียด: มีหัวข้อหลัก และมี bullet ย่อยอธิบายบริบท/เหตุผล/ผลลัพธ์ของแต่ละหัวข้อ',
    tldr: 'เริ่มด้วย TL;DR 5-8 บรรทัด แล้วตามด้วยรายละเอียดเชิงลึกเป็นหัวข้อย่อย',
    chapter: 'จัดรูปแบบเป็น Chapter/Section ตามประเด็น พร้อมรายละเอียดของแต่ละ Chapter อย่างครบถ้วน',
    action: 'สรุปเป็น Action Items ที่ชัดเจน โดยระบุ สิ่งที่ต้องทำ เหตุผล ผลลัพธ์ที่คาดหวัง และลำดับความสำคัญ'
  };
  const styleGuideline = styleGuidelines[styleKey] || styleGuidelines.bullet;

  const commonRules = `
ข้อกำหนดสำคัญ:
- ต้องอิงจาก transcript เท่านั้น ห้ามเติมข้อมูลที่ไม่ได้อยู่ในต้นฉบับ
- เน้น "ครอบคลุมและละเอียด" มากกว่าความสั้น
- เก็บชื่อเฉพาะ ตัวเลข วันที่ ขั้นตอน เครื่องมือ และผลลัพธ์สำคัญให้ครบถ้วน
- ถ้าข้อมูลบางส่วนไม่ชัดเจน/ฟังไม่ออก ให้ระบุว่า "ข้อมูลไม่ชัดเจน" ในจุดนั้น
- โครงสร้างต้องอ่านง่าย มีหัวข้อชัดเจน และมีรายละเอียดรองรับทุกหัวข้อหลัก
- ห้ามขึ้นต้นด้วยข้อความเกริ่น เช่น "นี่คือสรุป..." หรือเส้นคั่น "---"
- ตอบเป็นเนื้อหาสรุปทันที โดยไม่อธิบายกระบวนการของตัวเอง
`;

  const chunkPrompt = (chunk, index, total) => `คุณคือผู้ช่วยสรุปเนื้อหาแบบละเอียด
ภาษาเป้าหมาย: ${summaryLanguage === 'th' ? 'ภาษาไทย' : summaryLanguage}
รูปแบบสรุป: ${summaryStyle}
แนวทางรูปแบบ: ${styleGuideline}
${commonRules}

งานของคุณ:
1) สรุป transcript ส่วนที่ ${index + 1}/${total} ให้ละเอียดและครอบคลุม
2) ต้องมี "หัวข้อหลัก" และ "รายละเอียดเชิงลึก" ของแต่ละหัวข้อ
3) อย่าละทิ้งประเด็นย่อยที่สำคัญ

Transcript:
${chunk}`;

  const finalPrompt = (partials) => `คุณคือผู้ช่วยสรุปเนื้อหาแบบละเอียดขั้นสุดท้าย
ภาษาเป้าหมาย: ${summaryLanguage === 'th' ? 'ภาษาไทย' : summaryLanguage}
รูปแบบสรุป: ${summaryStyle}
แนวทางรูปแบบ: ${styleGuideline}
${commonRules}

งานของคุณ:
1) รวม partial summaries ทุกส่วนให้เป็นสรุปเดียวที่ครบถ้วน
2) ห้ามทำให้เนื้อหาสั้นลงจนเสียสาระสำคัญ
3) จัดหัวข้อให้เป็นระบบ และคงรายละเอียดของแต่ละประเด็นไว้
4) ต้องมีอย่างน้อย 4 ส่วนนี้:
   - ภาพรวม
   - รายละเอียดรายประเด็น
   - ข้อมูลสำคัญ (ชื่อ/ตัวเลข/คำสำคัญ)
   - ข้อสรุปหรือสิ่งที่นำไปใช้ได้

Partial summaries:
${partials.map((item, index) => `[ส่วนที่ ${index + 1}]\n${item}`).join('\n\n')}`;

  const callGemini = async (prompt, maxTokens = 2800) => {
    const generated = await generateTextWithProvider({
      provider: 'gemini',
      model,
      apiKey,
      prompt,
      temperature: 0.2,
      topP: 0.9,
      maxTokens,
      timeoutMs: 180000
    });
    return generated.text || '';
  };

  const callOpenAiCompatible = async (prompt, maxTokens = 2800) => {
    const baseUrl = resolveProviderBaseUrl(provider);
    const response = await axios.post(`${baseUrl}/chat/completions`, {
      model: model.trim(),
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: maxTokens,
      stream: false
    }, {
      headers: buildProviderHeaders(provider, apiKey),
      timeout: 180000
    });
    return pickTextFromOpenAiResponse(response.data);
  };

  const callSummary = async (prompt, maxTokens) => {
    if (provider === 'gemini') return callGemini(prompt, maxTokens);
    return callOpenAiCompatible(prompt, maxTokens);
  };

  const partials = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const partial = await callSummary(chunkPrompt(chunks[index], index, chunks.length), 3000);
    if (partial && partial.trim()) {
      partials.push(partial.trim());
    }
  }

  // For a single chunk, avoid an extra condensation pass that can lose details.
  if (chunks.length === 1 && partials.length === 1) {
    return {
      summary: sanitizeSummaryOutput(partials[0]),
      chunks: chunks.length,
      partials
    };
  }

  const sourceForFinal = partials.length > 0 ? partials : chunks;
  const finalSummary = await callSummary(finalPrompt(sourceForFinal), 3800);
  return {
    summary: sanitizeSummaryOutput(finalSummary),
    chunks: chunks.length,
    partials
  };
}

async function transcribeWithOpenAiCompatibleProvider({
  provider,
  apiKey,
  model,
  fileBuffer,
  originalName,
  mimeType,
  language,
  prompt
}) {
  const baseUrl = resolveProviderBaseUrl(provider);
  const endpoints = ['/audio/transcriptions', '/audio/transcribe'];

  // Groq enforces 25 MB; OpenRouter/AIML vary – warn early when file is huge.
  const fileSizeMB = fileBuffer ? fileBuffer.length / (1024 * 1024) : 0;
  const PROVIDER_LIMITS = { groq: 25, openrouter: 25, aimlapi: 25 };
  const limitMB = PROVIDER_LIMITS[provider] || 25;
  if (fileSizeMB > limitMB) {
    const err = new Error(
      `ไฟล์เสียงมีขนาด ${fileSizeMB.toFixed(1)} MB เกินกว่าที่ ${provider} รองรับ (สูงสุด ${limitMB} MB) ` +
      'ลองใช้วิดีโอที่สั้นลง หรือติดตั้ง ffmpeg เพื่อบีบอัดก่อนส่ง'
    );
    err.response = { status: 413, data: { error: { message: err.message } } };
    throw err;
  }

  const isRetryable = (error) => {
    if (!error) return false;
    const msg = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toUpperCase();
    return msg.includes('socket hang up') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('etimedout') ||
      code === 'ECONNRESET' ||
      code === 'EPIPE' ||
      code === 'ETIMEDOUT' ||
      error?.response?.status === 429 ||
      error?.response?.status === 503;
  };

  const sendOnce = async (endpoint, responseFormat) => {
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: originalName || 'upload.wav',
      contentType: mimeType || 'application/octet-stream'
    });
    form.append('model', model);
    if (language) form.append('language', language);
    if (prompt) form.append('prompt', prompt);
    if (responseFormat) form.append('response_format', responseFormat);

    const headers = {
      ...buildProviderHeaders(provider, apiKey, undefined),
      ...form.getHeaders()
    };
    delete headers['Content-Type'];

    return axios.post(`${baseUrl}${endpoint}`, form, {
      headers,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 300000
    });
  };

  const sendWithRetry = async (endpoint, responseFormat, maxRetries = 2) => {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await sendOnce(endpoint, responseFormat);
      } catch (err) {
        lastErr = err;
        if (attempt < maxRetries && isRetryable(err)) {
          const delay = (attempt + 1) * 2000;
          console.warn(`[transcribe] retryable error (attempt ${attempt + 1}/${maxRetries + 1}): ${err?.message || err}`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  };

  let lastError;
  for (const endpoint of endpoints) {
    try {
      const verboseResponse = await sendWithRetry(endpoint, 'verbose_json');
      const text = pickTranscriptionText(verboseResponse.data);
      if (text) return { text, payload: verboseResponse.data };
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      if (status && status !== 404 && status !== 405) {
        try {
          const fallbackResponse = await sendWithRetry(endpoint, 'json');
          const text = pickTranscriptionText(fallbackResponse.data);
          if (text) return { text, payload: fallbackResponse.data };
        } catch (innerError) {
          lastError = innerError;
        }
      }
    }
  }

  throw lastError || new Error('Transcription failed');
}

function getPayloadError(payload) {
  const errorObject = payload?.error;
  const arrayError = Array.isArray(payload?.errors) ? payload.errors[0] : null;
  const candidate = errorObject || arrayError;
  if (!candidate) return null;

  const message =
    (typeof candidate === 'string' ? candidate : candidate?.message) ||
    payload?.message;

  if (!message) return null;

  const codeCandidate =
    typeof candidate?.code === 'number'
      ? candidate.code
      : Number.parseInt(String(candidate?.code ?? ''), 10);

  const status =
    Number.isInteger(codeCandidate) && codeCandidate >= 400 && codeCandidate <= 599
      ? codeCandidate
      : 502;

  return { status, message };
}

function throwIfPayloadError(payload) {
  const details = getPayloadError(payload);
  if (!details) return;
  const error = new Error(details.message);
  error.response = {
    status: details.status,
    data: {
      error: {
        message: details.message
      }
    }
  };
  throw error;
}

function normalizeImageSize(value) {
  if (typeof value !== 'string') return '1024x1024';
  const trimmed = value.trim();
  return /^\d{3,4}x\d{3,4}$/.test(trimmed) ? trimmed : '1024x1024';
}

function normalizeImageCount(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return 1;
  return Math.max(1, Math.min(parsed, 4));
}

function normalizeGeneratedImages(payload) {
  const collected = [];
  const dedupe = new Set();

  const pushUrl = (rawUrl, source) => {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) return;
    const url = rawUrl.trim();
    if (dedupe.has(url)) return;
    dedupe.add(url);
    collected.push({ url, source });
  };

  const pushBase64 = (rawBase64) => {
    if (typeof rawBase64 !== 'string') return;
    const normalizedBase64 = rawBase64
      .replace(/^data:[^;]+;base64,/, '')
      .replace(/\s+/g, '')
      .trim();
    if (!normalizedBase64) return;
    if (!/^[A-Za-z0-9+/=_-]+$/.test(normalizedBase64)) return;
    if (normalizedBase64.length < 200) return;
    pushUrl(`data:image/png;base64,${normalizedBase64}`, 'base64');
  };

  const pushMarkdownImageUrls = (text) => {
    if (typeof text !== 'string') return;
    const regex = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
      pushUrl(match[1], 'url');
    }
  };

  const looksLikeImageUrl = (value) => {
    if (typeof value !== 'string') return false;
    const text = value.trim().toLowerCase();
    if (!text.startsWith('http://') && !text.startsWith('https://') && !text.startsWith('data:image/')) {
      return false;
    }
    if (text.startsWith('data:image/')) return true;
    if (text.includes('/image') || text.includes('img') || text.includes('blob')) return true;
    if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/.test(text)) return true;
    return false;
  };

  const directRows = [
    ...(Array.isArray(payload?.data) ? payload.data : []),
    ...(Array.isArray(payload?.images) ? payload.images : []),
    ...(Array.isArray(payload?.output) ? payload.output : [])
  ];

  for (const row of directRows) {
    if (typeof row === 'string') {
      if (looksLikeImageUrl(row)) pushUrl(row, 'url');
      continue;
    }

    pushUrl(row?.url, 'url');
    pushUrl(row?.image_url, 'url');
    pushUrl(row?.imageUrl, 'url');
    pushUrl(row?.output_url, 'url');
    pushUrl(row?.signed_url, 'url');
    pushUrl(row?.src, 'url');
    pushUrl(row?.image?.url, 'url');
    pushUrl(row?.image_url?.url, 'url');
    pushUrl(row?.imageUrl?.url, 'url');
    pushBase64(row?.b64_json);
    pushBase64(row?.base64);
    pushBase64(row?.image_base64);
    pushBase64(row?.image?.b64_json);
    pushBase64(row?.image?.base64);
  }

  const message = payload?.choices?.[0]?.message;
  if (message) {
    const messageImages = Array.isArray(message.images) ? message.images : [];
    for (const image of messageImages) {
      pushUrl(image?.url, 'url');
      pushUrl(image?.image_url?.url, 'url');
      pushUrl(image?.imageUrl?.url, 'url');
      pushBase64(image?.b64_json);
      pushBase64(image?.base64);
    }

    if (typeof message.content === 'string') {
      pushMarkdownImageUrls(message.content);
      if (looksLikeImageUrl(message.content)) {
        pushUrl(message.content, 'url');
      }
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        pushUrl(part?.image_url?.url, 'url');
        pushUrl(part?.imageUrl?.url, 'url');
        pushUrl(part?.url, 'url');
        pushBase64(part?.b64_json);
        pushBase64(part?.base64);
        if (typeof part?.text === 'string') {
          pushMarkdownImageUrls(part.text);
          if (looksLikeImageUrl(part.text)) {
            pushUrl(part.text, 'url');
          }
        }
      }
    }
  }

  const walk = (node, parentKey = '', depth = 0) => {
    if (node == null || depth > 6) return;
    if (typeof node === 'string') {
      const lowerKey = parentKey.toLowerCase();
      if (looksLikeImageUrl(node)) {
        pushUrl(node, node.startsWith('data:image/') ? 'base64' : 'url');
        return;
      }
      if (lowerKey.includes('b64') || lowerKey.includes('base64') || lowerKey.includes('image')) {
        pushBase64(node);
      }
      pushMarkdownImageUrls(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const value of node) walk(value, parentKey, depth + 1);
      return;
    }
    if (typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        walk(value, key, depth + 1);
      }
    }
  };

  walk(payload, '', 0);

  return collected.map((item, index) => ({
    id: `img_${index + 1}`,
    url: item.url,
    source: item.source
  }));
}

function buildImagePayload({ model, prompt, size, n, negativePrompt, quality, style, seed, includeOptional }) {
  const payload = {
    model,
    prompt,
    size,
    n
  };

  if (!includeOptional) {
    return payload;
  }

  if (negativePrompt) payload.negative_prompt = negativePrompt;
  if (quality && quality !== 'auto') payload.quality = quality;
  if (style && style !== 'auto') payload.style = style;
  if (seed != null) payload.seed = seed;

  return payload;
}

function sizeToAspectRatio(size) {
  const mapping = {
    '1024x1024': '1:1',
    '1024x1536': '2:3',
    '1536x1024': '3:2',
    '1792x1024': '16:9'
  };
  return mapping[size] || '1:1';
}

function isLikelyUnsupportedImageParamError(error) {
  const status = error?.response?.status;
  if (status !== 400 && status !== 422) return false;

  const raw = error?.response?.data;
  const message = JSON.stringify(raw || '').toLowerCase();
  const patterns = [
    'unknown parameter',
    'unsupported parameter',
    'invalid parameter',
    'additional properties',
    'extra fields',
    'not allowed',
    'not supported',
    'unrecognized request argument'
  ];

  return patterns.some((pattern) => message.includes(pattern));
}

async function requestImageGeneration(baseUrl, headers, payload) {
  const endpoints = ['/images/generations', '/images'];
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = await axios.post(`${baseUrl}${endpoint}`, payload, {
        headers,
        timeout: 120000
      });
      throwIfPayloadError(response.data);
      return response;
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const message = (
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        ''
      ).toLowerCase();

      const shouldTryNextEndpoint =
        status === 404 ||
        status === 405 ||
        message.includes('not found') ||
        message.includes('unknown path') ||
        message.includes('invalid url');

      if (shouldTryNextEndpoint) {
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

function parseImageSize(size) {
  const [width, height] = String(size || '')
    .split('x')
    .map((value) => Number.parseInt(value, 10));

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { width: 1024, height: 1024 };
  }

  return { width, height };
}

function tryParseBinaryError(rawData) {
  if (!rawData) return null;
  const text = Buffer.isBuffer(rawData)
    ? rawData.toString('utf8')
    : typeof rawData === 'string'
      ? rawData
      : '';

  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.error === 'string') {
      return parsed.error;
    }
    if (parsed && typeof parsed.message === 'string') {
      return parsed.message;
    }
    if (parsed && typeof parsed.error?.message === 'string') {
      return parsed.error.message;
    }
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0]?.error === 'string') {
      return parsed[0].error;
    }
    // Fallback: return stringified if it's a short JSON object
    if (typeof parsed === 'object' && text.length < 500) {
      return text;
    }
  } catch {
    // Not JSON payload - return raw text if short enough
    if (text.length < 500) return text.trim();
  }

  return null;
}

async function requestHuggingFaceImages({
  apiKey,
  model,
  prompt,
  negativePrompt,
  size,
  n,
  quality,
  seed,
  acceptMime = 'image/png'
}) {
  const normalizedModel = String(model || '').trim().replace(/^\/+/, '');
  if (!normalizedModel) {
    const error = new Error('Model is required');
    error.response = { status: 400, data: { error: { message: error.message } } };
    throw error;
  }

  const { width, height } = parseImageSize(size);
  const images = [];

  for (let index = 0; index < n; index += 1) {
    const payload = {
      inputs: prompt,
      parameters: {
        width,
        height
      },
      options: {
        wait_for_model: true,
        use_cache: false
      }
    };

    if (negativePrompt) payload.parameters.negative_prompt = negativePrompt;
    if (seed != null) payload.parameters.seed = seed + index;
    if (quality === 'high') payload.parameters.num_inference_steps = 40;
    if (quality === 'medium') payload.parameters.num_inference_steps = 30;

    const hfBaseUrl = getHuggingFaceBaseUrl(normalizedModel);
    const response = await axios.post(
      `${hfBaseUrl}/models/${encodeURI(normalizedModel)}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: acceptMime
        },
        responseType: 'arraybuffer',
        timeout: 180000,
        validateStatus: () => true
      }
    );

    const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
    const isImageResponse = contentType.startsWith('image/');

    if (!isImageResponse) {
      const errorMessage =
        tryParseBinaryError(response.data) ||
        `Hugging Face response is not an image (content-type: ${contentType || 'unknown'})`;
      const error = new Error(errorMessage);
      error.response = {
        status: response.status || 502,
        data: {
          error: {
            message: errorMessage
          }
        }
      };
      throw error;
    }

    const binary = Buffer.from(response.data);
    const mimeType = contentType || 'image/png';
    const base64 = binary.toString('base64');
    if (!base64) continue;

    images.push({
      id: `img_${index + 1}`,
      url: `data:${mimeType};base64,${base64}`,
      source: 'base64'
    });
  }

  return images;
}

async function requestPollinationsImages({
  apiKey,
  model,
  prompt,
  negativePrompt,
  size,
  n,
  quality,
  seed
}) {
  const normalizedModel = String(model || '').trim();
  if (!normalizedModel) {
    const error = new Error('Model is required');
    error.response = { status: 400, data: { error: { message: error.message } } };
    throw error;
  }

  const { width, height } = parseImageSize(size);
  const images = [];

  for (let index = 0; index < n; index += 1) {
    const query = new URLSearchParams();
    query.set('model', normalizedModel);
    query.set('width', String(width));
    query.set('height', String(height));
    query.set('nologo', 'true');
    if (negativePrompt) query.set('negative_prompt', negativePrompt);
    if (seed != null) query.set('seed', String(seed + index));
    if (quality === 'medium' || quality === 'high') query.set('enhance', 'true');

    const requestUrl = `${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(prompt)}?${query.toString()}`;
    const response = await axios.get(requestUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'image/png, image/jpeg'
      },
      responseType: 'arraybuffer',
      timeout: 180000,
      validateStatus: () => true
    });

    const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
    const isImageResponse = contentType.startsWith('image/');
    if (!isImageResponse) {
      const errorMessage =
        tryParseBinaryError(response.data) ||
        `Pollinations response is not an image (content-type: ${contentType || 'unknown'})`;
      const error = new Error(errorMessage);
      error.response = {
        status: response.status || 502,
        data: {
          error: {
            message: errorMessage
          }
        }
      };
      throw error;
    }

    const binary = Buffer.from(response.data);
    const mimeType = contentType || 'image/jpeg';
    const base64 = binary.toString('base64');
    if (!base64) continue;

    images.push({
      id: `img_${index + 1}`,
      url: `data:${mimeType};base64,${base64}`,
      source: 'base64'
    });
  }

  return images;
}

function splitReplicateModelId(modelId) {
  const normalized = String(modelId || '').trim().replace(/^\/+|\/+$/g, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  return { owner: parts[0], name: parts[1], full: normalized };
}

function buildReplicateImageInput({
  prompt,
  size,
  negativePrompt,
  quality,
  seed
}) {
  const { width, height } = parseImageSize(size);
  const input = {
    prompt,
    width,
    height
  };

  const aspect = sizeToAspectRatio(size);
  if (aspect && aspect.includes(':')) input.aspect_ratio = aspect;
  if (negativePrompt) input.negative_prompt = negativePrompt;
  if (seed != null) input.seed = seed;
  if (quality === 'high') input.output_quality = 95;
  if (quality === 'medium') input.output_quality = 85;

  return input;
}

function collectReplicateOutputUrls(output) {
  const urls = [];
  const seen = new Set();

  const push = (value) => {
    if (typeof value !== 'string') return;
    const url = value.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:image/')) return;
    if (seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };

  const walk = (node) => {
    if (node == null) return;
    if (typeof node === 'string') {
      push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node === 'object') {
      push(node.url);
      push(node.href);
      for (const value of Object.values(node)) {
        walk(value);
      }
    }
  };

  walk(output);
  return urls;
}

async function waitReplicatePredictionResult({ apiKey, predictionId, timeoutMs = 240000 }) {
  const deadline = Date.now() + timeoutMs;
  let latestPayload = null;

  while (Date.now() < deadline) {
    const response = await axios.get(`${REPLICATE_BASE_URL}/predictions/${encodeURIComponent(predictionId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 90000
    });

    latestPayload = response.data;
    const status = String(response.data?.status || '').toLowerCase();

    if (status === 'succeeded') {
      return response.data;
    }

    if (status === 'failed' || status === 'canceled') {
      const message = response.data?.error || `Replicate prediction ${status}`;
      const error = new Error(message);
      error.response = {
        status: 502,
        data: {
          error: {
            message
          }
        }
      };
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));
  }

  const timeoutError = new Error('Replicate prediction timeout');
  timeoutError.response = {
    status: 504,
    data: {
      error: {
        message: latestPayload?.status
          ? `Replicate prediction timeout (status: ${latestPayload.status})`
          : timeoutError.message
      }
    }
  };
  throw timeoutError;
}

async function requestReplicateImages({
  apiKey,
  model,
  prompt,
  negativePrompt,
  size,
  n,
  quality,
  seed
}) {
  const parsedModel = splitReplicateModelId(model);
  if (!parsedModel) {
    const error = new Error('Replicate model ต้องอยู่ในรูปแบบ owner/name');
    error.response = { status: 400, data: { error: { message: error.message } } };
    throw error;
  }

  const images = [];
  for (let index = 0; index < n; index += 1) {
    const input = buildReplicateImageInput({
      prompt,
      size,
      negativePrompt,
      quality,
      seed: seed != null ? seed + index : null
    });

    let created;
    try {
      const response = await axios.post(
        `${REPLICATE_BASE_URL}/models/${encodeURIComponent(parsedModel.owner)}/${encodeURIComponent(parsedModel.name)}/predictions`,
        { input },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 90000
        }
      );
      created = response.data;
    } catch (firstError) {
      // Fallback for models that accept only prompt without optional image params.
      const status = firstError?.response?.status;
      const rawMessage = JSON.stringify(firstError?.response?.data || '').toLowerCase();
      const canRetryWithFallbackInput =
        (status === 400 || status === 422) &&
        (
          rawMessage.includes('invalid') ||
          rawMessage.includes('unsupported') ||
          rawMessage.includes('unknown') ||
          rawMessage.includes('additional properties') ||
          rawMessage.includes('not allowed')
        );

      if (canRetryWithFallbackInput && input && typeof input === 'object') {
        const fallbackInput = { prompt };
        if (negativePrompt) fallbackInput.negative_prompt = negativePrompt;
        if (seed != null) fallbackInput.seed = seed + index;

        const response = await axios.post(
          `${REPLICATE_BASE_URL}/models/${encodeURIComponent(parsedModel.owner)}/${encodeURIComponent(parsedModel.name)}/predictions`,
          { input: fallbackInput },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 90000
          }
        );
        created = response.data;
      } else {
        throw firstError;
      }
    }

    const predictionId = created?.id;
    if (!predictionId) {
      const error = new Error('Replicate ไม่ส่ง prediction id กลับมา');
      error.response = { status: 502, data: { error: { message: error.message } } };
      throw error;
    }

    const completed = await waitReplicatePredictionResult({
      apiKey,
      predictionId
    });

    const urls = collectReplicateOutputUrls(completed?.output);
    if (urls.length === 0) {
      const normalized = normalizeGeneratedImages(completed || {});
      if (normalized.length > 0) {
        images.push(...normalized);
      }
      continue;
    }

    for (const url of urls) {
      images.push({
        id: `img_${images.length + 1}`,
        url,
        source: 'url'
      });
    }
  }

  return images;
}

function mapImageSizeToPolloSettings(size) {
  const { width, height } = parseImageSize(size);
  let aspectRatio = '1:1';

  if (width === 1024 && height === 1536) aspectRatio = '3:4';
  else if (width === 1536 && height === 1024) aspectRatio = '4:3';
  else if (width === 1792 && height === 1024) aspectRatio = '16:9';
  else if (width > height) aspectRatio = '16:9';
  else if (height > width) aspectRatio = '9:16';

  return {
    aspectRatio,
    resolution: width >= 1536 || height >= 1536 ? '720p' : '480p'
  };
}

async function requestPolloGeneration({ apiKey, modelPath, input, webhookUrl }) {
  const normalizedModelPath = String(modelPath || '').trim().replace(/^\/+/, '');
  if (!normalizedModelPath) {
    const error = new Error('Model path is required');
    error.response = { status: 400, data: { error: { message: error.message } } };
    throw error;
  }

  const payload = { input };
  if (webhookUrl) payload.webhookUrl = webhookUrl;

  const response = await axios.post(
    `${POLLO_BASE_URL}/generation/${encodeURI(normalizedModelPath)}`,
    payload,
    {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );

  return response.data;
}

async function requestPolloTaskStatus({ apiKey, taskId }) {
  const response = await axios.get(`${POLLO_BASE_URL}/generation/${encodeURIComponent(taskId)}/status`, {
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    timeout: 45000
  });

  return response.data;
}

function quoteSqlIdentifier(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Invalid SQL identifier');
  }
  return `"${name.replace(/"/g, '""')}"`;
}

const IMAGE_HISTORY_TABLE = `${quoteSqlIdentifier(SUPABASE_DB_SCHEMA)}.${quoteSqlIdentifier('image_generations')}`;
const CONVERSATIONS_TABLE = `${quoteSqlIdentifier(SUPABASE_DB_SCHEMA)}.${quoteSqlIdentifier('conversations')}`;
const MESSAGES_TABLE = `${quoteSqlIdentifier(SUPABASE_DB_SCHEMA)}.${quoteSqlIdentifier('messages')}`;
const API_KEYS_TABLE = `${quoteSqlIdentifier(SUPABASE_DB_SCHEMA)}.${quoteSqlIdentifier('api_keys_store_v2')}`;
const PROMPT_LIBRARY_TABLE = `${quoteSqlIdentifier(SUPABASE_DB_SCHEMA)}.${quoteSqlIdentifier('prompt_library_items')}`;
const AGENT_PROFILES_TABLE = `${quoteSqlIdentifier(SUPABASE_DB_SCHEMA)}.${quoteSqlIdentifier('agent_profiles')}`;

function normalizeStorageRoot() {
  return String(SUPABASE_STORAGE_FOLDER || '').replace(/^\/+|\/+$/g, '');
}

function normalizeMediaType(value) {
  return String(value || '').toLowerCase() === 'video' ? 'video' : 'image';
}

function guessContentTypeFromUrl(url, mediaType) {
  const normalized = String(url || '').toLowerCase();
  if (normalized.startsWith('data:image/')) return normalized.slice(5, normalized.indexOf(';')) || 'image/png';
  if (normalized.startsWith('data:video/')) return normalized.slice(5, normalized.indexOf(';')) || 'video/mp4';
  if (mediaType === 'video') return 'video/mp4';
  if (normalized.includes('.jpg') || normalized.includes('.jpeg')) return 'image/jpeg';
  if (normalized.includes('.webp')) return 'image/webp';
  if (normalized.includes('.gif')) return 'image/gif';
  return 'image/png';
}

function extensionFromContentType(contentType, mediaType) {
  const normalized = String(contentType || '').toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('svg')) return 'svg';
  if (normalized.includes('video/webm')) return 'webm';
  if (normalized.includes('video/quicktime')) return 'mov';
  if (normalized.includes('video/')) return 'mp4';
  return mediaType === 'video' ? 'mp4' : 'png';
}

async function fetchMediaBinary(rawUrl, mediaType) {
  const sourceUrl = String(rawUrl || '').trim();
  if (!sourceUrl) {
    const error = new Error('Image URL is empty');
    error.response = { status: 400, data: { error: { message: error.message } } };
    throw error;
  }

  if (sourceUrl.startsWith('data:')) {
    const match = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      const error = new Error('Invalid data URL');
      error.response = { status: 400, data: { error: { message: error.message } } };
      throw error;
    }
    return {
      buffer: Buffer.from(match[2], 'base64'),
      contentType: match[1] || guessContentTypeFromUrl(sourceUrl, mediaType)
    };
  }

  const response = await axios.get(sourceUrl, {
    responseType: 'arraybuffer',
    timeout: 120000
  });
  const contentType = String(response.headers?.['content-type'] || '').split(';')[0].trim() || guessContentTypeFromUrl(sourceUrl, mediaType);
  return {
    buffer: Buffer.from(response.data),
    contentType
  };
}

async function uploadImageGenAssetToStorage({ buffer, contentType, provider, mediaType }) {
  const storageRoot = normalizeStorageRoot();
  const folderPrefix = storageRoot ? `${storageRoot}/` : '';
  const dateFolder = new Date().toISOString().slice(0, 10);
  const ext = extensionFromContentType(contentType, mediaType);
  const storagePath = `${folderPrefix}image-gen/${provider}/${dateFolder}/${Date.now()}_${crypto.randomUUID()}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = supabaseAdmin.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: urlData?.publicUrl || ''
  };
}

function mapImageHistoryRow(row) {
  const createdAt = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : String(row.created_at || '');
  const expiresAt = row.expires_at instanceof Date
    ? row.expires_at.toISOString()
    : String(row.expires_at || '');
  const remainingMs = Date.parse(expiresAt) - Date.now();

  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    prompt: row.prompt,
    size: row.size,
    mediaType: row.media_type || 'image',
    url: row.image_url,
    source: 'storage',
    storagePath: row.storage_path,
    createdAt,
    expiresAt,
    secondsUntilDelete: Math.max(0, Math.floor(remainingMs / 1000))
  };
}

async function persistImageGenerationHistory({ userId, provider, model, prompt, size, items, latencyMs }) {
  if (!userId) {
    throw new Error('Missing user id for image history persist');
  }

  const normalizedItems = Array.isArray(items) ? items : [];
  if (normalizedItems.length === 0) return [];

  const retentionMs = Math.max(1, IMAGE_GEN_RETENTION_DAYS) * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const expiresAt = new Date(now + retentionMs);
  const persisted = [];

  for (const item of normalizedItems) {
    const mediaType = normalizeMediaType(item?.mediaType);
    const mediaUrl = typeof item?.url === 'string' ? item.url : '';
    if (!mediaUrl) continue;

    const { buffer, contentType } = await fetchMediaBinary(mediaUrl, mediaType);
    const uploaded = await uploadImageGenAssetToStorage({
      buffer,
      contentType,
      provider: String(provider || 'unknown').replace(/[^a-z0-9_-]/gi, '_').toLowerCase(),
      mediaType
    });

    const id = crypto.randomUUID();
    const createdAt = new Date();
    const query = `
      INSERT INTO ${IMAGE_HISTORY_TABLE}
        (id, user_id, provider, model, prompt, size, media_type, source_url, image_url, storage_path, latency_ms, created_at, expires_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `;

    const result = await dbPool.query(query, [
      id,
      userId,
      String(provider || '').trim() || 'unknown',
      String(model || '').trim() || '-',
      String(prompt || '').trim() || '-',
      String(size || '').trim() || '1024x1024',
      mediaType,
      mediaUrl,
      uploaded.publicUrl,
      uploaded.storagePath,
      Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : null,
      createdAt.toISOString(),
      expiresAt.toISOString()
    ]);

    if (result.rows[0]) {
      persisted.push(mapImageHistoryRow(result.rows[0]));
    }
  }

  return persisted;
}

async function cleanupExpiredImageGenerationHistory({ limit = 200 } = {}) {
  const safeLimit = Math.max(1, Math.min(limit, 1000));
  const selectQuery = `
    SELECT id, storage_path
    FROM ${IMAGE_HISTORY_TABLE}
    WHERE expires_at <= NOW()
    ORDER BY expires_at ASC
    LIMIT $1;
  `;
  const selected = await dbPool.query(selectQuery, [safeLimit]);
  if (selected.rows.length === 0) return 0;

  const storagePaths = selected.rows
    .map((row) => (typeof row.storage_path === 'string' ? row.storage_path : ''))
    .filter(Boolean);

  if (storagePaths.length > 0) {
    const { error } = await supabaseAdmin.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .remove(storagePaths);
    if (error) {
      console.error('[image-gen] Storage cleanup warning:', error.message);
    }
  }

  const ids = selected.rows.map((row) => row.id).filter(Boolean);
  if (ids.length > 0) {
    await dbPool.query(`DELETE FROM ${IMAGE_HISTORY_TABLE} WHERE id = ANY($1::uuid[]);`, [ids]);
  }

  return ids.length;
}

async function ensureImageGenerationHistorySchema() {
  const sql = `
    CREATE TABLE IF NOT EXISTS ${IMAGE_HISTORY_TABLE} (
      id UUID PRIMARY KEY,
      user_id UUID,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      size TEXT NOT NULL,
      media_type TEXT NOT NULL DEFAULT 'image',
      source_url TEXT,
      image_url TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      latency_ms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );

    ALTER TABLE ${IMAGE_HISTORY_TABLE}
      ADD COLUMN IF NOT EXISTS user_id UUID;

    CREATE INDEX IF NOT EXISTS idx_image_generations_created_at
      ON ${IMAGE_HISTORY_TABLE}(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_image_generations_expires_at
      ON ${IMAGE_HISTORY_TABLE}(expires_at ASC);
    CREATE INDEX IF NOT EXISTS idx_image_generations_user_created_at
      ON ${IMAGE_HISTORY_TABLE}(user_id, created_at DESC);
  `;
  await dbPool.query(sql);
}

async function ensureConversationSchema() {
  const sql = `
    CREATE TABLE IF NOT EXISTS ${CONVERSATIONS_TABLE} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      title TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      system_prompt TEXT,
      agent_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${MESSAGES_TABLE} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      conversation_id UUID NOT NULL REFERENCES ${CONVERSATIONS_TABLE}(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      image_url TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE ${CONVERSATIONS_TABLE}
      ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE ${MESSAGES_TABLE}
      ADD COLUMN IF NOT EXISTS user_id UUID;

    CREATE INDEX IF NOT EXISTS idx_conversations_user_updated_at
      ON ${CONVERSATIONS_TABLE}(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_user_conversation_created_at
      ON ${MESSAGES_TABLE}(user_id, conversation_id, created_at ASC);
  `;

  await dbPool.query(sql);
}

async function ensureLibrarySchema() {
  const sql = `
    CREATE TABLE IF NOT EXISTS ${PROMPT_LIBRARY_TABLE} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Custom',
      text TEXT NOT NULL,
      starred BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${AGENT_PROFILES_TABLE} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '🤖',
      description TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'gemini',
      model TEXT NOT NULL DEFAULT '',
      temperature DOUBLE PRECISION NOT NULL DEFAULT 0.7,
      max_tokens INTEGER NOT NULL DEFAULT 1024,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_library_user_updated_at
      ON ${PROMPT_LIBRARY_TABLE}(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_profiles_user_updated_at
      ON ${AGENT_PROFILES_TABLE}(user_id, updated_at DESC);
  `;

  await dbPool.query(sql);
}

async function ensureRealtimePublication() {
  const realtimeTables = [
    API_KEYS_TABLE,
    CONVERSATIONS_TABLE,
    MESSAGES_TABLE,
    IMAGE_HISTORY_TABLE,
    PROMPT_LIBRARY_TABLE,
    AGENT_PROFILES_TABLE
  ];

  for (const table of realtimeTables) {
    try {
      await dbPool.query(`ALTER PUBLICATION supabase_realtime ADD TABLE ${table};`);
    } catch (error) {
      // duplicate_object => table is already in publication.
      if (error?.code === '42710') continue;
      // undefined_object / insufficient_privilege: keep app usable even if realtime publish can't be adjusted.
      if (error?.code === '42704' || error?.code === '42501') {
        console.warn(`[realtime] Publication setup skipped for ${table}: ${error.message}`);
        continue;
      }
      console.warn(`[realtime] Failed to add ${table} to publication: ${error.message}`);
    }
  }
}

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024
  }
});

function parseOptionalMediaUpload(req, res) {
  return new Promise((resolve, reject) => {
    mediaUpload.single('media')(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      service: 'isolated-ai-pages-backend',
      timestamp: new Date().toISOString()
    }
  });
});

function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string') return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function requireSupabaseAuth(req, res, next) {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized: missing bearer token' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: invalid or expired token' });
    }

    req.authUser = data.user;
    return next();
  } catch (error) {
    console.error('[auth] Failed to validate Supabase token:', error.message);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
}

app.use('/api', requireSupabaseAuth);

app.get('/api/settings', async (req, res) => {
  try {
    const keys = await readStoredKeys(req.authUser.id);
    res.json({ success: true, data: buildSettingsResponse(keys) });
  } catch (error) {
    console.error('[isolated-ai-pages] Error reading settings:', error.message);
    res.status(500).json({ success: false, error: 'ไม่สามารถอ่านค่า settings ได้' });
  }
});

app.put('/api/settings/api-keys', async (req, res) => {
  try {
    const payload = req.body || {};
    const keys = await readStoredKeys(req.authUser.id);
    let updated = false;

    for (const provider of settingsProviders) {
      const field = providerFieldMap[provider];
      const value = typeof payload[field] === 'string' ? payload[field].trim() : '';
      if (!value) continue;
      keys[field] = value;
      updated = true;
    }

    if (!updated) {
      return res.status(400).json({
        success: false,
        error: 'ต้องระบุ API key อย่างน้อยหนึ่งรายการสำหรับอัปเดต'
      });
    }

    const saved = await writeStoredKeys(req.authUser.id, keys);
    return res.json({
      success: true,
      message: 'API keys updated (Supabase)',
      data: buildSettingsResponse(saved)
    });
  } catch (error) {
    console.error('[isolated-ai-pages] Error updating API keys:', error.message);
    return res.status(500).json({ success: false, error: 'ไม่สามารถบันทึก API key ได้' });
  }
});

app.post('/api/settings/api-keys/reveal', async (req, res) => {
  try {
    const requested = Array.isArray(req.body?.providers) ? req.body.providers : null;
    const providers = requested
      ? requested.filter((provider) => settingsProviders.includes(provider))
      : settingsProviders;

    const keys = await readStoredKeys(req.authUser.id);
    const result = {};

    for (const provider of providers) {
      const field = providerFieldMap[provider];
      result[field] = keys[field] || null;
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[isolated-ai-pages] Error revealing API keys:', error.message);
    res.status(500).json({ success: false, error: 'ไม่สามารถอ่าน API key ได้' });
  }
});

app.get('/api/settings/ai-test/providers', async (req, res) => {
  try {
    const keys = await readStoredKeys(req.authUser.id);
    res.json({
      success: true,
      data: {
        gemini: { hasKey: !!keys.geminiApiKey },
        openrouter: { hasKey: !!keys.openrouterApiKey },
        groq: { hasKey: !!keys.groqApiKey },
        aimlapi: { hasKey: !!keys.aimlapiApiKey },
        huggingface: { hasKey: !!keys.huggingfaceApiKey },
        pollinations: { hasKey: !!keys.pollinationsApiKey },
        pollo: { hasKey: !!keys.polloApiKey },
        replicate: { hasKey: !!keys.replicateApiKey },
        bfl: { hasKey: !!keys.bflApiKey },
        renderful: { hasKey: !!keys.renderfulApiKey },
        kie: { hasKey: !!keys.kieApiKey },
        fal: { hasKey: !!keys.falApiKey }
      }
    });
  } catch (error) {
    console.error('[isolated-ai-pages] Error loading providers:', error.message);
    res.status(500).json({ success: false, error: 'ไม่สามารถโหลด providers ได้' });
  }
});

app.get('/api/settings/ai-test/:provider/models', async (req, res) => {
  const provider = req.params.provider;
  if (!modelListProviders.includes(provider)) {
    return res.status(400).json({ success: false, error: 'Unsupported provider for models endpoint' });
  }

  try {
    const keys = await readStoredKeys(req.authUser.id);
    const apiKey = getProviderKey(keys, provider);

    if (provider === 'huggingface') {
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'ยังไม่ได้ใส่ API key สำหรับ huggingface'
        });
      }

      return res.json({
        success: true,
        data: {
          data: huggingFaceImageModels.map((id) => ({ id }))
        }
      });
    }

    if (provider === 'pollinations') {
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'ยังไม่ได้ใส่ API key สำหรับ pollinations'
        });
      }

      let ids = [];
      try {
        const response = await axios.get(`${POLLINATIONS_BASE_URL}/image/models`, {
          headers: {
            Authorization: `Bearer ${apiKey}`
          },
          timeout: 30000
        });

        const items = Array.isArray(response.data) ? response.data : [];
        ids = items
          .map((item) => item?.name)
          .filter((name) => typeof name === 'string' && name.trim().length > 0)
          .map((name) => name.trim());
      } catch {
        // Fall back to curated list when remote model list is unavailable.
      }

      if (ids.length === 0) {
        ids = pollinationsImageModels;
      }

      return res.json({
        success: true,
        data: {
          data: Array.from(new Set(ids)).map((id) => ({ id }))
        }
      });
    }

    if (provider === 'pollo') {
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'ยังไม่ได้ใส่ API key สำหรับ pollo'
        });
      }

      return res.json({
        success: true,
        data: {
          data: polloGenerationModels.map((id) => ({ id }))
        }
      });
    }

    if (provider === 'replicate') {
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'ยังไม่ได้ใส่ API key สำหรับ replicate'
        });
      }

      return res.json({
        success: true,
        data: {
          data: replicateImageModels.map((id) => ({ id }))
        }
      });
    }

    if (provider === 'bfl') {
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'ยังไม่ได้ใส่ API key สำหรับ BFL (Black Forest Labs)'
        });
      }

      return res.json({
        success: true,
        data: {
          data: bflImageModels.map((m) => ({ id: m.id, price: m.price }))
        }
      });
    }

    if (provider === 'renderful') {
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'ยังไม่ได้ใส่ API key สำหรับ Renderful'
        });
      }

      return res.json({
        success: true,
        data: {
          data: renderfulImageModels.map((id) => ({ id }))
        }
      });
    }

    if (provider === 'kie') {
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'ยังไม่ได้ใส่ API key สำหรับ Kie.ai'
        });
      }

      return res.json({
        success: true,
        data: {
          data: kieImageModels.map((id) => ({ id }))
        }
      });
    }

    if (provider === 'fal') {
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'ยังไม่ได้ใส่ API key สำหรับ fal.ai'
        });
      }

      return res.json({
        success: true,
        data: {
          data: falImageModels.map((id) => ({ id }))
        }
      });
    }

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: `ยังไม่ได้ใส่ API key สำหรับ ${provider}`
      });
    }

    if (provider === 'gemini') {
      const payload = await listGeminiModels(apiKey);
      const models = withVertexAnthropicModels(normalizeGeminiModelNames(payload));
      return res.json({ success: true, data: { models } });
    }

    const baseUrl = provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1'
      : provider === 'groq'
        ? 'https://api.groq.com/openai/v1'
        : AIMLAPI_BASE_URL;

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = PUBLIC_BASE_URL;
      headers['X-Title'] = 'Isolated AI Pages';
    }

    const response = await axios.get(`${baseUrl}/models`, {
      headers,
      timeout: 30000
    });

    return res.json({ success: true, data: response.data });
  } catch (error) {
    const { status, message } = getRemoteError(error, 'ไม่สามารถโหลดรายชื่อโมเดลได้');
    console.error('[isolated-ai-pages] Error fetching model list:', status, message);
    return res.status(status).json({ success: false, error: message });
  }
});

app.post('/api/settings/ai-test/chat', async (req, res) => {
  const startedAt = Date.now();
  const provider = req.body?.provider;
  const model = req.body?.model;

  if (!allowedProviders.includes(provider)) {
    return res.status(400).json({ success: false, error: 'Unsupported provider' });
  }

  if (typeof model !== 'string' || !model.trim()) {
    return res.status(400).json({ success: false, error: 'Model is required' });
  }

  try {
    const keys = await readStoredKeys(req.authUser.id);
    const apiKey = getProviderKey(keys, provider);

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: `ยังไม่ได้ใส่ API key สำหรับ ${provider}`
      });
    }
    const generated = await generateTextWithProvider({
      provider,
      model,
      apiKey,
      messages: req.body?.messages,
      prompt: req.body?.prompt,
      systemPrompt: req.body?.system_prompt,
      temperature: typeof req.body?.temperature === 'number' ? req.body.temperature : 0.7,
      topP: typeof req.body?.top_p === 'number' ? req.body.top_p : 0.9,
      maxTokens: typeof req.body?.max_tokens === 'number' ? req.body.max_tokens : 1024,
      presencePenalty: typeof req.body?.presence_penalty === 'number' ? req.body.presence_penalty : undefined,
      frequencyPenalty: typeof req.body?.frequency_penalty === 'number' ? req.body.frequency_penalty : undefined,
      timeoutMs: 60000
    });

    return res.json({
      success: true,
      data: {
        provider,
        model: generated.model || model,
        text: generated.text,
        usage: generated.usage || undefined,
        latencyMs: Date.now() - startedAt
      }
    });
  } catch (error) {
    const { status, message } = getRemoteError(error, 'AI test failed');
    console.error('[isolated-ai-pages] Error in ai-test/chat:', status, message);
    return res.status(status).json({ success: false, error: message });
  }
});

app.post('/api/agent/run', async (req, res) => {
  const startedAt = Date.now();
  const goal = typeof req.body?.goal === 'string' ? req.body.goal.trim() : '';
  const context = typeof req.body?.context === 'string' ? req.body.context.trim() : '';
  const requestedModel = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
  const model = requestedModel || AGENT_DEFAULT_MODEL;
  const maxSteps = Number.isFinite(Number(req.body?.max_steps)) ? Number(req.body.max_steps) : 6;

  if (!goal) {
    return res.status(400).json({ success: false, error: 'goal is required' });
  }

  try {
    const keys = await readStoredKeys(req.authUser.id);
    const apiKey = getProviderKey(keys, 'gemini');
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'ยังไม่ได้ใส่ API key สำหรับ gemini/vertex'
      });
    }

    const result = await runAgentLoop({
      apiKey,
      model,
      goal,
      context,
      maxSteps
    });

    return res.json({
      success: true,
      data: {
        model,
        goal,
        done: result.done,
        summary: result.summary,
        steps: result.steps,
        latencyMs: Date.now() - startedAt
      }
    });
  } catch (error) {
    const { status, message } = getRemoteError(error, 'Agent run failed');
    console.error('[isolated-ai-pages] Error in /api/agent/run:', status, message);
    return res.status(status).json({ success: false, error: message });
  }
});

app.post('/api/content/repurpose', async (req, res) => {
  const startedAt = Date.now();
  const provider = typeof req.body?.provider === 'string' ? req.body.provider.trim().toLowerCase() : '';
  const model = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
  const sourceUrl = typeof req.body?.sourceUrl === 'string' ? req.body.sourceUrl.trim() : '';
  const sourceTextFallback = typeof req.body?.sourceText === 'string' ? req.body.sourceText.trim() : '';
  const outputLanguageRaw = typeof req.body?.outputLanguage === 'string' ? req.body.outputLanguage.trim().toLowerCase() : 'th';
  const outputLanguage = ['th', 'en', 'auto'].includes(outputLanguageRaw) ? outputLanguageRaw : 'th';
  const brandVoice = typeof req.body?.brandVoice === 'string' ? req.body.brandVoice.trim() : '';
  const targetAudience = typeof req.body?.targetAudience === 'string' ? req.body.targetAudience.trim() : '';
  const objective = typeof req.body?.objective === 'string' ? req.body.objective.trim() : '';
  const cta = typeof req.body?.cta === 'string' ? req.body.cta.trim() : '';

  const temperatureCandidate = Number.parseFloat(String(req.body?.temperature ?? ''));
  const maxTokensCandidate = Number.parseInt(String(req.body?.max_tokens ?? ''), 10);
  const temperature = Number.isFinite(temperatureCandidate)
    ? Math.min(0.9, Math.max(0, temperatureCandidate))
    : 0.35;
  const maxTokens = Number.isFinite(maxTokensCandidate)
    ? Math.min(4096, Math.max(900, maxTokensCandidate))
    : 3200;

  const normalizePlatformId = (value) => {
    const key = String(value || '').trim().toLowerCase();
    if (!key) return '';
    if (key === 'x' || key === 'twitter') return 'x';
    if (key === 'threads' || key === 'thread') return 'threads';
    if (key === 'instagram' || key === 'ig') return 'instagram';
    if (key === 'tiktok' || key === 'tik_tok' || key === 'tik-tok') return 'tiktok';
    return '';
  };

  const requestedPlatformsInput = Array.isArray(req.body?.platforms)
    ? req.body.platforms
    : crossPlatformTargetIds;

  const requestedPlatforms = Array.from(new Set(
    requestedPlatformsInput
      .map((item) => normalizePlatformId(item))
      .filter((item) => crossPlatformTargetIds.includes(item))
  ));

  if (!allowedProviders.includes(provider)) {
    return res.status(400).json({ success: false, error: 'Unsupported provider' });
  }

  if (!model) {
    return res.status(400).json({ success: false, error: 'Model is required' });
  }

  if (!sourceUrl) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุ sourceUrl' });
  }

  if (requestedPlatforms.length === 0) {
    return res.status(400).json({ success: false, error: 'กรุณาเลือกอย่างน้อย 1 แพลตฟอร์ม' });
  }

  try {
    const keys = await readStoredKeys(req.authUser.id);
    const apiKey = getProviderKey(keys, provider);
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: `ยังไม่ได้ใส่ API key สำหรับ ${provider}`
      });
    }

    let sourceData;
    let fromManualFallback = false;
    let extractionWarning = null;

    try {
      sourceData = await loadArticleFromUrl(sourceUrl);
    } catch (error) {
      if (sourceTextFallback.length >= 180) {
        sourceData = {
          title: null,
          description: null,
          text: sourceTextFallback.slice(0, 24000)
        };
        fromManualFallback = true;
        extractionWarning = error?.response?.data?.error?.message || error?.message || 'ใช้ข้อความที่ผู้ใช้วางแทน URL';
      } else {
        throw error;
      }
    }

    if (sourceTextFallback.length >= 80) {
      sourceData.text = normalizePlainText(
        [sourceTextFallback.slice(0, 12000), sourceData.text]
          .filter(Boolean)
          .join('\n\n')
      ).slice(0, 28000);
    }

    const effectiveMaxTokens = requestedPlatforms.length >= 3
      ? Math.max(maxTokens, 3200)
      : maxTokens;

    const prompt = buildCrossPlatformRepurposePrompt({
      sourceUrl,
      sourceTitle: sourceData.title,
      sourceDescription: sourceData.description,
      sourceText: sourceData.text,
      requestedPlatforms,
      outputLanguage,
      brandVoice,
      targetAudience,
      objective,
      cta
    });

    const generated = await generateTextWithProvider({
      provider,
      model,
      apiKey,
      prompt,
      temperature,
      topP: 0.9,
      maxTokens: effectiveMaxTokens,
      timeoutMs: 120000
    });

    let rawOutputText = generated.text || '';
    let parsedPayload = extractJsonObjectFromText(rawOutputText);
    let normalizedOutput = normalizeCrossPlatformOutput(parsedPayload, requestedPlatforms);
    let outputScore = scoreRepurposeOutput(normalizedOutput, requestedPlatforms);

    const minTargetScore = 220 + requestedPlatforms.length * 140;
    const needsRepairPass = !parsedPayload || outputScore < minTargetScore;

    if (needsRepairPass) {
      try {
        const repairPrompt = buildCrossPlatformRepairPrompt({
          sourceUrl,
          sourceTitle: sourceData.title,
          sourceDescription: sourceData.description,
          sourceText: sourceData.text,
          requestedPlatforms,
          outputLanguage,
          brandVoice,
          targetAudience,
          objective,
          cta,
          draftOutput: rawOutputText
        });

        const repaired = await generateTextWithProvider({
          provider,
          model,
          apiKey,
          prompt: repairPrompt,
          temperature: Math.min(0.2, temperature),
          topP: 0.85,
          maxTokens: Math.max(effectiveMaxTokens, 3200),
          timeoutMs: 120000
        });

        const repairedParsed = extractJsonObjectFromText(repaired.text);
        const repairedNormalized = normalizeCrossPlatformOutput(repairedParsed, requestedPlatforms);
        const repairedScore = scoreRepurposeOutput(repairedNormalized, requestedPlatforms);

        if (repairedParsed && repairedScore >= outputScore) {
          parsedPayload = repairedParsed;
          normalizedOutput = repairedNormalized;
          outputScore = repairedScore;
          rawOutputText = repaired.text || rawOutputText;
        }
      } catch (repairError) {
        console.warn('[content-repurpose] Repair pass failed:', repairError?.message || repairError);
      }
    }

    let missingPlatforms = requestedPlatforms.filter(
      (platformId) => !hasUsablePlatformOutput(platformId, normalizedOutput.platformOutputs?.[platformId])
    );

    if (missingPlatforms.length > 0) {
      try {
        const missingPrompt = buildMissingPlatformsCompletionPrompt({
          sourceUrl,
          sourceTitle: sourceData.title,
          sourceDescription: sourceData.description,
          sourceText: sourceData.text,
          outputLanguage,
          brandVoice,
          targetAudience,
          objective,
          cta,
          missingPlatforms,
          currentOutput: JSON.stringify(normalizedOutput, null, 2)
        });

        const completed = await generateTextWithProvider({
          provider,
          model,
          apiKey,
          prompt: missingPrompt,
          temperature: 0.2,
          topP: 0.85,
          maxTokens: Math.max(effectiveMaxTokens, 2400),
          timeoutMs: 120000
        });

        const completedParsed = extractJsonObjectFromText(completed.text);
        const completedNormalized = normalizeCrossPlatformOutput(completedParsed, missingPlatforms);
        for (const platformId of missingPlatforms) {
          const nextPayload = completedNormalized.platformOutputs?.[platformId];
          if (hasUsablePlatformOutput(platformId, nextPayload)) {
            normalizedOutput.platformOutputs[platformId] = nextPayload;
          }
        }

        if (completedNormalized.repurposingNotes?.length > 0) {
          normalizedOutput.repurposingNotes = Array.from(new Set([
            ...normalizedOutput.repurposingNotes,
            ...completedNormalized.repurposingNotes
          ])).slice(0, 10);
        }

        rawOutputText = `${rawOutputText}\n\n[completion-pass]\n${completed.text || ''}`.trim();
        outputScore = scoreRepurposeOutput(normalizedOutput, requestedPlatforms);
      } catch (completeError) {
        console.warn('[content-repurpose] Missing-platform completion failed:', completeError?.message || completeError);
      }
    }

    missingPlatforms = requestedPlatforms.filter(
      (platformId) => !hasUsablePlatformOutput(platformId, normalizedOutput.platformOutputs?.[platformId])
    );

    for (const platformId of missingPlatforms) {
      const deterministic = buildDeterministicPlatformFallback(platformId, normalizedOutput, sourceData);
      if (deterministic && typeof deterministic === 'object') {
        normalizedOutput.platformOutputs[platformId] = deterministic;
      }
    }

    if (!normalizeGeneratedFieldText(normalizedOutput.sourceSummary)) {
      normalizedOutput.sourceSummary = normalizeGeneratedFieldText(
        sourceData.description || String(sourceData.text || '').slice(0, 500)
      );
    }
    if (!normalizeGeneratedFieldText(normalizedOutput.coreMessage)) {
      const basis = normalizeGeneratedFieldText(normalizedOutput.sourceSummary) || normalizePlainText(String(sourceData.text || '').slice(0, 300));
      normalizedOutput.coreMessage = normalizeGeneratedFieldText((basis.split(/[\n.!?]/).find((line) => normalizePlainText(line).length >= 24) || basis).trim());
    }

    if (normalizedOutput.repurposingNotes.length === 0) {
      normalizedOutput.repurposingNotes = [
        'ตรวจความถูกต้องของข้อมูลสำคัญอีกครั้งก่อนโพสต์จริง',
        'A/B test hook อย่างน้อย 2 แบบเพื่อหา format ที่ engagement สูงสุด'
      ];
    }

    normalizedOutput = enforceRepurposeOutputQuality(normalizedOutput, requestedPlatforms);

    return res.json({
      success: true,
      data: {
        provider,
        model: generated.model || model,
        source: {
          url: sourceUrl,
          title: sourceData.title || null,
          description: sourceData.description || null,
          extractedChars: sourceData.text.length,
          fromManualFallback,
          extractionWarning
        },
        output: normalizedOutput,
        parsed: !!parsedPayload,
        rawText: rawOutputText,
        latencyMs: Date.now() - startedAt
      }
    });
  } catch (error) {
    const { status, message } = getRemoteError(error, 'Cross-platform repurpose failed');
    console.error('[isolated-ai-pages] Error in content/repurpose:', status, message);
    return res.status(status).json({ success: false, error: message });
  }
});

app.post('/api/settings/image-gen/generate', async (req, res) => {
  const startedAt = Date.now();
  const provider = typeof req.body?.provider === 'string' ? req.body.provider.trim().toLowerCase() : '';
  const model = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  const negativePrompt = typeof req.body?.negative_prompt === 'string' ? req.body.negative_prompt.trim() : '';
  const size = normalizeImageSize(req.body?.size);
  const n = normalizeImageCount(req.body?.n);
  const quality = typeof req.body?.quality === 'string' ? req.body.quality.trim().toLowerCase() : 'auto';
  const style = typeof req.body?.style === 'string' ? req.body.style.trim().toLowerCase() : 'auto';
  const seedCandidate = Number.parseInt(String(req.body?.seed ?? ''), 10);
  const seed = Number.isNaN(seedCandidate) ? null : seedCandidate;

  if (!imageGenerationProviders.includes(provider)) {
    return res.status(400).json({
      success: false,
      error: 'Provider นี้ยังไม่รองรับ image generation endpoint'
    });
  }

  if (!model) {
    return res.status(400).json({ success: false, error: 'Model is required' });
  }

  if (!prompt) {
    return res.status(400).json({ success: false, error: 'Prompt is required' });
  }

  try {
    const keys = await readStoredKeys(req.authUser.id);
    const apiKey = getProviderKey(keys, provider);

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: `ยังไม่ได้ใส่ API key สำหรับ ${provider}`
      });
    }

    const baseUrl = provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1'
      : AIMLAPI_BASE_URL;

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = PUBLIC_BASE_URL;
      headers['X-Title'] = 'Isolated AI Pages';
    }

    let images = [];
    let resolvedModel = model;

    if (provider === 'gemini') {
      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`;

      // Gemini-specific params from frontend
      const geminiAspectRatio = typeof req.body?.gemini_aspect_ratio === 'string' ? req.body.gemini_aspect_ratio.trim() : '';
      const geminiImageSize = typeof req.body?.gemini_image_size === 'string' ? req.body.gemini_image_size.trim() : '';
      const outputMimeType = typeof req.body?.output_mime_type === 'string' ? req.body.output_mime_type.trim() : '';
      const jpegQualityRaw = Number.parseInt(String(req.body?.jpeg_quality ?? ''), 10);
      const jpegQuality = !Number.isNaN(jpegQualityRaw) ? Math.max(0, Math.min(jpegQualityRaw, 100)) : null;

      const parameters = { sampleCount: n };
      if (seed != null) parameters.seed = seed;

      // Aspect ratio: use Gemini-specific value if provided, fallback to size mapping
      if (geminiAspectRatio && ['1:1', '3:4', '4:3', '9:16', '16:9'].includes(geminiAspectRatio)) {
        parameters.aspectRatio = geminiAspectRatio;
      } else {
        const aspectMap = { '1024x1024': '1:1', '1536x1024': '4:3', '1024x1536': '3:4', '1792x1024': '16:9' };
        if (aspectMap[size]) parameters.aspectRatio = aspectMap[size];
      }

      // Image size (1K / 2K)
      if (geminiImageSize === '1K' || geminiImageSize === '2K') {
        parameters.sampleImageSize = geminiImageSize;
      }

      // Person generation
      parameters.personGeneration = 'allow_all';

      // Output format
      if (outputMimeType === 'image/png' || outputMimeType === 'image/jpeg') {
        parameters.outputOptions = { mimeType: outputMimeType };
        if (outputMimeType === 'image/jpeg' && jpegQuality != null) {
          parameters.outputOptions.compressionQuality = jpegQuality;
        }
      }

      const requestBody = {
        instances: [{ prompt }],
        parameters
      };

      const response = await axios.post(geminiEndpoint, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        timeout: 120000
      });

      const mimeForDataUrl = outputMimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
      const generatedImages = response.data?.predictions || response.data?.generatedImages || [];
      for (const img of generatedImages) {
        const b64 = img?.bytesBase64Encoded || img?.image?.bytesBase64Encoded;
        if (b64) {
          images.push({ url: `data:${mimeForDataUrl};base64,${b64}` });
        }
      }
    } else if (provider === 'bfl') {
      const BFL_BASE = 'https://api.bfl.ai/v1';
      const bflHeaders = { 'Content-Type': 'application/json', 'x-key': apiKey };

      const [bflW, bflH] = size.split('x').map((v) => Number.parseInt(v, 10));
      const bflBody = { prompt };
      if (bflW && bflH) { bflBody.width = bflW; bflBody.height = bflH; }
      if (seed != null) bflBody.seed = seed;

      const allImages = [];
      for (let i = 0; i < n; i++) {
        const createRes = await axios.post(`${BFL_BASE}/${model}`, bflBody, {
          headers: bflHeaders,
          timeout: 30000
        });

        const pollingUrl = createRes.data?.polling_url;
        const taskId = createRes.data?.id;
        if (!pollingUrl && !taskId) {
          throw new Error('BFL API did not return a polling URL or task ID');
        }

        const pollEndpoint = pollingUrl || `${BFL_BASE}/get_result?id=${taskId}`;
        const maxPolls = 120;
        const pollIntervalMs = 2000;
        let sampleUrl = null;

        for (let p = 0; p < maxPolls; p++) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          const pollRes = await axios.get(pollEndpoint, { headers: bflHeaders, timeout: 15000 });
          const status = pollRes.data?.status;

          if (status === 'Ready') {
            sampleUrl = pollRes.data?.result?.sample;
            break;
          }
          if (status === 'Error' || status === 'Failed') {
            const errMsg = pollRes.data?.result?.error || pollRes.data?.error || 'BFL task failed';
            throw new Error(errMsg);
          }
        }

        if (!sampleUrl) {
          throw new Error('BFL generation timed out (polling exceeded max attempts)');
        }

        // Download the signed URL image and convert to base64
        const imgRes = await axios.get(sampleUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const contentType = imgRes.headers['content-type'] || 'image/jpeg';
        const b64 = Buffer.from(imgRes.data).toString('base64');
        allImages.push({ url: `data:${contentType};base64,${b64}` });
      }

      images = allImages;
    } else if (provider === 'renderful') {
      const RENDERFUL_BASE = 'https://api.renderful.ai/api/v1';
      const renderfulHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      };

      const allImages = [];
      for (let i = 0; i < n; i++) {
        const renderfulBody = {
          type: 'text-to-image',
          model,
          prompt
        };

        const createRes = await axios.post(`${RENDERFUL_BASE}/generations`, renderfulBody, {
          headers: renderfulHeaders,
          timeout: 30000
        });

        const genId = createRes.data?.id;
        if (!genId) {
          throw new Error('Renderful API did not return a generation ID');
        }

        const maxPolls = 120;
        const pollIntervalMs = 2000;
        let resultUrl = null;

        for (let p = 0; p < maxPolls; p++) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          const pollRes = await axios.get(`${RENDERFUL_BASE}/generations/${genId}`, {
            headers: renderfulHeaders,
            timeout: 15000
          });

          const status = (pollRes.data?.status || '').toLowerCase();

          if (status === 'completed' || status === 'ready' || status === 'succeeded') {
            resultUrl = pollRes.data?.output?.url
              || pollRes.data?.output?.image_url
              || pollRes.data?.result?.url
              || pollRes.data?.result?.sample
              || pollRes.data?.url
              || pollRes.data?.image_url;

            if (!resultUrl && Array.isArray(pollRes.data?.output)) {
              resultUrl = pollRes.data.output[0];
            }
            if (!resultUrl && pollRes.data?.output && typeof pollRes.data.output === 'string') {
              resultUrl = pollRes.data.output;
            }
            break;
          }
          if (status === 'failed' || status === 'error') {
            const errMsg = pollRes.data?.error || pollRes.data?.message || 'Renderful task failed';
            throw new Error(errMsg);
          }
        }

        if (!resultUrl) {
          throw new Error('Renderful generation timed out (polling exceeded max attempts)');
        }

        const imgRes = await axios.get(resultUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const contentType = imgRes.headers['content-type'] || 'image/png';
        const b64 = Buffer.from(imgRes.data).toString('base64');
        allImages.push({ url: `data:${contentType};base64,${b64}` });
      }

      images = allImages;
    } else if (provider === 'kie') {
      const KIE_BASE = 'https://api.kie.ai';
      const kieHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };

      const allImages = [];
      for (let i = 0; i < n; i++) {
        let createRes;
        let pollEndpoint;

        if (model === '4o-image') {
          // First-party 4o image endpoint
          const aspectMap = { '1024x1024': '1:1', '1536x1024': '3:2', '1024x1536': '2:3', '1792x1024': '3:2' };
          createRes = await axios.post(`${KIE_BASE}/api/v1/gpt4o-image/generate`, {
            prompt,
            size: aspectMap[size] || '1:1',
            nVariants: 1
          }, { headers: kieHeaders, timeout: 30000 });
          pollEndpoint = (taskId) => `${KIE_BASE}/api/v1/gpt4o-image/record-info?taskId=${taskId}`;
        } else if (model === 'flux-kontext-pro' || model === 'flux-kontext-max') {
          // First-party Flux Kontext endpoint
          const aspectMap = { '1024x1024': '1:1', '1536x1024': '4:3', '1024x1536': '3:4', '1792x1024': '16:9' };
          createRes = await axios.post(`${KIE_BASE}/api/v1/flux/kontext/generate`, {
            prompt,
            model: model,
            aspectRatio: aspectMap[size] || '1:1'
          }, { headers: kieHeaders, timeout: 30000 });
          pollEndpoint = (taskId) => `${KIE_BASE}/api/v1/flux/kontext/record-info?taskId=${taskId}`;
        } else {
          // Market models via unified createTask endpoint
          const aspectMap = { '1024x1024': '1:1', '1536x1024': '4:3', '1024x1536': '3:4', '1792x1024': '16:9' };
          const inputBody = { prompt, aspect_ratio: aspectMap[size] || '1:1' };
          if (seed != null) inputBody.seed = seed;
          createRes = await axios.post(`${KIE_BASE}/api/v1/jobs/createTask`, {
            model,
            input: inputBody
          }, { headers: kieHeaders, timeout: 30000 });
          pollEndpoint = (taskId) => `${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`;
        }

        const taskId = createRes.data?.data?.taskId || createRes.data?.taskId;
        if (!taskId) {
          throw new Error('Kie.ai API did not return a taskId');
        }

        // Poll for result
        const maxPolls = 120;
        const pollIntervalMs = 2000;
        let resultUrl = null;

        for (let p = 0; p < maxPolls; p++) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          const pollRes = await axios.get(pollEndpoint(taskId), { headers: kieHeaders, timeout: 15000 });
          const pollData = pollRes.data?.data || pollRes.data || {};
          const state = (pollData.state || pollData.status || '').toString().toLowerCase();

          if (state === 'success' || state === 'completed') {
            // resultJson is a JSON string — parse it to get resultUrls
            let parsed = {};
            if (typeof pollData.resultJson === 'string') {
              try { parsed = JSON.parse(pollData.resultJson); } catch { }
            } else if (pollData.resultJson && typeof pollData.resultJson === 'object') {
              parsed = pollData.resultJson;
            }

            const resultUrls = parsed.resultUrls
              || parsed.result_urls
              || pollData.response?.result_urls
              || pollData.output?.result_urls
              || [];
            const resultImageUrl = parsed.resultImageUrl
              || pollData.response?.resultImageUrl
              || pollData.info?.resultImageUrl
              || pollData.output?.url
              || pollData.output?.image_url
              || null;

            if (Array.isArray(resultUrls) && resultUrls.length > 0) {
              resultUrl = resultUrls[0];
            } else if (resultImageUrl) {
              resultUrl = resultImageUrl;
            }
            break;
          }
          if (state === 'fail' || state === 'failed' || state === 'error') {
            const errMsg = pollData.failMsg || pollData.errorMessage || pollData.error || 'Kie.ai task failed';
            throw new Error(errMsg);
          }
        }

        if (!resultUrl) {
          throw new Error('Kie.ai generation timed out (polling exceeded max attempts)');
        }

        // Download and convert to base64
        const imgRes = await axios.get(resultUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const contentType = imgRes.headers['content-type'] || 'image/png';
        const b64 = Buffer.from(imgRes.data).toString('base64');
        allImages.push({ url: `data:${contentType};base64,${b64}` });
      }

      images = allImages;
    } else if (provider === 'fal') {
      const FAL_RUN_BASE = 'https://fal.run';
      const falHeaders = { 'Content-Type': 'application/json', Authorization: `Key ${apiKey}` };
      const sizeMap = {
        '1024x1024': 'square_hd',
        '1536x1024': 'landscape_4_3',
        '1024x1536': 'portrait_4_3',
        '1792x1024': 'landscape_16_9'
      };

      const falBody = {
        prompt,
        image_size: sizeMap[size] || 'landscape_4_3',
        num_images: n,
        output_format: 'png',
        sync_mode: true
      };
      if (seed != null) falBody.seed = Number(seed);
      if (negativePrompt) falBody.negative_prompt = negativePrompt;

      const falRes = await axios.post(`${FAL_RUN_BASE}/${model}`, falBody, {
        headers: falHeaders,
        timeout: 120000
      });

      const falImages = falRes.data?.images || [];
      if (!falImages.length) {
        throw new Error('fal.ai did not return any images');
      }

      const allImages = [];
      for (const img of falImages) {
        if (img.url) {
          const imgRes = await axios.get(img.url, { responseType: 'arraybuffer', timeout: 30000 });
          const contentType = imgRes.headers['content-type'] || img.content_type || 'image/png';
          const b64 = Buffer.from(imgRes.data).toString('base64');
          allImages.push({ url: `data:${contentType};base64,${b64}` });
        }
      }
      images = allImages;
    } else if (provider === 'replicate') {
      images = await requestReplicateImages({
        apiKey,
        model,
        prompt,
        negativePrompt,
        size,
        n,
        quality,
        seed
      });
    } else if (provider === 'pollinations') {
      images = await requestPollinationsImages({
        apiKey,
        model,
        prompt,
        negativePrompt,
        size,
        n,
        quality,
        seed
      });
    } else if (provider === 'huggingface') {
      const hfOutputMime = typeof req.body?.output_mime_type === 'string' ? req.body.output_mime_type.trim() : '';
      images = await requestHuggingFaceImages({
        apiKey,
        model,
        prompt,
        negativePrompt,
        size,
        n,
        quality,
        seed,
        acceptMime: hfOutputMime === 'image/jpeg' ? 'image/jpeg' : 'image/png'
      });
    } else if (provider === 'openrouter') {
      const composedPromptParts = [prompt];
      if (negativePrompt) composedPromptParts.push(`Negative prompt: ${negativePrompt}`);
      if (quality && quality !== 'auto') composedPromptParts.push(`Quality preference: ${quality}`);
      if (style && style !== 'auto') composedPromptParts.push(`Style preference: ${style}`);
      if (seed != null) composedPromptParts.push(`Seed: ${seed}`);

      const chatPayload = {
        model,
        messages: [
          {
            role: 'user',
            content: composedPromptParts.join('\n')
          }
        ],
        modalities: ['image', 'text'],
        image_config: {
          aspect_ratio: sizeToAspectRatio(size)
        },
        stream: false
      };

      for (let index = 0; index < n; index += 1) {
        const response = await axios.post(`${baseUrl}/chat/completions`, chatPayload, {
          headers,
          timeout: 120000
        });
        throwIfPayloadError(response.data);
        const normalized = normalizeGeneratedImages(response.data);
        if (Array.isArray(normalized) && normalized.length > 0) {
          images.push(...normalized);
        }
        if (typeof response.data?.model === 'string' && response.data.model.trim()) {
          resolvedModel = response.data.model;
        }
      }
    } else {
      const payload = buildImagePayload({
        model,
        prompt,
        size,
        n,
        negativePrompt,
        quality,
        style,
        seed,
        includeOptional: true
      });

      let response;
      try {
        response = await requestImageGeneration(baseUrl, headers, payload);
      } catch (error) {
        const hasOptionalParams =
          !!negativePrompt || (quality && quality !== 'auto') || (style && style !== 'auto') || seed != null;

        if (hasOptionalParams && isLikelyUnsupportedImageParamError(error)) {
          const fallbackPayload = buildImagePayload({
            model,
            prompt,
            size,
            n,
            negativePrompt,
            quality,
            style,
            seed,
            includeOptional: false
          });
          response = await requestImageGeneration(baseUrl, headers, fallbackPayload);
        } else {
          throw error;
        }
      }

      images = normalizeGeneratedImages(response.data);
      if (typeof response.data?.model === 'string' && response.data.model.trim()) {
        resolvedModel = response.data.model;
      }
    }

    const normalizedImages = images.slice(0, n);
    if (normalizedImages.length === 0) {
      return res.status(502).json({
        success: false,
        error: 'Provider ตอบกลับสำเร็จแต่ไม่พบข้อมูลภาพ'
      });
    }

    const persistedImages = await persistImageGenerationHistory({
      userId: req.authUser.id,
      provider,
      model: resolvedModel,
      prompt,
      size,
      items: normalizedImages.map((item) => ({
        url: item.url,
        mediaType: 'image'
      })),
      latencyMs: Date.now() - startedAt
    });

    return res.json({
      success: true,
      data: {
        provider,
        model: resolvedModel,
        prompt,
        size,
        n: persistedImages.length > 0 ? persistedImages.length : normalizedImages.length,
        images: persistedImages.length > 0 ? persistedImages : normalizedImages,
        latencyMs: Date.now() - startedAt
      }
    });
  } catch (error) {
    const { status, message } = getRemoteError(error, 'Image generation failed');
    console.error('[isolated-ai-pages] Error in image-gen/generate:', status, message);
    return res.status(status).json({ success: false, error: message });
  }
});

app.get('/api/settings/image-gen/history', async (req, res) => {
  try {
    await cleanupExpiredImageGenerationHistory();
    const limitRaw = Number.parseInt(String(req.query?.limit ?? ''), 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(limitRaw, IMAGE_GEN_HISTORY_MAX_LIMIT))
      : 80;

    const query = `
      SELECT *
      FROM ${IMAGE_HISTORY_TABLE}
      WHERE expires_at > NOW()
        AND user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await dbPool.query(query, [req.authUser.id, limit]);
    return res.json({
      success: true,
      data: {
        items: result.rows.map(mapImageHistoryRow)
      }
    });
  } catch (error) {
    console.error('[image-gen] Error loading history:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load image generation history' });
  }
});

app.post('/api/settings/image-gen/history/persist', async (req, res) => {
  try {
    const provider = typeof req.body?.provider === 'string' ? req.body.provider.trim() : '';
    const model = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const size = normalizeImageSize(req.body?.size);
    const latencyMs = Number.parseInt(String(req.body?.latencyMs ?? ''), 10);
    const rawItems = Array.isArray(req.body?.items) ? req.body.items.slice(0, 10) : [];

    if (!provider || !model || !prompt) {
      return res.status(400).json({ success: false, error: 'provider, model, prompt are required' });
    }

    if (rawItems.length === 0) {
      return res.status(400).json({ success: false, error: 'items is required' });
    }

    const normalizedItems = rawItems
      .map((item) => ({
        url: typeof item?.url === 'string' ? item.url.trim() : '',
        mediaType: normalizeMediaType(item?.mediaType)
      }))
      .filter((item) => item.url.length > 0);

    if (normalizedItems.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid items to persist' });
    }

    const persisted = await persistImageGenerationHistory({
      userId: req.authUser.id,
      provider,
      model,
      prompt,
      size,
      items: normalizedItems,
      latencyMs: Number.isFinite(latencyMs) ? latencyMs : null
    });

    return res.status(201).json({
      success: true,
      data: {
        items: persisted
      }
    });
  } catch (error) {
    console.error('[image-gen] Error persisting history:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to persist image generation history' });
  }
});

app.delete('/api/settings/image-gen/history/:id', async (req, res) => {
  const itemId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!itemId) {
    return res.status(400).json({ success: false, error: 'Missing item id' });
  }

  try {
    // Find the item to get storage_path
    const selectQuery = `SELECT id, storage_path FROM ${IMAGE_HISTORY_TABLE} WHERE id = $1 AND user_id = $2 LIMIT 1;`;
    const selected = await dbPool.query(selectQuery, [itemId, req.authUser.id]);

    if (selected.rows.length === 0) {
      // Not in DB - just return success (might be a local-only card)
      return res.json({ success: true, data: { deleted: true } });
    }

    const storagePath = typeof selected.rows[0].storage_path === 'string' ? selected.rows[0].storage_path : '';

    // Delete from storage
    if (storagePath) {
      const { error } = await supabaseAdmin.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .remove([storagePath]);
      if (error) {
        console.error('[image-gen] Storage delete warning:', error.message);
      }
    }

    // Delete from DB
    await dbPool.query(`DELETE FROM ${IMAGE_HISTORY_TABLE} WHERE id = $1 AND user_id = $2;`, [itemId, req.authUser.id]);

    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('[image-gen] Error deleting history item:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to delete image' });
  }
});

app.post('/api/settings/pollo/generate', async (req, res) => {
  const startedAt = Date.now();
  const modelPath = typeof req.body?.modelPath === 'string' ? req.body.modelPath.trim() : '';
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : '';
  const webhookUrl = typeof req.body?.webhookUrl === 'string' ? req.body.webhookUrl.trim() : '';
  const size = normalizeImageSize(req.body?.size);
  const waitForResult = req.body?.waitForResult !== false;
  const timeoutMsCandidate = Number.parseInt(String(req.body?.timeoutMs ?? ''), 10);
  const timeoutMs = Number.isFinite(timeoutMsCandidate)
    ? Math.min(600000, Math.max(15000, timeoutMsCandidate))
    : 180000;
  const lengthCandidate = Number.parseInt(String(req.body?.length ?? ''), 10);
  const seedCandidate = Number.parseInt(String(req.body?.seed ?? ''), 10);
  const length = Number.isFinite(lengthCandidate) ? lengthCandidate : null;
  const seed = Number.isFinite(seedCandidate) ? seedCandidate : null;

  if (!modelPath) {
    return res.status(400).json({ success: false, error: 'modelPath is required' });
  }

  if (!prompt && !imageUrl) {
    return res.status(400).json({ success: false, error: 'prompt หรือ imageUrl ต้องมีอย่างน้อยหนึ่งรายการ' });
  }

  try {
    const keys = await readStoredKeys(req.authUser.id);
    const polloApiKey = getProviderKey(keys, 'pollo');
    if (!polloApiKey) {
      return res.status(400).json({
        success: false,
        error: 'ยังไม่ได้ใส่ API key สำหรับ pollo'
      });
    }

    const { aspectRatio, resolution } = mapImageSizeToPolloSettings(size);
    const input = {};

    if (imageUrl) {
      input.image = imageUrl;
      if (prompt) input.prompt = prompt;
    } else {
      input.prompt = prompt;
      input.resolution = resolution;
      input.aspectRatio = aspectRatio;
    }

    if (length != null && [5, 10].includes(length)) input.length = length;
    if (seed != null) input.seed = seed;

    const created = await requestPolloGeneration({
      apiKey: polloApiKey,
      modelPath,
      input,
      webhookUrl: webhookUrl || undefined
    });

    if (!waitForResult) {
      return res.json({
        success: true,
        data: {
          provider: 'pollo',
          modelPath,
          taskId: created?.taskId || null,
          status: created?.status || null,
          latencyMs: Date.now() - startedAt
        }
      });
    }

    const taskId = created?.taskId;
    if (!taskId) {
      return res.status(502).json({
        success: false,
        error: 'Pollo ไม่ส่ง taskId กลับมา'
      });
    }

    const deadline = Date.now() + timeoutMs;
    let latest = null;
    while (Date.now() < deadline) {
      latest = await requestPolloTaskStatus({ apiKey: polloApiKey, taskId });
      const generation = Array.isArray(latest?.generations) ? latest.generations[0] : null;
      const status = String(generation?.status || created?.status || '').toLowerCase();

      if (status === 'succeed') {
        const mediaUrl = String(generation?.url || '').trim();
        const mediaType = String(generation?.mediaType || '').toLowerCase() === 'video' ? 'video' : 'image';
        let persisted = [];
        if (mediaUrl) {
          persisted = await persistImageGenerationHistory({
            userId: req.authUser.id,
            provider: 'pollo',
            model: modelPath,
            prompt: prompt || '(image input)',
            size,
            items: [{ url: mediaUrl, mediaType }],
            latencyMs: Date.now() - startedAt
          });
        }

        return res.json({
          success: true,
          data: {
            provider: 'pollo',
            modelPath,
            taskId,
            status,
            generation: generation || null,
            images: persisted,
            latencyMs: Date.now() - startedAt
          }
        });
      }

      if (status === 'failed') {
        return res.status(502).json({
          success: false,
          error: generation?.failMsg || 'Pollo generation failed',
          data: {
            provider: 'pollo',
            modelPath,
            taskId,
            generation: generation || null
          }
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    return res.status(202).json({
      success: true,
      data: {
        provider: 'pollo',
        modelPath,
        taskId,
        status: 'processing',
        generation: Array.isArray(latest?.generations) ? latest.generations[0] : null,
        latencyMs: Date.now() - startedAt
      }
    });
  } catch (error) {
    const { status, message } = getRemoteError(error, 'Pollo generation failed');
    console.error('[isolated-ai-pages] Error in pollo/generate:', status, message);
    return res.status(status).json({ success: false, error: message });
  }
});

app.get('/api/settings/pollo/tasks/:taskId', async (req, res) => {
  const taskId = typeof req.params?.taskId === 'string' ? req.params.taskId.trim() : '';

  if (!taskId) {
    return res.status(400).json({ success: false, error: 'taskId is required' });
  }

  try {
    const keys = await readStoredKeys(req.authUser.id);
    const polloApiKey = getProviderKey(keys, 'pollo');
    if (!polloApiKey) {
      return res.status(400).json({
        success: false,
        error: 'ยังไม่ได้ใส่ API key สำหรับ pollo'
      });
    }

    const payload = await requestPolloTaskStatus({ apiKey: polloApiKey, taskId });
    return res.json({ success: true, data: payload });
  } catch (error) {
    const { status, message } = getRemoteError(error, 'ไม่สามารถอ่านสถานะงานจาก Pollo ได้');
    console.error('[isolated-ai-pages] Error in pollo/task-status:', status, message);
    return res.status(status).json({ success: false, error: message });
  }
});

app.post('/api/media/transcribe-summarize', async (req, res) => {
  try {
    await parseOptionalMediaUpload(req, res);
  } catch (error) {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: 'ไฟล์มีขนาดใหญ่เกินกำหนด (สูงสุด 200MB)'
        });
      }

      return res.status(400).json({
        success: false,
        error: error.message || 'ข้อมูลอัปโหลดไม่ถูกต้อง'
      });
    }

    const rawMessage = String(error?.message || '');
    const malformedMultipart = /boundary|unexpected end of form|multipart/i.test(rawMessage.toLowerCase());
    return res.status(400).json({
      success: false,
      error: malformedMultipart
        ? 'รูปแบบ multipart ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง'
        : 'ไม่สามารถอ่านข้อมูลอัปโหลดได้'
    });
  }

  const startedAt = Date.now();
  const mediaUrl = typeof req.body?.mediaUrl === 'string' ? req.body.mediaUrl.trim() : '';
  const manualTranscript = typeof req.body?.manualTranscript === 'string' ? req.body.manualTranscript.trim() : '';
  const transcriptionProvider = typeof req.body?.transcriptionProvider === 'string' ? req.body.transcriptionProvider.trim().toLowerCase() : 'groq';
  const transcriptionModelRaw = typeof req.body?.transcriptionModel === 'string' ? req.body.transcriptionModel.trim() : '';
  const summaryProvider = typeof req.body?.summaryProvider === 'string' ? req.body.summaryProvider.trim().toLowerCase() : 'gemini';
  const summaryModelRaw = typeof req.body?.summaryModel === 'string' ? req.body.summaryModel.trim() : '';
  const summaryStyle = typeof req.body?.summaryStyle === 'string' ? req.body.summaryStyle.trim().toLowerCase() : 'bullet';
  const summaryLanguage = typeof req.body?.summaryLanguage === 'string' ? req.body.summaryLanguage.trim().toLowerCase() : 'th';
  const transcriptionLanguageRaw = typeof req.body?.transcriptionLanguage === 'string' ? req.body.transcriptionLanguage : '';
  const transcriptionPrompt = typeof req.body?.transcriptionPrompt === 'string' ? req.body.transcriptionPrompt.trim() : '';
  const transcriptionLanguage = normalizeLanguageHint(transcriptionLanguageRaw);
  const captionLanguageHint = transcriptionLanguage || summaryLanguage;

  if ((!req.file || !req.file.buffer || req.file.buffer.length === 0) && !mediaUrl && !manualTranscript) {
    return res.status(400).json({ success: false, error: 'กรุณาอัปโหลดไฟล์ หรือระบุ Media URL หรือวาง transcript เอง' });
  }

  if (!openAiCompatibleTranscriptionProviders.includes(transcriptionProvider)) {
    return res.status(400).json({
      success: false,
      error: 'transcriptionProvider ต้องเป็น openrouter, groq หรือ aimlapi'
    });
  }

  if (!allowedProviders.includes(summaryProvider)) {
    return res.status(400).json({
      success: false,
      error: 'summaryProvider ไม่ถูกต้อง'
    });
  }

  const transcriptionModel = transcriptionModelRaw || 'whisper-large-v3-turbo';
  const summaryModel = summaryModelRaw || (summaryProvider === 'gemini' ? 'gemini-2.0-flash' : '');

  if (!summaryModel) {
    return res.status(400).json({
      success: false,
      error: 'กรุณาระบุ summaryModel'
    });
  }

  try {
    let mediaSource = req.file;
    const usingYoutubeTranscript = !mediaSource?.buffer && isYouTubeUrl(mediaUrl);

    if (!mediaSource?.buffer && mediaUrl && !usingYoutubeTranscript) {
      mediaSource = await loadMediaFromUrl(mediaUrl);
    }

    const keys = await readStoredKeys(req.authUser.id);
    const summaryApiKey = getProviderKey(keys, summaryProvider);
    const transcriptionApiKey = getProviderKey(keys, transcriptionProvider);

    if (!manualTranscript && !usingYoutubeTranscript && !transcriptionApiKey) {
      return res.status(400).json({
        success: false,
        error: `ยังไม่ได้ใส่ API key สำหรับ ${transcriptionProvider}`
      });
    }

    if (!summaryApiKey) {
      return res.status(400).json({
        success: false,
        error: `ยังไม่ได้ใส่ API key สำหรับ ${summaryProvider}`
      });
    }

    let transcript = '';
    let resolvedTranscriptionProvider = transcriptionProvider;
    let resolvedTranscriptionModel = transcriptionModel;

    if (manualTranscript) {
      transcript = manualTranscript;
      resolvedTranscriptionProvider = 'manual-transcript';
      resolvedTranscriptionModel = 'manual-text';
    } else if (usingYoutubeTranscript) {
      try {
        transcript = await loadTranscriptFromYouTube(mediaUrl, captionLanguageHint);
        resolvedTranscriptionProvider = 'youtube-transcript';
        resolvedTranscriptionModel = `captions:${captionLanguageHint || 'auto'}`;
      } catch (error) {
        const transcriptError = mapYouTubeErrorMessage(error?.message || error);

        if (!transcriptionApiKey) {
          return res.status(400).json({
            success: false,
            error: `${transcriptError} และยังไม่ได้ใส่ API key สำหรับ ${transcriptionProvider} เพื่อ fallback ถอดเสียงจาก audio`
          });
        }

        let youtubeAudio;
        try {
          youtubeAudio = await downloadYouTubeAudio(mediaUrl);
        } catch (downloadError) {
          const downloadMessage = mapYouTubeErrorMessage(downloadError?.message || downloadError);
          const fallbackMessage = downloadMessage === transcriptError
            ? 'ไม่สามารถดึง audio จาก YouTube เพื่อถอดเสียงอัตโนมัติได้'
            : downloadMessage;
          return res.status(400).json({
            success: false,
            error: `${transcriptError} และ ${fallbackMessage}`
          });
        }

        mediaSource = youtubeAudio;
        const transcribed = await transcribeWithOpenAiCompatibleProvider({
          provider: transcriptionProvider,
          apiKey: transcriptionApiKey,
          model: transcriptionModel,
          fileBuffer: mediaSource.buffer,
          originalName: mediaSource.originalname,
          mimeType: mediaSource.mimetype,
          language: transcriptionLanguage || undefined,
          prompt: transcriptionPrompt
        });
        transcript = (transcribed?.text || '').trim();
        resolvedTranscriptionProvider = `${transcriptionProvider} (youtube-audio)`;
        resolvedTranscriptionModel = transcriptionModel;
      }
    } else {
      const transcribed = await transcribeWithOpenAiCompatibleProvider({
        provider: transcriptionProvider,
        apiKey: transcriptionApiKey,
        model: transcriptionModel,
        fileBuffer: mediaSource.buffer,
        originalName: mediaSource.originalname,
        mimeType: mediaSource.mimetype,
        language: transcriptionLanguage || undefined,
        prompt: transcriptionPrompt
      });
      transcript = (transcribed?.text || '').trim();
    }

    if (!transcript) {
      return res.status(usingYoutubeTranscript ? 400 : 502).json({
        success: false,
        error: usingYoutubeTranscript
          ? 'ไม่พบ transcript/captions สำหรับวิดีโอ YouTube นี้'
          : 'ไม่สามารถดึงข้อความจากผลถอดเสียงได้'
      });
    }

    const summarized = await summarizeTranscriptWithProvider({
      provider: summaryProvider,
      model: summaryModel,
      apiKey: summaryApiKey,
      transcript,
      style: summaryStyle,
      language: summaryLanguage
    });

    return res.json({
      success: true,
      data: {
        fileName: mediaSource?.originalname || (manualTranscript ? 'manual-transcript' : usingYoutubeTranscript ? 'youtube-video' : null),
        fileSize: mediaSource?.size || null,
        mimeType: mediaSource?.mimetype || (manualTranscript ? 'text/plain' : usingYoutubeTranscript ? 'text/youtube-transcript' : null),
        mediaUrl: mediaUrl || null,
        transcriptionProvider: resolvedTranscriptionProvider,
        transcriptionModel: resolvedTranscriptionModel,
        summaryProvider,
        summaryModel,
        summaryStyle,
        summaryLanguage,
        transcript,
        summary: summarized.summary,
        chunks: summarized.chunks,
        latencyMs: Date.now() - startedAt
      }
    });
  } catch (error) {
    const { status, message } = getRemoteError(error, 'Transcribe/Summarize failed');
    console.error('[isolated-ai-pages] Error in media/transcribe-summarize:', status, message);
    return res.status(status).json({ success: false, error: message });
  }
});

// ==================== PROMPT LIBRARY API ====================

app.get('/api/prompt-library', async (req, res) => {
  try {
    const userId = req.authUser.id;
    const result = await dbPool.query(
      `
        SELECT id, name, description, category, text, starred, created_at, updated_at
        FROM ${PROMPT_LIBRARY_TABLE}
        WHERE user_id = $1
        ORDER BY updated_at DESC
      `,
      [userId]
    );

    return res.json({ success: true, data: { prompts: result.rows } });
  } catch (error) {
    console.error('[prompt-library] Error listing:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load prompts' });
  }
});

app.post('/api/prompt-library', async (req, res) => {
  try {
    const userId = req.authUser.id;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : 'Custom';
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const starred = !!req.body?.starred;

    if (!name || !text) {
      return res.status(400).json({ success: false, error: 'name and text are required' });
    }

    const id = crypto.randomUUID();
    const result = await dbPool.query(
      `
        INSERT INTO ${PROMPT_LIBRARY_TABLE}
          (id, user_id, name, description, category, text, starred)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, name, description, category, text, starred, created_at, updated_at
      `,
      [id, userId, name, description, category || 'Custom', text, starred]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[prompt-library] Error creating:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create prompt' });
  }
});

app.put('/api/prompt-library/:id', async (req, res) => {
  try {
    const userId = req.authUser.id;
    const promptId = req.params.id;
    const updates = [];
    const values = [];
    let index = 1;

    if (typeof req.body?.name === 'string') {
      updates.push(`name = $${index++}`);
      values.push(req.body.name.trim());
    }
    if (typeof req.body?.description === 'string') {
      updates.push(`description = $${index++}`);
      values.push(req.body.description.trim());
    }
    if (typeof req.body?.category === 'string') {
      updates.push(`category = $${index++}`);
      values.push(req.body.category.trim() || 'Custom');
    }
    if (typeof req.body?.text === 'string') {
      updates.push(`text = $${index++}`);
      values.push(req.body.text.trim());
    }
    if (typeof req.body?.starred !== 'undefined') {
      updates.push(`starred = $${index++}`);
      values.push(!!req.body.starred);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    values.push(promptId, userId);

    const result = await dbPool.query(
      `
        UPDATE ${PROMPT_LIBRARY_TABLE}
        SET ${updates.join(', ')}
        WHERE id = $${index++} AND user_id = $${index}
        RETURNING id, name, description, category, text, starred, created_at, updated_at
      `,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[prompt-library] Error updating:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update prompt' });
  }
});

app.delete('/api/prompt-library/:id', async (req, res) => {
  try {
    const userId = req.authUser.id;
    const promptId = req.params.id;
    const result = await dbPool.query(
      `
        DELETE FROM ${PROMPT_LIBRARY_TABLE}
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `,
      [promptId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }

    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('[prompt-library] Error deleting:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to delete prompt' });
  }
});

// ==================== AGENTS API ====================

app.get('/api/agents', async (req, res) => {
  try {
    const userId = req.authUser.id;
    const result = await dbPool.query(
      `
        SELECT id, name, emoji, description, system_prompt, provider, model, temperature, max_tokens, created_at, updated_at
        FROM ${AGENT_PROFILES_TABLE}
        WHERE user_id = $1
        ORDER BY updated_at DESC
      `,
      [userId]
    );

    return res.json({ success: true, data: { agents: result.rows } });
  } catch (error) {
    console.error('[agents] Error listing:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load agents' });
  }
});

app.post('/api/agents', async (req, res) => {
  try {
    const userId = req.authUser.id;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const emoji = typeof req.body?.emoji === 'string' && req.body.emoji.trim() ? req.body.emoji.trim() : '🤖';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const systemPrompt = typeof req.body?.systemPrompt === 'string' ? req.body.systemPrompt.trim() : '';
    const provider = typeof req.body?.provider === 'string' && req.body.provider.trim() ? req.body.provider.trim() : 'gemini';
    const model = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
    const temperature = Number.isFinite(Number(req.body?.temperature)) ? Number(req.body.temperature) : 0.7;
    const maxTokens = Number.isInteger(Number(req.body?.maxTokens)) ? Number(req.body.maxTokens) : 1024;

    if (!name || !systemPrompt) {
      return res.status(400).json({ success: false, error: 'name and systemPrompt are required' });
    }

    const id = crypto.randomUUID();
    const result = await dbPool.query(
      `
        INSERT INTO ${AGENT_PROFILES_TABLE}
          (id, user_id, name, emoji, description, system_prompt, provider, model, temperature, max_tokens)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, name, emoji, description, system_prompt, provider, model, temperature, max_tokens, created_at, updated_at
      `,
      [id, userId, name, emoji, description, systemPrompt, provider, model, temperature, maxTokens]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[agents] Error creating:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create agent' });
  }
});

app.put('/api/agents/:id', async (req, res) => {
  try {
    const userId = req.authUser.id;
    const agentId = req.params.id;
    const updates = [];
    const values = [];
    let index = 1;

    if (typeof req.body?.name === 'string') {
      updates.push(`name = $${index++}`);
      values.push(req.body.name.trim());
    }
    if (typeof req.body?.emoji === 'string') {
      updates.push(`emoji = $${index++}`);
      values.push(req.body.emoji.trim() || '🤖');
    }
    if (typeof req.body?.description === 'string') {
      updates.push(`description = $${index++}`);
      values.push(req.body.description.trim());
    }
    if (typeof req.body?.systemPrompt === 'string') {
      updates.push(`system_prompt = $${index++}`);
      values.push(req.body.systemPrompt.trim());
    }
    if (typeof req.body?.provider === 'string') {
      updates.push(`provider = $${index++}`);
      values.push(req.body.provider.trim() || 'gemini');
    }
    if (typeof req.body?.model === 'string') {
      updates.push(`model = $${index++}`);
      values.push(req.body.model.trim());
    }
    if (typeof req.body?.temperature !== 'undefined') {
      updates.push(`temperature = $${index++}`);
      values.push(Number.isFinite(Number(req.body.temperature)) ? Number(req.body.temperature) : 0.7);
    }
    if (typeof req.body?.maxTokens !== 'undefined') {
      updates.push(`max_tokens = $${index++}`);
      values.push(Number.isInteger(Number(req.body.maxTokens)) ? Number(req.body.maxTokens) : 1024);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    values.push(agentId, userId);

    const result = await dbPool.query(
      `
        UPDATE ${AGENT_PROFILES_TABLE}
        SET ${updates.join(', ')}
        WHERE id = $${index++} AND user_id = $${index}
        RETURNING id, name, emoji, description, system_prompt, provider, model, temperature, max_tokens, created_at, updated_at
      `,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[agents] Error updating:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update agent' });
  }
});

app.delete('/api/agents/:id', async (req, res) => {
  try {
    const userId = req.authUser.id;
    const agentId = req.params.id;
    const result = await dbPool.query(
      `
        DELETE FROM ${AGENT_PROFILES_TABLE}
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `,
      [agentId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('[agents] Error deleting:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to delete agent' });
  }
});

// ==================== CONVERSATION THREADS API ====================

// List all conversations (with pagination)
app.get('/api/conversations', async (req, res) => {
  try {
    const limit = Number.parseInt(String(req.query.limit ?? ''), 10) || 50;
    const offset = Number.parseInt(String(req.query.offset ?? ''), 10) || 0;
    const userId = req.authUser.id;

    const query = `
      SELECT 
        c.id,
        c.title,
        c.provider,
        c.model,
        c.agent_name,
        c.created_at,
        c.updated_at,
        COUNT(m.id)::int as message_count
      FROM ${CONVERSATIONS_TABLE} c
      LEFT JOIN ${MESSAGES_TABLE} m ON m.conversation_id = c.id
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.updated_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await dbPool.query(query, [userId, limit, offset]);
    const totalResult = await dbPool.query(
      `SELECT COUNT(*)::int AS total FROM ${CONVERSATIONS_TABLE} WHERE user_id = $1`,
      [userId]
    );
    const total = totalResult.rows[0]?.total ?? 0;

    res.json({
      success: true,
      data: {
        conversations: result.rows,
        total,
        limit,
        offset
      }
    });
  } catch (error) {
    console.error('[conversations] Error listing:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load conversations' });
  }
});

// Get conversation by ID with all messages
app.get('/api/conversations/:id', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const userId = req.authUser.id;

    // Get conversation
    const convQuery = `
      SELECT * FROM ${CONVERSATIONS_TABLE}
      WHERE id = $1 AND user_id = $2
    `;
    const convResult = await dbPool.query(convQuery, [conversationId, userId]);

    if (convResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Get messages
    const messagesQuery = `
      SELECT * FROM ${MESSAGES_TABLE}
      WHERE conversation_id = $1
        AND user_id = $2
      ORDER BY created_at ASC
    `;
    const messagesResult = await dbPool.query(messagesQuery, [conversationId, userId]);

    res.json({
      success: true,
      data: {
        conversation: convResult.rows[0],
        messages: messagesResult.rows
      }
    });
  } catch (error) {
    console.error('[conversations] Error getting conversation:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load conversation' });
  }
});

// Create new conversation
app.post('/api/conversations', async (req, res) => {
  try {
    const { title, provider, model, system_prompt, agent_name } = req.body;
    const userId = req.authUser.id;

    if (!title || !provider || !model) {
      return res.status(400).json({
        success: false,
        error: 'title, provider, and model are required'
      });
    }

    const conversationId = crypto.randomUUID();
    const query = `
      INSERT INTO ${CONVERSATIONS_TABLE}
        (id, user_id, title, provider, model, system_prompt, agent_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await dbPool.query(query, [
      conversationId,
      userId,
      title.trim(),
      provider.trim(),
      model.trim(),
      system_prompt || null,
      agent_name || null
    ]);

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('[conversations] Error creating:', error.message);
    res.status(500).json({ success: false, error: 'Failed to create conversation' });
  }
});

// Update conversation (title, system_prompt, etc.)
app.put('/api/conversations/:id', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const { title, system_prompt, agent_name } = req.body;
    const userId = req.authUser.id;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title.trim());
    }
    if (system_prompt !== undefined) {
      updates.push(`system_prompt = $${paramCount++}`);
      values.push(system_prompt || null);
    }
    if (agent_name !== undefined) {
      updates.push(`agent_name = $${paramCount++}`);
      values.push(agent_name || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    values.push(conversationId, userId);

    const query = `
      UPDATE ${CONVERSATIONS_TABLE}
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await dbPool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('[conversations] Error updating:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update conversation' });
  }
});

// Delete conversation
app.delete('/api/conversations/:id', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const userId = req.authUser.id;

    const query = `
      DELETE FROM ${CONVERSATIONS_TABLE}
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;

    const result = await dbPool.query(query, [conversationId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    res.json({
      success: true,
      message: 'Conversation deleted'
    });
  } catch (error) {
    console.error('[conversations] Error deleting:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete conversation' });
  }
});

// Add message to conversation
app.post('/api/messages', async (req, res) => {
  try {
    const { conversation_id, role, content, image_url, metadata } = req.body;
    const userId = req.authUser.id;

    if (!conversation_id || !role || !content) {
      return res.status(400).json({
        success: false,
        error: 'conversation_id, role, and content are required'
      });
    }

    if (!['user', 'assistant', 'system'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'role must be user, assistant, or system'
      });
    }

    const conversationExists = await dbPool.query(
      `SELECT id FROM ${CONVERSATIONS_TABLE} WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [conversation_id, userId]
    );

    if (conversationExists.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Insert message
    const messageId = crypto.randomUUID();
    const insertQuery = `
      INSERT INTO ${MESSAGES_TABLE}
        (id, user_id, conversation_id, role, content, image_url, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await dbPool.query(insertQuery, [
      messageId,
      userId,
      conversation_id,
      role,
      content.trim(),
      image_url || null,
      metadata || {}
    ]);

    // Update conversation's updated_at
    await dbPool.query(`
      UPDATE ${CONVERSATIONS_TABLE}
      SET updated_at = NOW()
      WHERE id = $1 AND user_id = $2
    `, [conversation_id, userId]);

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('[messages] Error adding:', error.message);
    res.status(500).json({ success: false, error: 'Failed to add message' });
  }
});

// Upload image to Supabase Storage
app.post('/api/upload-image', async (req, res) => {
  try {
    const { conversation_id, base64_image, filename } = req.body;
    const userId = req.authUser.id;

    if (!conversation_id || !base64_image || !filename) {
      return res.status(400).json({
        success: false,
        error: 'conversation_id, base64_image, and filename are required'
      });
    }

    const conversationExists = await dbPool.query(
      `SELECT id FROM ${CONVERSATIONS_TABLE} WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [conversation_id, userId]
    );

    if (conversationExists.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Decode base64
    const matches = base64_image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({
        success: false,
        error: 'Invalid base64 image format'
      });
    }

    const contentType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    // Create unique filename
    const timestamp = Date.now();
    const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const safeUser = String(userId).replace(/[^a-zA-Z0-9-]/g, '_');
    const storagePath = `chat-images/${safeUser}/${conversation_id}/${timestamp}_${safeName}`;

    // Upload to Supabase Storage
    const { error } = await supabaseAdmin.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: false
      });

    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    res.status(201).json({
      success: true,
      data: {
        url: urlData.publicUrl,
        path: storagePath
      }
    });
  } catch (error) {
    console.error('[upload] Error uploading image:', error.message);
    res.status(500).json({ success: false, error: 'Failed to upload image' });
  }
});

// ==================== END CONVERSATION API ====================

function startImageHistoryCleanupJob() {
  setInterval(async () => {
    try {
      const removed = await cleanupExpiredImageGenerationHistory();
      if (removed > 0) {
        console.log(`[image-gen] Cleanup removed ${removed} expired record(s)`);
      }
    } catch (error) {
      console.error('[image-gen] Cleanup failed:', error.message);
    }
  }, IMAGE_GEN_CLEANUP_INTERVAL_MS);
}

async function bootstrap() {
  await store.init();
  await ensureImageGenerationHistorySchema();
  await ensureConversationSchema();
  await ensureLibrarySchema();
  await ensureRealtimePublication();
  await cleanupExpiredImageGenerationHistory();
  startImageHistoryCleanupJob();
  app.listen(PORT, () => {
    console.log(`Isolated AI backend running on http://localhost:${PORT}`);
    console.log(`Supabase schema: ${SUPABASE_DB_SCHEMA}`);
    console.log(`Supabase storage: ${SUPABASE_STORAGE_BUCKET}/${SUPABASE_STORAGE_FOLDER}`);
    console.log(`Image history retention: ${IMAGE_GEN_RETENTION_DAYS} day(s)`);
  }).on('listening', function () {
    // Allow long-running media transcribe/summarize requests (10 minutes)
    this.requestTimeout = 10 * 60 * 1000;
    this.headersTimeout = 65 * 1000;
    this.keepAliveTimeout = 10 * 60 * 1000;
  });
}

bootstrap().catch((error) => {
  console.error('[isolated-ai-pages] Bootstrap failed:', error.message);
  process.exit(1);
});
