import React, { useState, useRef, useEffect } from 'react';
import { Key, Download, Upload, X, Eye, EyeOff, Activity, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeySaved: () => void;
}

// Simple XOR encryption helper to safely store the key in local drive and localStorage
const SECRET_SALT = "SURVEY_PPT_REPORT_GENERATOR_SALT_2026";

export const encryptKey = (rawKey: string): string => {
  if (!rawKey) return "";
  let enc = "";
  for (let i = 0; i < rawKey.length; i++) {
    const charCode = rawKey.charCodeAt(i) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length);
    enc += String.fromCharCode(charCode);
  }
  return window.btoa(unescape(encodeURIComponent(enc)));
};

export const decryptKey = (encKey: string): string => {
  if (!encKey) return "";
  try {
    const decoded = decodeURIComponent(escape(window.atob(encKey)));
    let dec = "";
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length);
      dec += String.fromCharCode(charCode);
    }
    return dec;
  } catch (e) {
    console.error("복호화 중 오류 발생:", e);
    return "";
  }
};

export default function ApiKeyModal({ isOpen, onClose, onKeySaved }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testMessage, setTestMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load key from localStorage on mount
  useEffect(() => {
    const savedEnc = localStorage.getItem('user_free_api_key');
    if (savedEnc) {
      const dec = decryptKey(savedEnc);
      setApiKey(dec);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveToLocalStorage = (keyToSave: string) => {
    if (!keyToSave.trim()) {
      localStorage.removeItem('user_free_api_key');
      setApiKey("");
      onKeySaved();
      return;
    }
    const enc = encryptKey(keyToSave.trim());
    localStorage.setItem('user_free_api_key', enc);
    setApiKey(keyToSave.trim());
    onKeySaved();
  };

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setTestStatus('failed');
      setTestMessage("API Key를 입력한 뒤 테스트해 주세요.");
      return;
    }

    setTestStatus('testing');
    setTestMessage("연결 테스트를 진행 중입니다...");
    
    try {
      const response = await fetch('/api/ai/test-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
        },
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setTestStatus('success');
        setTestMessage("연결에 성공했습니다! 입력한 API Key가 정상 작동합니다. 🎉");
        // Auto save on successful test
        handleSaveToLocalStorage(apiKey);
      } else {
        setTestStatus('failed');
        setTestMessage(data.error || "연결 실패: API Key가 유효하지 않거나 만료되었습니다.");
      }
    } catch (err: any) {
      setTestStatus('failed');
      setTestMessage(err?.message || "연결 테스트 중 서버와의 통신 오류가 발생했습니다.");
    }
  };

  // Export encrypted key to local drive
  const handleExportToFile = () => {
    if (!apiKey.trim()) {
      setErrorMessage("로컬 드라이브에 저장할 API Key가 없습니다. 먼저 Key를 입력해 주세요.");
      return;
    }
    setErrorMessage("");
    try {
      const enc = encryptKey(apiKey.trim());
      const blob = new Blob([enc], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'survey_api_key.enc');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Auto save on export too
      handleSaveToLocalStorage(apiKey);
    } catch (err: any) {
      setErrorMessage("파일로 내보내기 중 오류가 발생했습니다.");
    }
  };

  // Import encrypted key from local drive
  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage("");
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        const dec = decryptKey(text.trim());
        if (dec && dec.startsWith("AIza")) { // Check simple structure match for Gemini keys
          setApiKey(dec);
          handleSaveToLocalStorage(dec);
          setTestStatus('success');
          setTestMessage("암호화된 키 파일을 성공적으로 불러와 적용했습니다! 연결을 클릭하여 테스트할 수 있습니다.");
        } else if (dec) {
          // If decrypted but not matching standard structure, let user still see/test it
          setApiKey(dec);
          handleSaveToLocalStorage(dec);
          setTestStatus('idle');
          setTestMessage("키 파일을 성공적으로 불러왔습니다.");
        } else {
          setErrorMessage("올바르지 않은 키 파일이거나 손상된 데이터입니다. 암호화 파일(.enc)을 선택해 주세요.");
        }
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" id="api-key-modal">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="flex min-h-full items-center justify-center p-4 text-center">
        <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-slate-100 animate-fade-in-up">
          {/* Header */}
          <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-b border-slate-200">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                <Key className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 font-sans tracking-tight">
                개인 무료 AI API 설정 (외장형)
              </h3>
            </div>
            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700 font-semibold leading-relaxed">
                본 앱은 서버 소유의 내장 API Key가 아닌 <strong>사용자 본인의 개인 무료 AI API Key (Gemini)</strong>를 사용하여 작동합니다. 키는 로컬 브라우저에 안전히 보관되며, 로컬 드라이브에 암호화된 파일(.enc)로 영구 저장할 수도 있습니다.
              </p>
            </div>

            {/* Input field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
                Google Gemini API Key 입력
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  placeholder="AIzaSy..."
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setTestStatus('idle');
                    setTestMessage("");
                  }}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-purple-500 rounded-xl py-2.5 pl-3.5 pr-10 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md cursor-pointer"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">
                API Key가 없으시다면{" "}
                <a 
                  href="https://aistudio.google.com/" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-purple-600 hover:underline font-bold"
                >
                  Google AI Studio
                </a>
                에서 무료로 즉시 발급받으실 수 있습니다.
              </p>
            </div>

            {/* Actions: Save & Connection Test */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
                className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 px-4 rounded-xl transition-all cursor-pointer border border-slate-200"
              >
                <Activity className={`w-3.5 h-3.5 ${testStatus === 'testing' ? 'animate-pulse' : ''}`} />
                연결 테스트
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSaveToLocalStorage(apiKey);
                  onClose();
                }}
                className="flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all cursor-pointer shadow-sm hover:shadow active:scale-98"
              >
                적용 및 저장
              </button>
            </div>

            {/* Test connection status banner */}
            {testStatus !== 'idle' && (
              <div className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2.5 ${
                testStatus === 'testing' ? 'bg-blue-50/60 border-blue-100 text-blue-700' :
                testStatus === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                'bg-rose-50 border-rose-100 text-rose-700'
              }`}>
                {testStatus === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : testStatus === 'failed' ? (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <Activity className="w-4 h-4 text-blue-600 animate-spin shrink-0 mt-0.5" />
                )}
                <div className="leading-relaxed font-semibold">{testMessage}</div>
              </div>
            )}

            {/* Extra file backup area */}
            <div className="border-t border-slate-150 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  로컬 파일 백업 (로컬드라이브 암호화 저장)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleExportToFile}
                  className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold py-2.5 px-3 rounded-xl border border-slate-200 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  암호화하여 저장 (.enc)
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold py-2.5 px-3 rounded-xl border border-slate-200 transition-all cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-400" />
                  파일 불러오기
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportFileChange}
                  accept=".enc"
                  className="hidden"
                />
              </div>
              {errorMessage && (
                <p className="text-[10px] text-rose-500 font-bold text-center">⚠️ {errorMessage}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
