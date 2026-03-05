
import { useEffect, useState } from 'react';
import toast from "react-hot-toast";
import type { ApiResponse } from "../types";
import { get, post, put } from "../services/api";
import { subscribeDataSync } from '../lib/dataSync';

type ProviderId =
  | "gemini"
  | "openrouter"
  | "groq"
  | "aimlapi"
  | "huggingface"
  | "pollinations"
  | "replicate"
  | "pollo"
  | "bfl"
  | "renderful"
  | "kie"
  | "fal";

interface ApiSettingsResponse {
  geminiApiKey?: string | null;
  hasGeminiKey?: boolean;
  openrouterApiKey?: string | null;
  hasOpenrouterKey?: boolean;
  groqApiKey?: string | null;
  hasGroqKey?: boolean;
  aimlapiApiKey?: string | null;
  hasAimlapiKey?: boolean;
  huggingfaceApiKey?: string | null;
  hasHuggingfaceKey?: boolean;
  pollinationsApiKey?: string | null;
  hasPollinationsKey?: boolean;
  replicateApiKey?: string | null;
  hasReplicateKey?: boolean;
  polloApiKey?: string | null;
  hasPolloKey?: boolean;
  bflApiKey?: string | null;
  hasBflKey?: boolean;
  renderfulApiKey?: string | null;
  hasRenderfulKey?: boolean;
  kieApiKey?: string | null;
  hasKieKey?: boolean;
  falApiKey?: string | null;
  hasFalKey?: boolean;
}

interface RevealApiKeysResponse {
  geminiApiKey?: string | null;
  openrouterApiKey?: string | null;
  groqApiKey?: string | null;
  aimlapiApiKey?: string | null;
  huggingfaceApiKey?: string | null;
  pollinationsApiKey?: string | null;
  replicateApiKey?: string | null;
  polloApiKey?: string | null;
  bflApiKey?: string | null;
  renderfulApiKey?: string | null;
  kieApiKey?: string | null;
  falApiKey?: string | null;
}

type StoredKeyState = {
  hasKey: boolean;
  maskedValue?: string | null;
};

const providerMeta: Record<ProviderId, {
  title: string;
  subtitle: string;
  icon: string;
  iconBg: string;
  iconText: string;
  placeholder: string;
}> = {
  gemini: {
    title: "Google Gemini API",
    subtitle: "สำหรับใช้งาน Gemini Pro, Flash",
    icon: "bi-stars",
    iconBg: "bg-blue-50",
    iconText: "text-blue-600",
    placeholder: "AIza..."
  },
  openrouter: {
    title: "OpenRouter API",
    subtitle: "เชื่อมต่อกับ OpenRouter-hosted models",
    icon: "bi-clouds",
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-600",
    placeholder: "or-..."
  },
  groq: {
    title: "Groq AI API",
    subtitle: "ใช้งาน Groq LLMs ที่มี latency ต่ำ",
    icon: "bi-lightning-charge",
    iconBg: "bg-amber-50",
    iconText: "text-orange-600",
    placeholder: "gr-..."
  },
  aimlapi: {
    title: "Aimlapi API",
    subtitle: "ใช้ API จาก Aimlapi สำหรับโมเดลเสริม",
    icon: "bi-lightning-charge-fill",
    iconBg: "bg-purple-50",
    iconText: "text-purple-600",
    placeholder: "aiml-..."
  },
  huggingface: {
    title: "Hugging Face API",
    subtitle: "HF Inference API token",
    icon: "bi-cpu",
    iconBg: "bg-cyan-50",
    iconText: "text-cyan-700",
    placeholder: "hf_..."
  },
  pollinations: {
    title: "Pollinations API",
    subtitle: "Text-to-image endpoint",
    icon: "bi-palette",
    iconBg: "bg-rose-50",
    iconText: "text-rose-600",
    placeholder: "sk_..."
  },
  replicate: {
    title: "Replicate API",
    subtitle: "Prediction API (async generation)",
    icon: "bi-hdd-network",
    iconBg: "bg-indigo-50",
    iconText: "text-indigo-600",
    placeholder: "r8_..."
  },
  pollo: {
    title: "Pollo API",
    subtitle: "Task-based generation",
    icon: "bi-film",
    iconBg: "bg-amber-50",
    iconText: "text-amber-700",
    placeholder: "pollo_..."
  },
  bfl: {
    title: "BFL (Black Forest Labs)",
    subtitle: "FLUX image models (async polling)",
    icon: "bi-brush",
    iconBg: "bg-slate-50",
    iconText: "text-slate-700",
    placeholder: "bfl_..."
  },
  renderful: {
    title: "Renderful API",
    subtitle: "Unified API — FLUX, Seedream, GPT Image & more",
    icon: "bi-diagram-3",
    iconBg: "bg-violet-50",
    iconText: "text-violet-600",
    placeholder: "sk_..."
  },
  kie: {
    title: "Kie.ai API",
    subtitle: "4o Image, FLUX Kontext, Imagen4, Seedream & more",
    icon: "bi-palette2",
    iconBg: "bg-pink-50",
    iconText: "text-pink-600",
    placeholder: "0cf0..."
  },
  fal: {
    title: "fal.ai API",
    subtitle: "FLUX, Recraft, Nano Banana, Qwen Image & more",
    icon: "bi-gpu-card",
    iconBg: "bg-lime-50",
    iconText: "text-lime-700",
    placeholder: "xxxxxxxx-xxxx:xxxx..."
  }
};

const providerOrder: ProviderId[] = [
  "gemini",
  "openrouter",
  "groq",
  "aimlapi",
  "huggingface",
  "pollinations",
  "replicate",
  "pollo",
  "bfl",
  "renderful",
  "kie",
  "fal"
];

const buildEmptyFormValues = (): Record<ProviderId, string> => ({
  gemini: "",
  openrouter: "",
  groq: "",
  aimlapi: "",
  huggingface: "",
  pollinations: "",
  replicate: "",
  pollo: "",
  bfl: "",
  renderful: "",
  kie: "",
  fal: ""
});

const buildInitialStoredKeys = (): Record<ProviderId, StoredKeyState> => ({
  gemini: { hasKey: false, maskedValue: null },
  openrouter: { hasKey: false, maskedValue: null },
  groq: { hasKey: false, maskedValue: null },
  aimlapi: { hasKey: false, maskedValue: null },
  huggingface: { hasKey: false, maskedValue: null },
  pollinations: { hasKey: false, maskedValue: null },
  replicate: { hasKey: false, maskedValue: null },
  pollo: { hasKey: false, maskedValue: null },
  bfl: { hasKey: false, maskedValue: null },
  renderful: { hasKey: false, maskedValue: null },
  kie: { hasKey: false, maskedValue: null },
  fal: { hasKey: false, maskedValue: null }
});

const buildInitialShowState = (): Record<ProviderId, boolean> =>
  providerOrder.reduce((acc, provider) => ({ ...acc, [provider]: false }), {} as Record<ProviderId, boolean>);

const buildInitialRevealedKeys = (): Record<ProviderId, string | null> => ({
  gemini: null,
  openrouter: null,
  groq: null,
  aimlapi: null,
  huggingface: null,
  pollinations: null,
  replicate: null,
  pollo: null,
  bfl: null,
  renderful: null,
  kie: null,
  fal: null
});

const buildInitialRevealLoading = (): Record<ProviderId, boolean> =>
  providerOrder.reduce((acc, provider) => ({ ...acc, [provider]: false }), {} as Record<ProviderId, boolean>);

const mapResponseToKeys = (data?: ApiSettingsResponse): Record<ProviderId, StoredKeyState> => ({
  gemini: { hasKey: !!data?.hasGeminiKey, maskedValue: data?.geminiApiKey ?? null },
  openrouter: { hasKey: !!data?.hasOpenrouterKey, maskedValue: data?.openrouterApiKey ?? null },
  groq: { hasKey: !!data?.hasGroqKey, maskedValue: data?.groqApiKey ?? null },
  aimlapi: { hasKey: !!data?.hasAimlapiKey, maskedValue: data?.aimlapiApiKey ?? null },
  huggingface: { hasKey: !!data?.hasHuggingfaceKey, maskedValue: data?.huggingfaceApiKey ?? null },
  pollinations: { hasKey: !!data?.hasPollinationsKey, maskedValue: data?.pollinationsApiKey ?? null },
  replicate: { hasKey: !!data?.hasReplicateKey, maskedValue: data?.replicateApiKey ?? null },
  pollo: { hasKey: !!data?.hasPolloKey, maskedValue: data?.polloApiKey ?? null },
  bfl: { hasKey: !!data?.hasBflKey, maskedValue: data?.bflApiKey ?? null },
  renderful: { hasKey: !!data?.hasRenderfulKey, maskedValue: data?.renderfulApiKey ?? null },
  kie: { hasKey: !!data?.hasKieKey, maskedValue: data?.kieApiKey ?? null },
  fal: { hasKey: !!data?.hasFalKey, maskedValue: data?.falApiKey ?? null }
});

type ApiKeyFormCardProps = {
  provider: ProviderId;
  value: string;
  displayValue: string;
  showKey: boolean;
  isRevealing: boolean;
  onChange: (value: string) => void;
  onToggleShow: () => void;
  metadata: StoredKeyState;
};

function ApiKeyFormCard({ provider, value, displayValue, showKey, isRevealing, onChange, onToggleShow, metadata }: ApiKeyFormCardProps) {
  const meta = providerMeta[provider];
  const badgeText = metadata.hasKey ? "บันทึกแล้ว" : "ยังไม่ได้ใส่";
  const badgeClass = metadata.hasKey ? "badge badge-success" : "badge bg-gray-100 text-gray-600";
  const placeholder = isRevealing ? "กำลังโหลด..." : (metadata.maskedValue || meta.placeholder);
  const canToggleShow = !!value || metadata.hasKey;

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${meta.iconBg} flex items-center justify-center`}>
            <i className={`bi ${meta.icon} ${meta.iconText} text-xl`}></i>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">{meta.title}</h3>
            <p className="text-xs text-gray-500">{meta.subtitle}</p>
          </div>
        </div>
        <span className={badgeClass}>{badgeText}</span>
      </div>

      <div className="relative">
        <input
          type={showKey ? "text" : "password"}
          value={displayValue}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="input-field pr-10"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={onToggleShow}
          disabled={!canToggleShow || isRevealing}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label={showKey ? "ซ่อน API key" : "แสดง API key"}
        >
          <i className={`bi ${isRevealing ? "bi-arrow-repeat animate-spin" : (showKey ? "bi-eye-slash" : "bi-eye")}`}></i>
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-2">
        {metadata.hasKey
          ? `Key ที่บันทึก: ${showKey && displayValue ? displayValue : (metadata.maskedValue ?? "ตั้งค่าแล้ว")}`
          : (displayValue ? "ยังไม่ได้บันทึก (กรุณากด “บันทึก API Keys”)" : "ยังไม่ได้ใส่ API key")}
      </p>
    </div>
  );
}

export default function ApiSettings() {
  const [formValues, setFormValues] = useState<Record<ProviderId, string>>(() => buildEmptyFormValues());
  const [storedKeys, setStoredKeys] = useState<Record<ProviderId, StoredKeyState>>(() => buildInitialStoredKeys());
  const [showKeys, setShowKeys] = useState<Record<ProviderId, boolean>>(() => buildInitialShowState());
  const [revealedKeys, setRevealedKeys] = useState<Record<ProviderId, string | null>>(() => buildInitialRevealedKeys());
  const [isRevealing, setIsRevealing] = useState<Record<ProviderId, boolean>>(() => buildInitialRevealLoading());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncTick, setSyncTick] = useState(0);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const response = await get<ApiResponse<ApiSettingsResponse>>("/api/settings");

      if (!response.success || !response.data) {
        const message = response.error || "ไม่สามารถโหลดข้อมูล API Keys ได้";
        setLoadError(message);
        toast.error(message);
        return;
      }

      setStoredKeys(mapResponseToKeys(response.data));
      setRevealedKeys(buildInitialRevealedKeys());
      setIsRevealing(buildInitialRevealLoading());
    } catch (error: any) {
      const message = error?.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล";
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeDataSync(() => {
      setSyncTick((prev) => prev + 1);
    }, { topics: ['settings'] });
    return unsubscribe;
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [syncTick]);

  const handleInputChange = (provider: ProviderId, value: string) => {
    setFormValues((prev) => ({ ...prev, [provider]: value }));
    if (revealedKeys[provider] && value.trim() !== revealedKeys[provider]) {
      setRevealedKeys((prev) => ({ ...prev, [provider]: null }));
    }
  };

  const revealProviderKey = async (provider: ProviderId) => {
    if (!storedKeys[provider].hasKey) {
      return null;
    }

    if (revealedKeys[provider]) {
      return revealedKeys[provider];
    }

    setIsRevealing((prev) => ({ ...prev, [provider]: true }));
    try {
      const providerFieldMap: Record<ProviderId, keyof RevealApiKeysResponse> = {
        gemini: "geminiApiKey",
        openrouter: "openrouterApiKey",
        groq: "groqApiKey",
        aimlapi: "aimlapiApiKey",
        huggingface: "huggingfaceApiKey",
        pollinations: "pollinationsApiKey",
        replicate: "replicateApiKey",
        pollo: "polloApiKey",
        bfl: "bflApiKey",
        renderful: "renderfulApiKey",
        kie: "kieApiKey",
        fal: "falApiKey"
      };

      const response = await post<ApiResponse<RevealApiKeysResponse>>("/api/settings/api-keys/reveal", {
        providers: [provider]
      });

      if (!response.success) {
        throw new Error(response.error || "ไม่สามารถดึง API key เพื่อแสดงผลได้");
      }

      const revealed = response.data?.[providerFieldMap[provider]] ?? null;
      setRevealedKeys((prev) => ({ ...prev, [provider]: revealed }));
      return revealed;
    } finally {
      setIsRevealing((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const toggleShowKey = async (provider: ProviderId) => {
    const nextShow = !showKeys[provider];
    setShowKeys((prev) => ({ ...prev, [provider]: nextShow }));

    if (!nextShow) {
      return;
    }

    // ถ้ามีค่าที่ผู้ใช้พิมพ์อยู่แล้ว แค่สลับ password/text ก็พอ
    if (formValues[provider].trim()) {
      return;
    }

    // ถ้ามี key ที่บันทึกไว้ ให้ดึงแบบ decrypted มาแสดง
    if (storedKeys[provider].hasKey && !revealedKeys[provider]) {
      try {
        const revealed = await revealProviderKey(provider);
        if (!revealed) {
          toast.error("ยังไม่ได้ใส่ API key");
        }
      } catch (error: any) {
        toast.error(error?.message || "ไม่สามารถแสดง API key ได้");
        setShowKeys((prev) => ({ ...prev, [provider]: false }));
      }
    }
  };

  const handleSave = async () => {
    const payload: Record<string, string> = {};

    providerOrder.forEach((provider) => {
      const trimmed = formValues[provider].trim();
      if (trimmed) {
        payload[`${provider}ApiKey`] = trimmed;
      }
    });

    if (!Object.keys(payload).length) {
      toast.error("กรุณากรอก API key อย่างน้อยหนึ่งรายการ");
      return;
    }

    try {
      setIsSaving(true);
      const result = await put<ApiResponse>("/api/settings/api-keys", payload);
      if (!result.success) {
        throw new Error(result.error || "ไม่สามารถบันทึก API Keys ได้");
      }
      toast.success(result.message || "บันทึก API Keys เรียบร้อย");
      setFormValues(buildEmptyFormValues());
      await loadSettings();
    } catch (error: any) {
      const message = error?.message || "เกิดข้อผิดพลาดในการบันทึก";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500"></span>
          <span>กำลังโหลดการตั้งค่า...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="flex flex-col gap-2 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700 md:flex-row md:items-center md:justify-between">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={loadSettings}
            className="text-rose-600 font-medium text-xs hover:text-rose-800 transition-colors"
          >
            ลองอีกครั้ง
          </button>
        </div>
      )}

      <div className="space-y-4">
        {/* OpenAI (ยังไม่รองรับการบันทึกในระบบนี้) */}
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <i className="bi bi-robot text-green-600 text-xl"></i>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">OpenAI API</h3>
                <p className="text-xs text-gray-500">สำหรับใช้งาน GPT-3.5, GPT-4</p>
              </div>
            </div>
            <span className="badge bg-gray-100 text-gray-600">ยังไม่ได้ใส่</span>
          </div>

          <div className="relative">
            <input
              type="password"
              className="input-field pr-10"
              placeholder="sk-..."
              value=""
              disabled
            />
            <button
              type="button"
              disabled
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <i className="bi bi-eye"></i>
            </button>
          </div>

          <p className="text-xs text-gray-500 mt-2">
            ยังไม่ได้ใส่ (หน้านี้บันทึก Gemini / OpenRouter / Groq / Aimlapi / Hugging Face / Pollinations / Replicate / Pollo / BFL)
          </p>
        </div>

        {providerOrder.map((provider) => (
          <ApiKeyFormCard
            key={provider}
            provider={provider}
            value={formValues[provider]}
            displayValue={formValues[provider] || (showKeys[provider] ? (revealedKeys[provider] ?? "") : "")}
            showKey={showKeys[provider]}
            isRevealing={isRevealing[provider]}
            onChange={(value) => handleInputChange(provider, value)}
            onToggleShow={() => { void toggleShowKey(provider); }}
            metadata={storedKeys[provider]}
          />
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="btn-primary flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
              <span>กำลังบันทึก...</span>
            </>
          ) : (
            <>
              <i className="bi bi-save"></i>
              <span>บันทึก API Keys</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
