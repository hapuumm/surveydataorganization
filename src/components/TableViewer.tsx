/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { TabulationTable, QuestionGroup, DemographicKey, QuestionType, Respondent } from '../types';
import { tableToCSV } from '../utils/parser';
import { Copy, Download, Check, RefreshCw, BarChart2, ListFilter } from 'lucide-react';
import { decryptKey } from './ApiKeyModal';

interface TableViewerProps {
  table: TabulationTable;
  questionGroup: QuestionGroup;
  currentLayout: 'vertical' | 'horizontal';
  onChangeLayout: (layout: 'vertical' | 'horizontal') => void;
  selectedScaleDemo: DemographicKey;
  onChangeScaleDemo: (demo: DemographicKey) => void;
  onChangeQuestionType: (mainCode: string, newType: QuestionType) => void;
  respondents: Respondent[];
}

export default function TableViewer({
  table,
  questionGroup,
  currentLayout,
  onChangeLayout,
  selectedScaleDemo,
  onChangeScaleDemo,
  onChangeQuestionType,
  respondents,
}: TableViewerProps) {
  const [copied, setCopied] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  
  // Local state for single/multi demographic row filtering
  const [demoFilter, setDemoFilter] = useState<'all' | 'gender_only' | 'male_only' | 'female_only'>('all');
  // Local state for showing scale positive response rate (Top 2)
  const [showPositiveRate, setShowPositiveRate] = useState(false);

  const isScale = questionGroup.type === 'scale';
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [selectedChartDemo, setSelectedChartDemo] = useState<DemographicKey>('all');

  // Subjective text-answers state variables
  const [rawSearch, setRawSearch] = useState('');
  const [rawDemo, setRawDemo] = useState<DemographicKey>('all');
  const [excludeMeaningless, setExcludeMeaningless] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCopied, setAiCopied] = useState(false);

  // Helper to identify meaningless responses (빈값, 없음, 모르겠음, 무응답 등)
  const isMeaninglessResponse = (text: string): boolean => {
    const t = text.trim().toLowerCase();
    if (!t) return true;
    const meaninglessWords = [
      '없음', '없습니다', '없어', '없음.', '없습니다.', '모름', '모르겠음', '모르겠습니다', 
      '잘 모르겠습니다', '잘 모름', '잘모르겠음', '무응답', '대답없음', '대답 없음', 'n/a', 'na', 
      'none', '-', '.', '?', '...', '없고요', '없당', '없음...', '딱히 없음', '특별히 없음', '딱히', '특별히'
    ];
    if (meaninglessWords.includes(t)) return true;
    if (t.length <= 1 && !/[0-9]/.test(t)) return true;
    return false;
  };

  // Load cached AI result on mount or group change or toggle change
  React.useEffect(() => {
    if (questionGroup.type === 'text') {
      const cacheKey = `ai_analysis_${questionGroup.mainCode}_${excludeMeaningless}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          setAnalysisResult(JSON.parse(cached));
          setAiError(null);
        } catch (e) {
          sessionStorage.removeItem(cacheKey);
        }
      } else {
        setAnalysisResult(null);
        setAiError(null);
      }
    }
  }, [questionGroup.mainCode, questionGroup.type, excludeMeaningless]);

  const runAiAnalysis = async (answersList: string[]) => {
    setIsAnalyzing(true);
    setAiError(null);
    try {
      const savedEnc = localStorage.getItem('user_free_api_key');
      const apiKey = savedEnc ? decryptKey(savedEnc) : "";

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['x-api-key'] = apiKey;
      }

      const response = await fetch('/api/ai/analyze-text', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          questionCode: questionGroup.mainCode,
          questionLabel: questionGroup.label,
          answers: answersList,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'AI 분석 중 오류가 발생했습니다.');
      }

      setAnalysisResult(data);
      const cacheKey = `ai_analysis_${questionGroup.mainCode}_${excludeMeaningless}`;
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (err: any) {
      console.error(err);
      setAiError(err?.message || '오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyAiResult = async () => {
    if (!analysisResult) return;
    try {
      let tsvText = "카테고리\t응답 수\t비율(%)\t주요 키워드\t대표 응답\n";
      analysisResult.categories.forEach((cat: any) => {
        const keywordsStr = Array.isArray(cat.keywords) ? cat.keywords.join(", ") : "";
        const quotesStr = Array.isArray(cat.representativeQuotes) ? cat.representativeQuotes.join(" | ") : "";
        tsvText += `${cat.category}\t${cat.count}\t${Number(cat.percentage).toFixed(1)}%\t${keywordsStr}\t"${quotesStr}"\n`;
      });

      let htmlContent = `<table border="1"><thead><tr><th>카테고리</th><th>응답 수</th><th>비율(%)</th><th>주요 키워드</th><th>대표 응답</th></tr></thead><tbody>`;
      analysisResult.categories.forEach((cat: any) => {
        const keywordsStr = Array.isArray(cat.keywords) ? cat.keywords.join(", ") : "";
        const quotesList = Array.isArray(cat.representativeQuotes) ? cat.representativeQuotes.map((q: string) => `• ${q}`).join("<br/>") : "";
        htmlContent += `<tr><td><b>${cat.category}</b></td><td>${cat.count}</td><td>${Number(cat.percentage).toFixed(1)}%</td><td>${keywordsStr}</td><td>${quotesList}</td></tr>`;
      });
      htmlContent += "</tbody></table>";

      if (navigator.clipboard && navigator.clipboard.write) {
        const textBlob = new Blob([tsvText], { type: 'text/plain' });
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': textBlob,
            'text/html': htmlBlob
          })
        ]);
      } else {
        await navigator.clipboard.writeText(tsvText);
      }
      setAiCopied(true);
      setTimeout(() => setAiCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy AI result:", err);
    }
  };

  const handleDownloadAiCSV = () => {
    if (!analysisResult) return;
    let csv = "카테고리,응답 수,비율(%),주요 키워드,대표 응답\n";
    analysisResult.categories.forEach((cat: any) => {
      const escapedCategory = cat.category.replace(/"/g, '""');
      const keywordsStr = Array.isArray(cat.keywords) ? cat.keywords.join(", ").replace(/"/g, '""') : "";
      const quotesStr = Array.isArray(cat.representativeQuotes) ? cat.representativeQuotes.join(" | ").replace(/"/g, '""') : "";
      csv += `"${escapedCategory}",${cat.count},${Number(cat.percentage).toFixed(1)}%,"${keywordsStr}","${quotesStr}"\n`;
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${questionGroup.mainCode}_AI_analysis.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Sync chart demo when table gender filter changes
  React.useEffect(() => {
    if (demoFilter === 'male_only') {
      setSelectedChartDemo('male');
    } else if (demoFilter === 'female_only') {
      setSelectedChartDemo('female');
    }
  }, [demoFilter]);

  // Smart heuristic to identify positive rating options (e.g. 4 and 5 on 5-point scale)
  const getPositiveOptions = (headers: string[]): string[] => {
    // 1. Check if all options are numbers
    const numericOptions = headers
      .map(h => ({ original: h, parsed: Number(h.trim()) }))
      .filter(o => !isNaN(o.parsed));

    if (numericOptions.length === headers.length && headers.length > 0) {
      const sorted = [...numericOptions].sort((a, b) => a.parsed - b.parsed);
      if (sorted.length >= 4) {
        return [sorted[sorted.length - 2].original, sorted[sorted.length - 1].original];
      } else if (sorted.length >= 3) {
        return [sorted[sorted.length - 1].original];
      } else {
        return [sorted[sorted.length - 1].original];
      }
    }

    // 2. Otherwise search for Korean positive keywords
    const positiveKeywords = ['만족', '그렇다', '좋다', '좋음', '우수', '찬성', '동의', '매우'];
    const negativeKeywords = ['불', '않', '반대', '비', '전혀'];

    const matched = headers.filter(h => {
      const trimmed = h.trim();
      const hasPositive = positiveKeywords.some(kw => trimmed.includes(kw));
      const hasNegative = negativeKeywords.some(kw => trimmed.includes(kw));
      return hasPositive && !hasNegative;
    });

    if (matched.length > 0) {
      return matched;
    }

    // 3. Fallback: take last 2 options if length >= 4, otherwise last 1
    if (headers.length >= 4) {
      return [headers[headers.length - 2], headers[headers.length - 1]];
    } else if (headers.length > 0) {
      return [headers[headers.length - 1]];
    }
    return [];
  };

  const positiveOptions = getPositiveOptions(table.headers);

  const calculatePositiveRate = (row: any, posOpts: string[]): number => {
    const sum = posOpts.reduce((acc, opt) => acc + (row.values[opt] || 0), 0);
    return Number(sum.toFixed(1));
  };

  const getFilteredRows = () => {
    if (isScale) return table.rows;
    
    switch (demoFilter) {
      case 'gender_only':
        return table.rows.filter(r => r.rowKey === 'all' || r.rowKey === 'male' || r.rowKey === 'female');
      case 'male_only':
        return table.rows.filter(r => r.rowKey === 'all' || r.rowKey === 'male');
      case 'female_only':
        return table.rows.filter(r => r.rowKey === 'all' || r.rowKey === 'female');
      case 'all':
      default:
        return table.rows;
    }
  };

  const displayedRows = getFilteredRows();

  // Formats for Plain Text TSV and HTML Table to write both to clipboard
  const handleCopy = async () => {
    try {
      let tsvText = '';
      
      if (questionGroup.type === 'scale' || currentLayout === 'vertical') {
        // Standard column-based copying (Vertical / Scale)
        const headers = ['구분', 'N수', ...table.headers];
        if (questionGroup.type === 'scale' && showPositiveRate) {
          headers.push(`긍정 응답률 (${positiveOptions.join('+')})`);
        }
        tsvText += headers.join('\t') + '\n';
        
        displayedRows.forEach(r => {
          const rowVals = [
            r.rowLabel,
            r.totalN,
            ...table.headers.map(opt => `${r.values[opt]}%`)
          ];
          if (questionGroup.type === 'scale' && showPositiveRate) {
            rowVals.push(`${calculatePositiveRate(r, positiveOptions)}%`);
          }
          tsvText += rowVals.join('\t') + '\n';
        });
      } else {
        // Transposed column-based copying (Horizontal)
        const headers = ['옵션', ...displayedRows.map(r => `${r.rowLabel} (N=${r.totalN})`)];
        tsvText += headers.join('\t') + '\n';
        
        table.headers.forEach(opt => {
          const rowVals = [
            opt,
            ...displayedRows.map(r => `${r.values[opt]}%`)
          ];
          tsvText += rowVals.join('\t') + '\n';
        });
      }

      // Write to Clipboard using Clipboard API (Write both Plain text TSV and HTML table)
      // This allows Excel to parse the spreadsheet cells perfectly
      if (navigator.clipboard && navigator.clipboard.write) {
        const textBlob = new Blob([tsvText], { type: 'text/plain' });
        
        let htmlContent = '';
        if (tableRef.current) {
          htmlContent = tableRef.current.outerHTML;
        } else {
          // Fallback HTML table generation
          htmlContent = '<table>';
          if (questionGroup.type === 'scale' || currentLayout === 'vertical') {
            const hasPositive = questionGroup.type === 'scale' && showPositiveRate;
            htmlContent += `<thead><tr><th>구분</th><th>N수</th>${table.headers.map(h => `<th>${h}</th>`).join('')}${hasPositive ? `<th>긍정 응답률</th>` : ''}</tr></thead><tbody>`;
            displayedRows.forEach(r => {
              htmlContent += `<tr><td>${r.rowLabel}</td><td>${r.totalN}</td>${table.headers.map(opt => `<td>${r.values[opt]}%</td>`).join('')}${hasPositive ? `<td>${calculatePositiveRate(r, positiveOptions)}%</td>` : ''}</tr>`;
            });
          } else {
            htmlContent += `<thead><tr><th>옵션</th>${displayedRows.map(r => `<th>${r.rowLabel} (N=${r.totalN})</th>`).join('')}</tr></thead><tbody>`;
            table.headers.forEach(opt => {
              htmlContent += `<tr><td>${opt}</td>${displayedRows.map(r => `<td>${r.values[opt]}%</td>`).join('')}</tr>`;
            });
          }
          htmlContent += '</tbody></table>';
        }
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });

        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': textBlob,
            'text/html': htmlBlob
          })
        ]);
      } else {
        // Simple fallback
        await navigator.clipboard.writeText(tsvText);
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy table: ', err);
    }
  };

  const handleDownloadCSV = () => {
    const csvContent = tableToCSV(
      table,
      questionGroup.type === 'scale' ? 'vertical' : currentLayout,
      questionGroup.type === 'scale' && showPositiveRate ? positiveOptions : undefined,
      displayedRows
    );
    // Use BOM for Excel encoding support (Korean characters in Excel)
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${questionGroup.mainCode}_report_table.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  // Elegantly color sequential indices for scale stack bar
  const getScaleColorClass = (index: number, total: number) => {
    if (total === 5) {
      const colors = [
        'bg-rose-500 hover:bg-rose-400 border-r border-white/10',       // 1: 매우 불만족 / 그렇지 않다
        'bg-orange-400 hover:bg-orange-300 border-r border-white/10',   // 2: 불만족 / 그렇지 않다
        'bg-slate-300 hover:bg-slate-200 border-r border-white/10',     // 3: 보통
        'bg-teal-400 hover:bg-teal-300 border-r border-white/10',       // 4: 만족 / 그렇다
        'bg-indigo-600 hover:bg-indigo-500',                           // 5: 매우 만족 / 그렇다
      ];
      return colors[index] || 'bg-indigo-500';
    }
    
    // Fallback: beautiful categorical palettes
    const colors = [
      'bg-indigo-600 hover:bg-indigo-500 border-r border-white/10',
      'bg-teal-500 hover:bg-teal-400 border-r border-white/10',
      'bg-sky-500 hover:bg-sky-400 border-r border-white/10',
      'bg-amber-500 hover:bg-amber-400 border-r border-white/10',
      'bg-rose-500 hover:bg-rose-400 border-r border-white/10',
      'bg-slate-400 hover:bg-slate-350',
    ];
    return colors[index % colors.length];
  };

  const getDemoLabel = (key: DemographicKey) => {
    const labels: Record<string, string> = {
      all: '전체 (Total)',
      male: '남성 (Male)',
      female: '여성 (Female)',
      age_19: '19세 이하',
      age_20s: '20-29세',
      age_30s: '30-39세',
      age_40s: '40-49세',
      age_50s: '50-59세',
      age_60s: '60세 이상',
    };
    return labels[key] || key;
  };

  // Find the selected row for single/multi visual charts
  if (questionGroup.type === 'text') {
    const col = questionGroup.columns[0];
    const rawAnswers = respondents
      .map(r => {
        let genderLabel = '기타';
        if (r.SQ1 === 1) genderLabel = '남성';
        else if (r.SQ1 === 2) genderLabel = '여성';

        let ageLabel = '기타';
        if (r.SQ2 === 1) ageLabel = '19세 이하';
        else if (r.SQ2 === 2) ageLabel = '20대';
        else if (r.SQ2 === 3) ageLabel = '30대';
        else if (r.SQ2 === 4) ageLabel = '40대';
        else if (r.SQ2 === 5) ageLabel = '50대';
        else if (r.SQ2 === 6) ageLabel = '60세 이상';

        return {
          id: r.id,
          gender: r.SQ1,
          genderLabel,
          age: r.SQ2,
          ageLabel,
          text: String(r.rawData[col] || '').trim(),
        };
      })
      .filter(item => item.text !== '');

    const meaninglessAnswers = rawAnswers.filter(item => isMeaninglessResponse(item.text));
    const validAnswers = rawAnswers.filter(item => !isMeaninglessResponse(item.text));

    const activeAnswers = excludeMeaningless ? validAnswers : rawAnswers;

    // Filter raw responses
    const filteredAnswers = activeAnswers.filter(item => {
      // Demographic filter
      if (rawDemo === 'male' && item.gender !== 1) return false;
      if (rawDemo === 'female' && item.gender !== 2) return false;
      if (rawDemo === 'age_19' && item.age !== 1) return false;
      if (rawDemo === 'age_20s' && item.age !== 2) return false;
      if (rawDemo === 'age_30s' && item.age !== 3) return false;
      if (rawDemo === 'age_40s' && item.age !== 4) return false;
      if (rawDemo === 'age_50s' && item.age !== 5) return false;
      if (rawDemo === 'age_60s' && item.age !== 6) return false;

      // Search query
      if (rawSearch.trim()) {
        return item.text.toLowerCase().includes(rawSearch.toLowerCase());
      }
      return true;
    });

    const overallSummary = analysisResult?.overallSummary || '';
    const mainKeywords = analysisResult?.mainKeywords || [];
    const reportInsights = analysisResult?.reportInsights || [];

    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-8">
        {/* Header section identical to other questions for layout harmony */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <div className="relative inline-block">
                <select
                  id="question-type-select-text"
                  value={questionGroup.type}
                  onChange={(e) => onChangeQuestionType(questionGroup.mainCode, e.target.value as QuestionType)}
                  className="text-xs font-extrabold px-3 py-1.5 rounded-full border border-purple-250 bg-purple-50 text-purple-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all hover:bg-purple-100/70"
                >
                  <option value="single" className="text-slate-800 bg-white font-semibold">단수형 (Single)</option>
                  <option value="multi" className="text-slate-800 bg-white font-semibold">복수형 (Multi)</option>
                  <option value="scale" className="text-slate-800 bg-white font-semibold">척도형 (Scale)</option>
                  <option value="text" className="text-slate-800 bg-white font-semibold">주관식 (Text)</option>
                </select>
              </div>
              <h3 className="text-xl font-bold text-slate-900 font-sans tracking-tight">
                {questionGroup.mainCode} 주관식 응답 및 AI 분석
              </h3>
              <span className="text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded">AI 지원 ✨</span>
            </div>
            <p className="text-sm text-slate-500 font-semibold leading-relaxed text-left">
              {questionGroup.label}
            </p>
          </div>
        </div>

        {/* Multi-grid layout split: Left (Raw Answers) & Right (AI Analysis Result) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Panel: Raw Respondent Answers (col-span 5) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                💬 주관식 응답 원문 
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-md">
                  N = {filteredAnswers.length} / {activeAnswers.length}
                </span>
              </h4>

              {/* Exclude Meaningless Control */}
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 select-none cursor-pointer hover:text-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={excludeMeaningless}
                  onChange={(e) => setExcludeMeaningless(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 cursor-pointer"
                />
                <span>무의미 응답 제외 ({meaninglessAnswers.length}건)</span>
              </label>
            </div>

            {/* Filters for Raw Answers */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={rawDemo}
                  onChange={(e) => setRawDemo(e.target.value as DemographicKey)}
                  className="bg-white text-xs font-bold text-slate-700 py-2 px-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[120px] shrink-0"
                >
                  <option value="all">전체 응답자</option>
                  <option value="male">남성</option>
                  <option value="female">여성</option>
                  <option value="age_19">19세 이하</option>
                  <option value="age_20s">20대</option>
                  <option value="age_30s">30대</option>
                  <option value="age_40s">40대</option>
                  <option value="age_50s">50대</option>
                  <option value="age_60s">60세 이상</option>
                </select>
                <input
                  type="text"
                  placeholder="답변 키워드 검색..."
                  value={rawSearch}
                  onChange={(e) => setRawSearch(e.target.value)}
                  className="flex-1 bg-white text-xs font-bold text-slate-700 py-2 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Raw Scrollable List */}
            <div className="border border-slate-200 rounded-xl bg-slate-50/50 p-3 h-[520px] overflow-y-auto space-y-2.5 custom-scrollbar">
              {filteredAnswers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center p-4">
                  <p className="text-xs font-semibold">조건에 맞는 주관식 답변이 없습니다.</p>
                </div>
              ) : (
                filteredAnswers.map((ans, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-xl border border-slate-150/80 shadow-xs space-y-1.5 hover:shadow-sm transition-all text-left">
                    <p className="text-xs font-semibold text-slate-700 leading-relaxed break-words">
                      {ans.text}
                    </p>
                    <div className="flex gap-1.5 items-center text-[9px] font-bold">
                      <span className="text-indigo-600 bg-indigo-50 border border-indigo-100/50 px-1.5 py-0.5 rounded">
                        {ans.genderLabel}
                      </span>
                      <span className="text-emerald-600 bg-emerald-50 border border-emerald-100/50 px-1.5 py-0.5 rounded">
                        {ans.ageLabel}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Panel: AI Analysis & Tabulation Result (col-span 7) */}
          <div className="lg:col-span-7 space-y-5">
            {!analysisResult && !isAnalyzing && (
              <div className="border border-dashed border-slate-300 rounded-2xl p-8 text-center bg-purple-50/10 flex flex-col items-center justify-center min-h-[580px]">
                <div className="w-14 h-14 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                  <RefreshCw className="w-6 h-6 animate-spin-slow" />
                </div>
                <h4 className="text-base font-bold text-slate-800 mb-2">🤖 주관식 응답 AI 의미 분석기</h4>
                <p className="text-xs text-slate-500 max-w-md font-semibold leading-relaxed mb-6">
                  Gemini AI가 주관식 서술형 답변을 면밀히 검토하고, 의미가 유사한 답변끼리 자동 분류하여 <strong className="text-purple-600 font-bold">집계 비율(%)</strong>을 정확하게 계산해 줍니다.
                </p>
                <button
                  onClick={() => runAiAnalysis(activeAnswers.map(a => a.text))}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-6 py-3 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-98"
                >
                  ✨ AI 분석 및 자동 분류 시작 (총 {activeAnswers.length}건)
                </button>
                {aiError && (
                  <div className="mt-4 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-3 max-w-sm">
                    ⚠️ {aiError}
                  </div>
                )}
              </div>
            )}

            {isAnalyzing && (
              <div className="border border-slate-200 bg-white rounded-2xl p-8 text-center flex flex-col items-center justify-center min-h-[580px] shadow-sm">
                <div className="relative flex items-center justify-center mb-6">
                  <div className="w-16 h-16 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin" />
                  <span className="absolute text-xl">🔮</span>
                </div>
                <h4 className="text-sm font-bold text-slate-800 mb-2 animate-pulse">주관식 답변 의미론적 분석 중...</h4>
                <p className="text-xs text-slate-400 font-semibold max-w-xs leading-relaxed">
                  수많은 답변들로부터 공통된 주제를 도출하고, 각 분류 카테고리별 응답 통계와 주요 키워드, 인사이트 문장들을 계산하고 있습니다. 약 10초 내외가 소요됩니다.
                </p>
              </div>
            )}

            {analysisResult && (
              <div className="space-y-6 animate-fade-in">
                {/* AI Top Toolbar */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    📊 AI 의미 분류 통계 결과표
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyAiResult}
                      className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition-all cursor-pointer ${
                        aiCopied
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                      }`}
                      title="결과 통계표를 클립보드에 복사해 PPT 차트나 엑셀에 바로 붙여넣습니다."
                    >
                      {aiCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {aiCopied ? '복사 완료!' : '클립보드 복사'}
                    </button>
                    <button
                      onClick={handleDownloadAiCSV}
                      className="flex items-center gap-1.5 text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg transition-all cursor-pointer"
                      title="CSV 다운로드"
                    >
                      <Download className="w-3.5 h-3.5" />
                      CSV 다운로드
                    </button>
                    <button
                      onClick={() => runAiAnalysis(activeAnswers.map(a => a.text))}
                      className="flex items-center justify-center p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all cursor-pointer border border-slate-200"
                      title="재분석"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Overall Summary block */}
                {overallSummary && (
                  <div className="bg-purple-50/40 border border-purple-100 p-4 rounded-xl text-left space-y-1">
                    <h5 className="text-[11px] font-bold text-purple-700 flex items-center gap-1">
                      ✨ 전체 응답 핵심 요약
                    </h5>
                    <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                      {overallSummary}
                    </p>
                  </div>
                )}

                {/* Key Keywords list */}
                {mainKeywords.length > 0 && (
                  <div className="text-left space-y-1.5">
                    <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      🔑 전반적 주요 키워드
                    </h5>
                    <div className="flex flex-wrap gap-1.5">
                      {mainKeywords.map((kw: string, i: number) => (
                        <span key={i} className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200 shadow-2xs">
                          #{kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Table rendering of AI Categories (Fitted exactly as PPT report columns) */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
                  <table className="w-full text-xs text-left font-sans bg-white border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider">
                        <th className="px-4 py-3 min-w-[110px]">카테고리</th>
                        <th className="px-3 py-3 text-center w-16">응답 수</th>
                        <th className="px-3 py-3 text-right w-20">비율(%)</th>
                        <th className="px-4 py-3 min-w-[120px]">주요 키워드</th>
                        <th className="px-4 py-3 min-w-[180px]">대표 응답</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-600">
                      {analysisResult.categories.map((cat: any, idx: number) => {
                        const catKeywords = Array.isArray(cat.keywords) ? cat.keywords : [];
                        const representativeQuote = Array.isArray(cat.representativeQuotes) && cat.representativeQuotes.length > 0 
                          ? cat.representativeQuotes[0] 
                          : (cat.description || '');

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3.5 font-bold text-slate-800">
                              {cat.category}
                            </td>
                            <td className="px-3 py-3.5 text-center font-mono font-bold text-slate-500">
                              {cat.count}명
                            </td>
                            <td className="px-3 py-3.5 text-right font-mono font-extrabold text-purple-700">
                              {Number(cat.percentage).toFixed(1)}%
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex flex-wrap gap-1">
                                {catKeywords.map((kw: string, kIdx: number) => (
                                  <span key={kIdx} className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-50 border border-slate-200 text-slate-600 rounded">
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-slate-500 font-semibold leading-normal break-words max-w-xs">
                              {representativeQuote}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Report Insights */}
                {reportInsights.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl text-left space-y-3 shadow-xs">
                    <h5 className="text-[11px] font-extrabold text-indigo-700 flex items-center gap-1.5 uppercase tracking-wider">
                      💡 보고서용 핵심 인사이트 (Report Insights)
                    </h5>
                    <div className="space-y-2">
                      {reportInsights.map((insight: string, i: number) => (
                        <div key={i} className="flex gap-2.5 items-start text-xs font-semibold text-slate-700 leading-relaxed">
                          <span className="text-indigo-500 font-extrabold select-none mt-0.5">•</span>
                          <span>{insight}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Detailed Accordion-style Category Cards with Quote Bubbles */}
                <div className="space-y-3 pt-2">
                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider text-left">
                    📌 카테고리별 상세 실제 응답 예시 (상세 피드백)
                  </h5>
                  <div className="space-y-3.5">
                    {analysisResult.categories.map((cat: any, idx: number) => (
                      <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3 text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 bg-purple-50 border border-purple-100 px-2.5 py-1 rounded-lg">
                            {cat.category}
                          </span>
                          <span className="text-[10px] font-bold text-purple-600 font-mono">
                            N = {cat.count}명 ({Number(cat.percentage).toFixed(1)}%)
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                          {cat.description}
                        </p>
                        <div className="space-y-2">
                          {cat.representativeQuotes.map((quote: string, qIdx: number) => (
                            <div key={qIdx} className="bg-slate-50 text-slate-600 text-[11px] p-2.5 rounded-lg border border-slate-100 leading-relaxed font-semibold relative pl-4">
                              <span className="absolute left-1.5 top-2.5 text-purple-400 font-bold font-mono text-xs">“</span>
                              {quote}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Helpful Hint */}
        <div className="mt-5 bg-indigo-50/20 border border-indigo-100/50 rounded-xl p-4 flex items-start gap-3">
          <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600 mt-0.5">
            <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
          </div>
          <div className="text-xs text-slate-500 leading-relaxed font-medium text-left">
            <p className="font-bold text-slate-800 mb-1">💡 PPT / Excel 즉시 연동 완벽 지원</p>
            <p className="text-slate-600">
              AI 분석 결과를 복사하면, 각 카테고리의 비율과 빈도 데이터가 파워포인트(PPT) 차트 데이터 편집 창이나 엑셀 시트에 완벽히 달라붙는 격자 형식으로 클립보드에 기록됩니다.
              <strong className="text-indigo-600 font-semibold"> [클립보드 복사]</strong> 버튼을 활용해 손쉽게 프리젠테이션 보고서에 분류 차트를 작성해 보세요!
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Find the selected row for single/multi visual charts
  const activeChartRow = table.rows.find(r => r.rowKey === selectedChartDemo) || table.rows[0];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8 shadow-sm">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-6 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <div className="relative inline-block">
              <select
                id="question-type-select"
                value={questionGroup.type}
                onChange={(e) => onChangeQuestionType(questionGroup.mainCode, e.target.value as QuestionType)}
                className={`text-xs font-extrabold px-3 py-1.5 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all ${
                  questionGroup.type === 'single' ? 'bg-indigo-50 text-indigo-700 border-indigo-250 hover:bg-indigo-100/70' :
                  questionGroup.type === 'multi' ? 'bg-emerald-50 text-emerald-700 border-emerald-250 hover:bg-emerald-100/70' :
                  questionGroup.type === 'scale' ? 'bg-amber-50 text-amber-700 border-amber-250 hover:bg-amber-100/70' :
                  'bg-purple-50 text-purple-700 border-purple-250 hover:bg-purple-100/70'
                }`}
              >
                <option value="single" className="text-slate-800 bg-white font-semibold">단수형 (Single)</option>
                <option value="multi" className="text-slate-800 bg-white font-semibold">복수형 (Multi)</option>
                <option value="scale" className="text-slate-800 bg-white font-semibold">척도형 (Scale)</option>
                <option value="text" className="text-slate-800 bg-white font-semibold">주관식 (Text)</option>
              </select>
            </div>
            <h3 className="text-xl font-bold text-slate-900 font-sans tracking-tight">
              {questionGroup.mainCode} 문항 집계
            </h3>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">유형 변경 가능 ⚙️</span>
          </div>
          <p className="text-sm text-slate-500 font-semibold leading-relaxed">
            {questionGroup.label}
          </p>
        </div>

        {/* Layout Selectors, Copy, Download and Demographic Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Layout buttons for non-scale questions */}
          {!isScale && (
            <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200">
              <button
                id="layout-vertical-btn"
                onClick={() => onChangeLayout('vertical')}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                  currentLayout === 'vertical'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="각 인구통계 그룹을 행으로, 문항 보기를 열로 표시합니다."
              >
                <BarChart2 className="w-3.5 h-3.5" />
                세로 막대형 표 (A)
              </button>
              <button
                id="layout-horizontal-btn"
                onClick={() => onChangeLayout('horizontal')}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                  currentLayout === 'horizontal'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="문항 보기를 행으로, 각 인구통계 그룹을 열로 표시합니다."
              >
                <BarChart2 className="w-3.5 h-3.5 rotate-90" />
                가로 막대형 표 (B)
              </button>
            </div>
          )}

          {/* Demographic filter selector for Single / Multi */}
          {!isScale && (
            <div className="flex items-center gap-2 bg-slate-50 pl-3 pr-1 py-1 rounded-xl border border-slate-200">
              <ListFilter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">필터 구분:</span>
              <select
                id="demo-filter-selector"
                value={demoFilter}
                onChange={(e) => setDemoFilter(e.target.value as any)}
                className="bg-transparent text-xs font-extrabold text-slate-700 py-1.5 px-2 focus:outline-none cursor-pointer"
              >
                <option value="all">전체보기 (All)</option>
                <option value="gender_only">성별만 보기 (남/여)</option>
                <option value="male_only">남성 결과만 보기</option>
                <option value="female_only">여성 결과만 보기</option>
              </select>
            </div>
          )}

          {/* Scale demographic dropdown selector */}
          {isScale && (
            <div className="flex items-center gap-2 bg-slate-50 pl-3 pr-1 py-1 rounded-xl border border-slate-200">
              <ListFilter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-500">집계 대상:</span>
              <select
                id="scale-demo-selector"
                value={selectedScaleDemo}
                onChange={(e) => onChangeScaleDemo(e.target.value as DemographicKey)}
                className="bg-transparent text-xs font-semibold text-slate-700 py-1.5 px-2 focus:outline-none cursor-pointer"
              >
                <option value="all">전체 (Total)</option>
                <option value="male">남성 (Male)</option>
                <option value="female">여성 (Female)</option>
                <option value="age_19">19세 이하</option>
                <option value="age_20s">20-29세</option>
                <option value="age_30s">30-39세</option>
                <option value="age_40s">40-49세</option>
                <option value="age_50s">50-59세</option>
                <option value="age_60s">60세 이상</option>
              </select>
            </div>
          )}

          {/* Positive response rate calculation button for Scale questions */}
          {isScale && (
            <button
              id="toggle-positive-rate-btn"
              onClick={() => setShowPositiveRate(!showPositiveRate)}
              className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl border transition-all cursor-pointer ${
                showPositiveRate
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-350 hover:bg-emerald-100 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800'
              }`}
              title="척도형 문항의 긍정 응답 비율(상위 2개 옵션 합계, 예: 만족+매우 만족)을 계산하여 표에 열로 추가합니다."
            >
              ✨ 긍정 응답률(Top 2) 계산
            </button>
          )}

          {/* Copy and Download buttons */}
          <div className="flex items-center gap-2">
            <button
              id="copy-to-clipboard-btn"
              onClick={handleCopy}
              className={`flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
                copied
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow-md'
              }`}
              title="PPT나 엑셀에 바로 붙여넣을 수 있도록 형식화된 표를 클립보드에 복사합니다."
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? '복사 완료!' : '클립보드 복사'}
            </button>
            <button
              id="download-csv-btn"
              onClick={handleDownloadCSV}
              className="flex items-center gap-2 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer"
              title="CSV 파일로 저장합니다."
            >
              <Download className="w-4 h-4" />
              CSV 다운로드
            </button>
          </div>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex border-b border-slate-200 mb-6 gap-2">
        <button
          onClick={() => setViewMode('table')}
          className={`flex items-center gap-2 px-5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer ${
            viewMode === 'table'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          📋 표로 데이터 보기
        </button>
        <button
          onClick={() => setViewMode('chart')}
          className={`flex items-center gap-2 px-5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer ${
            viewMode === 'chart'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          📊 차트로 시각화 보기
        </button>
      </div>

      {/* Content based on selected View Mode */}
      {viewMode === 'table' ? (
        <div className="space-y-4">
          {isScale && showPositiveRate && positiveOptions.length > 0 && (
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2 text-xs text-emerald-800 font-medium">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>
                  긍정 응답 산출 기준: <strong className="font-extrabold text-emerald-950">[{positiveOptions.join(', ')}]</strong> 선택 비율 합산 (Top {positiveOptions.length} Box)
                </span>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-150 px-2.5 py-0.5 rounded-full self-start sm:self-auto">
                자동 매핑 완료 ⚡
              </span>
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-xl max-w-full shadow-xs">
            <table
              id="tabulation-report-table"
              ref={tableRef}
              className="w-full text-sm border-collapse bg-white font-sans text-left"
            >
              {/* CASE 1: Scale questions OR Vertical-bar layout */}
              {(isScale || currentLayout === 'vertical') ? (
                <>
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold text-xs uppercase tracking-wider">
                      <th className="px-6 py-4 font-bold text-slate-800 min-w-[140px]">구분</th>
                      <th className="px-5 py-4 text-center font-bold text-slate-500 w-24">N수</th>
                      {table.headers.map((opt, i) => (
                        <th key={i} className="px-5 py-4 text-right font-bold text-slate-800 min-w-[90px]">
                          {opt}
                        </th>
                      ))}
                      {isScale && showPositiveRate && (
                        <th className="px-5 py-4 text-right font-extrabold text-emerald-700 bg-emerald-50 border-l border-emerald-100 min-w-[110px]">
                          긍정 응답률
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {displayedRows.map((r, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className={`hover:bg-slate-50/50 transition-colors ${
                          rowIdx === 0 && !isScale ? 'bg-indigo-50/20 font-semibold text-indigo-900' : 'text-slate-600'
                        }`}
                      >
                        <td className="px-6 py-4 font-medium text-slate-800">
                          {r.rowLabel}
                        </td>
                        <td className="px-5 py-4 text-center font-mono text-xs text-slate-400">
                          {r.totalN}
                        </td>
                        {table.headers.map((opt, colIdx) => (
                          <td key={colIdx} className="px-5 py-4 text-right font-mono text-slate-700">
                            {r.values[opt]}%
                          </td>
                        ))}
                        {isScale && showPositiveRate && (
                          <td className="px-5 py-4 text-right font-extrabold text-emerald-700 bg-emerald-50/30 border-l border-emerald-150 font-mono">
                            {calculatePositiveRate(r, positiveOptions)}%
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
                /* CASE 2: Horizontal-bar layout (Transposed view) */
                <>
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold text-xs uppercase tracking-wider">
                      <th className="px-6 py-4 font-bold text-slate-800 min-w-[180px]">옵션</th>
                      {displayedRows.map((r, colIdx) => (
                        <th key={colIdx} className="px-5 py-4 text-right font-bold text-slate-800 min-w-[90px]">
                          <div className="text-slate-850 font-bold">{r.rowLabel}</div>
                          <div className="text-[10px] text-slate-400 font-medium normal-case">N={r.totalN}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {table.headers.map((opt, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className="hover:bg-slate-50/50 transition-colors text-slate-600"
                      >
                        <td className="px-6 py-4 font-semibold text-slate-850">
                          {opt}
                        </td>
                        {displayedRows.map((r, colIdx) => (
                          <td
                            key={colIdx}
                            className={`px-5 py-4 text-right font-mono ${
                              colIdx === 0 ? 'font-semibold text-indigo-750' : 'text-slate-700'
                            }`}
                          >
                            {r.values[opt]}%
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </table>
          </div>
        </div>
      ) : (
        /* VISUAL GRAPHICAL CHARTS */
        <div className="bg-slate-50/50 rounded-xl p-6 border border-slate-200/60 shadow-inner">
          {isScale ? (
            /* SCALE CHART: 100% Stacked Horizontal Bar Chart (perfectly formatted per additional codes) */
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">📊 100% 누적 가로 막대 차트 (C)</h4>
                  <p className="text-[11px] text-slate-400 font-semibold mt-0.5">각 세부 추가 코드(문항)별 응답 비율 분포를 한눈에 비교합니다.</p>
                </div>
                <div className="text-xs bg-amber-50 text-amber-700 border border-amber-100 rounded-lg px-2.5 py-1 font-bold">
                  척도형 {selectedScaleDemo === 'all' ? '전체' : getDemoLabel(selectedScaleDemo)} 집계
                </div>
              </div>

              {/* Legend of scale ratings */}
              <div className="flex flex-wrap items-center justify-center gap-4 bg-white border border-slate-150 p-3 rounded-lg shadow-xs">
                {table.headers.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <span className={`w-3.5 h-3.5 rounded-sm ${getScaleColorClass(idx, table.headers.length).split(' ')[0]}`} />
                    <span>{opt}</span>
                  </div>
                ))}
              </div>

              {/* Stacked bars list */}
              <div className="space-y-6">
                {table.rows.map((row, rowIdx) => (
                  <div key={rowIdx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                    <div className="flex justify-between items-start mb-2 gap-4">
                      <span className="text-xs font-extrabold text-slate-850 leading-tight">
                        {row.rowLabel}
                      </span>
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-md shrink-0">
                        N = {row.totalN}
                      </span>
                    </div>

                    {/* 100% Stacked Bar track */}
                    <div className="w-full h-8 bg-slate-100 rounded-lg overflow-hidden flex shadow-inner border border-slate-200/50">
                      {table.headers.map((opt, idx) => {
                        const val = row.values[opt] || 0;
                        const count = row.counts[opt] || 0;
                        if (val === 0) return null;
                        
                        return (
                          <div
                            key={idx}
                            className={`${getScaleColorClass(idx, table.headers.length)} h-full relative flex items-center justify-center text-white text-[10px] font-extrabold transition-all duration-500 ease-out hover:brightness-105 cursor-help`}
                            style={{ width: `${val}%` }}
                            title={`${opt}: ${val}% (${count}명)`}
                          >
                            {val >= 7 && (
                              <span className="pointer-events-none drop-shadow-xs truncate px-1">
                                {val}%
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* SINGLE & MULTI CHART: Beautiful vertical or horizontal bar chart based on layout */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {currentLayout === 'vertical' ? '📊 세로 막대형 시각화 차트 (A)' : '📊 가로 막대형 시각화 차트 (B)'}
                  </h4>
                  <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                    {questionGroup.type === 'multi' 
                      ? '복수형 문항: 응답 데이터를 하나로 취합한 각 보기 선택 비율 (합계 100% 이상 가능)'
                      : '단수형 문항: 각 보기의 선택 비율 분포 (합계 정확히 100%)'}
                  </p>
                </div>
                
                {/* Demographic Sub-Selector within Chart View */}
                <div className="flex items-center gap-2 bg-white pl-3 pr-1 py-1 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500">집계 대상:</span>
                  <select
                    id="chart-demo-selector"
                    value={selectedChartDemo}
                    onChange={(e) => setSelectedChartDemo(e.target.value as DemographicKey)}
                    className="bg-transparent text-xs font-bold text-slate-800 py-1 px-1.5 focus:outline-none cursor-pointer"
                  >
                    <option value="all">전체 (Total)</option>
                    <option value="male">남성 (Male)</option>
                    <option value="female">여성 (Female)</option>
                    <option value="age_19">19세 이하</option>
                    <option value="age_20s">20-29세</option>
                    <option value="age_30s">30-39세</option>
                    <option value="age_40s">40-49세</option>
                    <option value="age_50s">50-59세</option>
                    <option value="age_60s">60세 이상</option>
                  </select>
                </div>
              </div>

              {/* Chart presentation stage */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
                <div className="text-xs font-bold text-slate-400 mb-4 flex items-center gap-2 justify-center">
                  <span>{getDemoLabel(selectedChartDemo)} 응답 분석</span>
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                  <span className="text-indigo-600 font-extrabold">N = {activeChartRow.totalN}명</span>
                </div>

                {currentLayout === 'vertical' ? (
                  /* VERTICAL BARS */
                  <div className="flex items-end justify-between h-72 gap-3 pt-6 pb-2 border-b border-slate-200">
                    {table.headers.map((opt, i) => {
                      const val = activeChartRow.values[opt] || 0;
                      const count = activeChartRow.counts[opt] || 0;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end group h-full">
                          {/* Value bubble */}
                          <span className="text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100/50 px-1.5 py-0.5 rounded-md mb-2 opacity-90 group-hover:opacity-100 group-hover:scale-115 transition-all">
                            {val}%
                          </span>
                          {/* Visual Column Bar */}
                          <div className="w-full max-w-[44px] bg-slate-50 border border-slate-200/50 rounded-t-lg relative overflow-hidden h-52 flex items-end shadow-inner">
                            <div
                              className="w-full bg-indigo-600 hover:bg-indigo-500 rounded-t-md transition-all duration-700 ease-out origin-bottom relative group-hover:brightness-105"
                              style={{ height: `${val}%` }}
                            >
                              <div className="absolute inset-0 bg-linear-to-t from-transparent via-white/5 to-white/15" />
                            </div>
                          </div>
                          {/* Label info */}
                          <div className="text-center mt-3 max-w-[90px] truncate shrink-0">
                            <div className="text-xs font-extrabold text-slate-700 truncate" title={opt}>
                              {opt}
                            </div>
                            <div className="text-[10px] font-semibold text-slate-400 mt-0.5">
                              {count}명
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* HORIZONTAL BARS */
                  <div className="space-y-4 pt-2">
                    {table.headers.map((opt, i) => {
                      const val = activeChartRow.values[opt] || 0;
                      const count = activeChartRow.counts[opt] || 0;
                      return (
                        <div key={i} className="flex items-center gap-4 group">
                          {/* Label column */}
                          <div className="w-1/4 text-right pr-2 shrink-0">
                            <span className="text-xs font-extrabold text-slate-750 block truncate" title={opt}>
                              {opt}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400">{count}명</span>
                          </div>
                          {/* Bar Column */}
                          <div className="flex-1 bg-slate-50 border border-slate-200/50 h-7 rounded-lg overflow-hidden shadow-inner relative flex items-center">
                            <div
                              className="bg-indigo-600 hover:bg-indigo-500 h-full rounded-l-md transition-all duration-700 ease-out origin-left relative"
                              style={{ width: `${val}%` }}
                            >
                              <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/5 to-white/10" />
                            </div>
                            {val >= 8 && (
                              <span className="absolute left-3 text-[10px] font-extrabold text-white pointer-events-none drop-shadow-xs">
                                {val}%
                              </span>
                            )}
                          </div>
                          {/* Value column */}
                          <div className="w-16 text-left pl-2 shrink-0">
                            <span className="text-xs font-extrabold text-indigo-700">{val}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Helpful Hint */}
      <div className="mt-5 bg-indigo-50/20 border border-indigo-100/50 rounded-xl p-4 flex items-start gap-3">
        <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600 mt-0.5">
          <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
        </div>
        <div className="text-xs text-slate-500 leading-relaxed font-medium">
          <p className="font-bold text-slate-800 mb-1">💡 PPT / Excel 즉시 연동 완벽 지원</p>
          <p className="text-slate-600">
            위 표는 파워포인트(PPT) 차트 데이터 편집 창이나 엑셀 시트에 그대로 붙여넣을 수 있는 완벽한 행/열 규격을 지니고 있습니다.
            <strong className="text-indigo-600 font-semibold"> [클립보드 복사]</strong> 버튼을 누른 후, PPT 차트 데이터 편집 창의 원하는 영역에 <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-600 font-bold font-mono">Ctrl + V</kbd>를 누르면 깔끔하게 표 데이터가 삽입됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
