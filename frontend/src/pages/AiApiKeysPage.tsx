import { useRef } from 'react';
import PageHeader from '../components/PageHeader';
import ApiSettings from './ApiSettings';
import toast from 'react-hot-toast';

type TabId = 'profile' | 'api' | 'facebook' | 'preferences';

const DATA_KEYS = [
  'ezyai_conversation_history',
  'ezyai_agents',
  'ezyai_custom_prompts',
  'ezyai_starred_prompts',
];

export default function AiApiKeysPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'profile', label: 'Profile', icon: 'bi-person-circle' },
    { id: 'api', label: 'AI API Key', icon: 'bi-key' },
    { id: 'facebook', label: 'Facebook', icon: 'bi-facebook' },
    { id: 'preferences', label: 'Preferences', icon: 'bi-sliders' }
  ];

  const handleExport = () => {
    const data: Record<string, any> = {};
    let count = 0;
    DATA_KEYS.forEach(key => {
      const val = localStorage.getItem(key);
      if (val) { data[key] = JSON.parse(val); count++; }
    });
    if (count === 0) { toast.error('No data to export'); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ezyai_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${count} data sets`);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        let count = 0;
        DATA_KEYS.forEach(key => {
          if (data[key]) { localStorage.setItem(key, JSON.stringify(data[key])); count++; }
        });
        toast.success(`Imported ${count} data sets — refresh to see changes`);
      } catch {
        toast.error('Invalid backup file');
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be imported again
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        className="animate-fade-in-down"
        title="AI API Keys"
        description="จัดการคีย์สำหรับการเชื่อมต่อกับ AI Provider ต่างๆ (เก็บแบบ local file ใน backend แยก)"
      />

      <div className="flex flex-col gap-8 lg:flex-row animate-fade-in-up delay-100">
        <div className="w-full flex-shrink-0 lg:w-64">
          <div className="sticky top-[88px] overflow-hidden rounded-2xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800">
            <nav className="space-y-1 p-2">
              {tabs.map((tab) => {
                const active = tab.id === 'api';
                return (
                  <button
                    key={tab.id}
                    type="button"
                    disabled={!active}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${active
                      ? 'bg-indigo-50 text-indigo-700 shadow-sm dark:bg-indigo-900/30 dark:text-indigo-300'
                      : 'cursor-not-allowed text-gray-400'
                      }`}
                  >
                    <i className={`bi ${tab.icon} text-lg ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-300'}`}></i>
                    <span>{tab.label}</span>
                    {active && <i className="bi bi-chevron-right ml-auto text-xs text-indigo-400"></i>}
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-4 text-center text-xs text-gray-400">Isolated Build 1.0</div>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-6">
          <ApiSettings />

          {/* Data Backup & Restore */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-fade-in-up delay-200">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                <i className="bi bi-cloud-arrow-up-fill text-indigo-500 mr-2"></i>
                Data Backup & Restore
              </h3>
              <p className="text-xs text-gray-500 mt-1">Export / Import ข้อมูล Prompts, Agents, History ทั้งหมด</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Export */}
                <button
                  onClick={handleExport}
                  className="flex items-center gap-3 px-5 py-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                    <i className="bi bi-download text-emerald-600 dark:text-emerald-400 text-lg"></i>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Export All Data</div>
                    <div className="text-[11px] text-gray-400">Download as JSON backup file</div>
                  </div>
                </button>

                {/* Import */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-3 px-5 py-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <i className="bi bi-upload text-blue-600 dark:text-blue-400 text-lg"></i>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Import Data</div>
                    <div className="text-[11px] text-gray-400">Restore from JSON backup file</div>
                  </div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImport}
                />
              </div>
              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                <i className="bi bi-info-circle"></i>
                Import จะ merge ข้อมูลเข้ากับข้อมูลปัจจุบัน ไม่ลบข้อมูลเก่า
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}