import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import PageHeader from '../components/PageHeader';
import { post } from '../services/api';
import type { ApiResponse } from '../types';

type TranscriptionProvider = 'groq' | 'openrouter' | 'aimlapi';
type SummaryProvider = 'gemini' | 'openrouter' | 'groq' | 'aimlapi';

interface SummarizeResult {
  fileName: string;
  fileSize: number;
  mimeType: string;
  transcriptionProvider: string;
  transcriptionModel: string;
  summaryProvider: string;
  summaryModel: string;
  summaryStyle: string;
  summaryLanguage: string;
  transcript: string;
  summary: string;
  chunks: number;
  latencyMs?: number;
}

const transcriptionModelOptions: Record<TranscriptionProvider, string[]> = {
  groq: ['whisper-large-v3-turbo', 'whisper-large-v3'],
  openrouter: ['openai/whisper-1', 'openai/gpt-4o-mini-transcribe'],
  aimlapi: ['whisper-1', 'gpt-4o-mini-transcribe']
};

const summaryProviderOptions: Array<{ id: SummaryProvider; label: string }> = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'groq', label: 'Groq' },
  { id: 'aimlapi', label: 'Aimlapi' }
];

const summaryStyleOptions = [
  { id: 'bullet', label: 'Bullet Points' },
  { id: 'tldr', label: 'TL;DR' },
  { id: 'chapter', label: 'Chapter + Topic' },
  { id: 'action', label: 'Action Items' }
];

export default function MediaSummarizePage() {
  const [inputMode, setInputMode] = useState<'file' | 'url'>('url');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [manualTranscript, setManualTranscript] = useState<string>('');
  const [transcriptionProvider, setTranscriptionProvider] = useState<TranscriptionProvider>('groq');
  const [transcriptionModel, setTranscriptionModel] = useState<string>('whisper-large-v3-turbo');
  const [summaryProvider, setSummaryProvider] = useState<SummaryProvider>('gemini');
  const [summaryModel, setSummaryModel] = useState<string>('gemini-2.5-flash');
  const [summaryStyle, setSummaryStyle] = useState<string>('bullet');
  const [summaryLanguage, setSummaryLanguage] = useState<string>('th');
  const [transcriptionPrompt, setTranscriptionPrompt] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<SummarizeResult | null>(null);

  const suggestedModels = useMemo(() => transcriptionModelOptions[transcriptionProvider], [transcriptionProvider]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isProcessing) return;
    if (inputMode === 'file' && !mediaFile) {
      toast.error('กรุณาเลือกไฟล์ก่อน');
      return;
    }
    if (inputMode === 'url' && !mediaUrl.trim() && !manualTranscript.trim()) {
      toast.error('กรุณาระบุ Media URL หรือวาง Transcript');
      return;
    }

    try {
      setIsProcessing(true);
      setResult(null);

      const formData = new FormData();
      if (inputMode === 'file' && mediaFile) {
        formData.append('media', mediaFile);
      }
      if (inputMode === 'url') {
        formData.append('mediaUrl', mediaUrl.trim());
        if (manualTranscript.trim()) {
          formData.append('manualTranscript', manualTranscript.trim());
        }
      }
      formData.append('transcriptionProvider', transcriptionProvider);
      formData.append('transcriptionModel', transcriptionModel.trim());
      formData.append('summaryProvider', summaryProvider);
      formData.append('summaryModel', summaryModel.trim());
      formData.append('summaryStyle', summaryStyle);
      formData.append('summaryLanguage', summaryLanguage.trim() || 'th');
      if (transcriptionPrompt.trim()) {
        formData.append('transcriptionPrompt', transcriptionPrompt.trim());
      }

      const response = await post<ApiResponse<SummarizeResult>>('/api/media/transcribe-summarize', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 600000
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'ไม่สามารถประมวลผลได้');
      }

      setResult(response.data);
      toast.success('ถอดเสียงและสรุปสำเร็จ');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'เกิดข้อผิดพลาดระหว่างประมวลผล';
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Video/Audio Summarize"
        description="อัปโหลดไฟล์เสียงหรือวิดีโอ แล้วให้ AI ถอดเสียงและสรุปให้อัตโนมัติ"
      />

      <form onSubmit={onSubmit} className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4 xl:sticky xl:top-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Input Source</h3>
                <p className="text-xs text-gray-500 mt-0.5">เลือกไฟล์หรือ URL เพื่อเริ่มถอดเสียง</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold px-2.5 py-1">
                Step 1
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setInputMode('file')}
                className={`px-3 py-2 rounded-xl border text-sm font-medium transition ${
                  inputMode === 'file'
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <i className="bi bi-upload mr-1.5"></i>
                Upload File
              </button>
              <button
                type="button"
                onClick={() => setInputMode('url')}
                className={`px-3 py-2 rounded-xl border text-sm font-medium transition ${
                  inputMode === 'url'
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <i className="bi bi-link-45deg mr-1.5"></i>
                Media URL
              </button>
            </div>

            {inputMode === 'file' ? (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700 mb-1 block">ไฟล์สื่อ</label>
                <input
                  type="file"
                  accept="audio/*,video/*"
                  onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2"
                />
                {mediaFile ? (
                  <p className="text-xs text-gray-600 rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-2">
                    {mediaFile.name} ({(mediaFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">รองรับไฟล์เสียงและวิดีโอทุกไฟล์หลัก</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Media URL</label>
                <input
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://.../podcast.mp3 หรือ https://.../video.mp4"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2"
                />
                <p className="text-xs text-gray-500">
                  รองรับ URL ไฟล์ตรง (mp3/mp4) และ YouTube URL (ต้องมี captions/transcript)
                </p>
                <label className="text-xs font-semibold text-gray-700 mt-1 mb-1 block">
                  หรือวาง Transcript เอง (optional)
                </label>
                <textarea
                  rows={4}
                  value={manualTranscript}
                  onChange={(e) => setManualTranscript(e.target.value)}
                  placeholder="วางข้อความ transcript ที่คัดลอกมาได้ เพื่อให้ระบบสรุปต่อทันที"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">ภาษาสรุป (summary language)</label>
              <input
                type="text"
                value={summaryLanguage}
                onChange={(e) => setSummaryLanguage(e.target.value)}
                placeholder="th, en, ja..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                ระบบถอดเสียงจะใช้ auto-detect เพื่อลดข้อความเพี้ยน และจะสรุปผลตามภาษาที่กำหนดในช่องนี้
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Transcription Hint (optional)</label>
              <textarea
                value={transcriptionPrompt}
                onChange={(e) => setTranscriptionPrompt(e.target.value)}
                rows={3}
                placeholder="คำเฉพาะ, ชื่อแบรนด์, ศัพท์เทคนิคที่อยากให้ถอดให้ตรง"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-semibold disabled:opacity-60 shadow-lg shadow-indigo-100"
            >
              {isProcessing ? (
                <>
                  <i className="bi bi-arrow-repeat animate-spin"></i>
                  กำลังประมวลผล...
                </>
              ) : (
                <>
                  <i className="bi bi-magic"></i>
                  ถอดเสียงและสรุป
                </>
              )}
            </button>
          </div>
        </div>

        <div className="xl:col-span-8 space-y-5">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">AI Pipeline</h3>
                <p className="text-xs text-gray-500 mt-0.5">ตั้งค่าโมเดลสำหรับถอดเสียงและสรุป</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold px-2.5 py-1">
                Step 2
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white p-4 space-y-3">
                <h4 className="text-sm font-semibold text-gray-900">Transcription</h4>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">Provider</label>
                  <select
                    value={transcriptionProvider}
                    onChange={(e) => {
                      const provider = e.target.value as TranscriptionProvider;
                      setTranscriptionProvider(provider);
                      setTranscriptionModel(transcriptionModelOptions[provider][0]);
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                  >
                    <option value="groq">Groq</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="aimlapi">Aimlapi</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">Model</label>
                  <input
                    list="transcription-model-options"
                    value={transcriptionModel}
                    onChange={(e) => setTranscriptionModel(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                  />
                  <datalist id="transcription-model-options">
                    {suggestedModels.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white p-4 space-y-3">
                <h4 className="text-sm font-semibold text-gray-900">Summary</h4>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">Provider</label>
                  <select
                    value={summaryProvider}
                    onChange={(e) => setSummaryProvider(e.target.value as SummaryProvider)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                  >
                    {summaryProviderOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">Model</label>
                  <input
                    value={summaryModel}
                    onChange={(e) => setSummaryModel(e.target.value)}
                    placeholder="เช่น gemini-2.5-flash"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">รูปแบบสรุป</label>
                  <select
                    value={summaryStyle}
                    onChange={(e) => setSummaryStyle(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                  >
                    {summaryStyleOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Summary & Transcript</h3>
                <p className="text-xs text-gray-500 mt-0.5">ผลลัพธ์จะแสดงทางด้านขวาหลังประมวลผลเสร็จ</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-violet-50 text-violet-700 text-[11px] font-semibold px-2.5 py-1">
                Step 3
              </span>
            </div>

            {result ? (
              <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50/60">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-900">Summary</h4>
                    <span className="text-[11px] text-gray-500">
                      {result.summaryProvider} · {result.summaryModel}
                    </span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap text-gray-800 leading-relaxed">
                    {result.summary || '-'}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50/60">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-900">Transcript</h4>
                    <span className="text-[11px] text-gray-500">
                      {result.transcriptionProvider} · {result.transcriptionModel}
                    </span>
                  </div>
                  <textarea
                    value={result.transcript}
                    readOnly
                    rows={18}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 bg-white"
                  />
                  <p className="text-[11px] text-gray-500 mt-2">
                    Chunks: {result.chunks} · Latency: {result.latencyMs ?? '-'} ms
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gradient-to-br from-gray-50 to-indigo-50/40 min-h-[260px] flex flex-col items-center justify-center text-center px-6">
                <div className="w-12 h-12 rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-indigo-500 mb-3">
                  <i className="bi bi-soundwave text-xl"></i>
                </div>
                <h4 className="text-sm font-semibold text-gray-900">พร้อมสำหรับการถอดเสียง</h4>
                <p className="text-xs text-gray-500 mt-1 max-w-md">
                  เลือกแหล่งสื่อด้านซ้าย ปรับโมเดลให้เหมาะกับงาน แล้วกดปุ่ม "ถอดเสียงและสรุป" เพื่อสร้างผลลัพธ์
                </p>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
