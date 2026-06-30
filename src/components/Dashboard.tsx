/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Respondent,
  QuestionGroup,
  QuestionType,
  DemographicKey,
  DemographicInfo,
  TabulationTable,
} from '../types';
import {
  analyzeSchema,
  partitionRespondents,
  getDemographicInfoList,
  tabulateQuestion,
  convertQuestionType,
} from '../utils/parser';
import { generateDemoDataset } from '../utils/demoData';
import QuestionList from './QuestionList';
import TableViewer from './TableViewer';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
  Play,
  Download,
  Users,
  Grid,
  CheckCircle,
  ArrowRight,
  Database,
  Trash2,
  PieChart
} from 'lucide-react';

export default function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Data States
  const [filename, setFilename] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [groups, setGroups] = useState<QuestionGroup[]>([]);
  const [sqCols, setSqCols] = useState<{ SQ1: string | null; SQ2: string | null }>({ SQ1: null, SQ2: null });
  const [respondents, setRespondents] = useState<Respondent[]>([]);
  const [demographics, setDemographics] = useState<Record<DemographicKey, Respondent[]>>({} as any);
  const [demoInfo, setDemoInfo] = useState<DemographicInfo[]>([]);

  // Selected state
  const [selectedGroup, setSelectedGroup] = useState<QuestionGroup | null>(null);
  const [currentLayout, setCurrentLayout] = useState<'vertical' | 'horizontal'>('vertical');
  const [selectedScaleDemo, setSelectedScaleDemo] = useState<DemographicKey>('all');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse Excel file helper
  const processExcelData = (arrayBuffer: ArrayBuffer, name: string) => {
    try {
      setLoading(true);
      setError(null);

      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      if (workbook.SheetNames.length === 0) {
        throw new Error('엑셀 파일 내에 시트가 존재하지 않습니다.');
      }

      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Retrieve headers in original column order to prevent alphabetical rearrangement
      const rowsArray = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
      if (rowsArray.length === 0) {
        throw new Error('시트에 데이터가 없습니다.');
      }

      // Check if Row 2 (index 1) represents Question Codes
      let isTwoRowHeader = false;
      if (rowsArray.length >= 2) {
        const row1 = rowsArray[0] || [];
        const row2 = rowsArray[1] || [];
        
        let codeMatchCount = 0;
        let nonEmptyCount = 0;
        
        for (const cell of row2) {
          if (cell !== undefined && cell !== null && cell !== '') {
            nonEmptyCount++;
            const sCell = String(cell).trim();
            // Match standard code formats: SQ1, SQ2, A1, B1_m1, C1_n3
            if (/^[a-zA-Z]+\d+(_[a-zA-Z]+\d+)?$/i.test(sCell) || sCell.toUpperCase().startsWith('SQ1') || sCell.toUpperCase().startsWith('SQ2')) {
              codeMatchCount++;
            }
          }
        }
        
        // If at least 30% of non-empty cells in Row 2 look like standard question codes, it's a 2-row header
        if (nonEmptyCount > 0 && (codeMatchCount / nonEmptyCount) >= 0.3) {
          isTwoRowHeader = true;
        }
      }

      let rawHeaders: string[] = [];
      let objects: any[] = [];

      if (isTwoRowHeader) {
        // Synthesize headers by combining Row 2 (code) and Row 1 (label)
        const row1 = rowsArray[0] || [];
        const row2 = rowsArray[1] || [];
        const colCount = Math.max(row1.length, row2.length);

        for (let i = 0; i < colCount; i++) {
          const label = String(row1[i] || '').trim();
          const code = String(row2[i] || '').trim();
          
          if (code) {
            if (label && label !== code) {
              rawHeaders.push(`${code}. ${label}`);
            } else {
              rawHeaders.push(code);
            }
          } else if (label) {
            rawHeaders.push(label);
          } else {
            rawHeaders.push(`Column_${i + 1}`);
          }
        }

        // Construct rows starting from Row 3 (index 2)
        for (let rIdx = 2; rIdx < rowsArray.length; rIdx++) {
          const row = rowsArray[rIdx];
          if (!row) continue;
          // Check if row is entirely empty
          const isAllEmpty = row.every((cell: any) => cell === undefined || cell === null || cell === '');
          if (isAllEmpty) continue;

          const obj: any = {};
          for (let cIdx = 0; cIdx < rawHeaders.length; cIdx++) {
            const headerKey = rawHeaders[cIdx];
            obj[headerKey] = row[cIdx] !== undefined ? row[cIdx] : null;
          }
          objects.push(obj);
        }
      } else {
        // 1-row header fallback
        rawHeaders = (rowsArray[0] as any[]).map(h => String(h || '').trim()).filter(Boolean);
        objects = XLSX.utils.sheet_to_json<any>(worksheet, { defval: null });
      }

      if (objects.length === 0) {
        throw new Error('업로드된 엑셀 파일에 응답 데이터가 없습니다.');
      }

      // 1. Analyze schema
      const { groups: questionGroups, sqCols: identifiedSq } = analyzeSchema(rawHeaders, objects);

      // Check if SQ1 and SQ2 are mapped
      if (!identifiedSq.SQ1 || !identifiedSq.SQ2) {
        console.warn('SQ1(성별) 또는 SQ2(연령) 문항을 찾을 수 없습니다.');
      }

      // 2. Partition respondents
      const { respondents: rList, demographics: dMap } = partitionRespondents(objects, identifiedSq);
      const dInfo = getDemographicInfoList(dMap);

      // Update state
      setFilename(name);
      setHeaders(rawHeaders);
      setRawRows(objects);
      setGroups(questionGroups);
      setSqCols(identifiedSq);
      setRespondents(rList);
      setDemographics(dMap);
      setDemoInfo(dInfo);

      // Set default selected group
      if (questionGroups.length > 0) {
        setSelectedGroup(questionGroups[0]);
        setCurrentLayout('vertical');
        setSelectedScaleDemo('all');
      } else {
        throw new Error('해석할 수 있는 설문 문항(메인 코드 형식: A1, B2)을 엑셀 파일 내에서 찾을 수 없습니다.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || '엑셀 파일을 처리하는 동안 오류가 발생했습니다. 파일 형식을 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          if (evt.target?.result instanceof ArrayBuffer) {
            processExcelData(evt.target.result, file.name);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        setError('엑셀 파일(.xlsx, .xls) 또는 .csv 파일만 업로드할 수 있습니다.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result instanceof ArrayBuffer) {
          processExcelData(evt.target.result, file.name);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  // Launch with Demo Data
  const handleLoadDemo = () => {
    const { rows, blob, filename: demoFilename, headers: demoHeaders } = generateDemoDataset();
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result instanceof ArrayBuffer) {
        processExcelData(evt.target.result, demoFilename);
      }
    };
    reader.readAsArrayBuffer(blob);
  };

  // Download Demo File directly
  const handleDownloadDemoExcel = () => {
    const { blob, filename: demoFilename } = generateDemoDataset();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', demoFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Clear data
  const handleReset = () => {
    setFilename(null);
    setHeaders([]);
    setRawRows([]);
    setGroups([]);
    setSqCols({ SQ1: null, SQ2: null });
    setRespondents([]);
    setDemographics({} as any);
    setDemoInfo([]);
    setSelectedGroup(null);
    setError(null);
  };

  // Change question group type manually
  const handleChangeQuestionType = (mainCode: string, newType: QuestionType) => {
    setGroups(prevGroups => {
      const updated = prevGroups.map(g => {
        if (g.mainCode === mainCode) {
          return convertQuestionType(g, newType, rawRows);
        }
        return g;
      });
      return updated;
    });

    setSelectedGroup(prevSelected => {
      if (prevSelected && prevSelected.mainCode === mainCode) {
        return convertQuestionType(prevSelected, newType, rawRows);
      }
      return prevSelected;
    });
  };

  // Get currently active tabulation table
  const activeTable: TabulationTable | null = selectedGroup
    ? tabulateQuestion(selectedGroup, demographics, selectedScaleDemo)
    : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Upper Navigation bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-sm">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-950 font-sans tracking-tight flex items-center gap-2">
                설문조사 PPT 표 생성기
                <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 uppercase tracking-wider">v1.2.0</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">
                Survey Crosstab Generator for PowerPoint
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {filename && (
              <button
                id="reset-state-btn"
                onClick={handleReset}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl transition-all shadow-xs cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                새 파일 올리기
              </button>
            )}
            </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        
        {/* Error message */}
        {error && (
          <div className="mb-6 bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-rose-800">엑셀 데이터 오류</h4>
              <p className="text-xs text-rose-600 mt-1 font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* 1. STATE: Empty/Upload state */}
        {!filename ? (
          <div className="space-y-8 animate-fade-in">
            {/* Intro Welcome Card */}
            <div className="text-center max-w-2xl mx-auto mt-6">
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800 font-sans tracking-tight mb-3">
                엑셀 설문 결과를 <br />
                <span className="text-indigo-600">PPT 차트용 표</span>로 즉시 변환
              </h2>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                설문조사 결과 원시(raw) 데이터를 업로드하세요. 성별과 연령별로 비율을 자동 크로스 집계하여 파워포인트 차트 데이터 시트에 바로 복사 붙여넣기 할 수 있도록 정리해 드립니다.
              </p>
            </div>

            {/* Drag and Drop Zone */}
            <div
              id="upload-drag-zone"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="max-w-3xl mx-auto border-2 border-dashed border-slate-200 hover:border-indigo-500 bg-white hover:bg-indigo-50/5 cursor-pointer rounded-2xl p-10 md:p-14 text-center transition-all shadow-xs hover:shadow-sm"
            >
              <input
                id="excel-file-uploader"
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-6 shadow-xs">
                <Upload className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1.5 font-sans">
                설문 엑셀 파일 업로드하기
              </h3>
              <p className="text-sm text-slate-400 font-semibold mb-6">
                .xlsx, .xls, .csv 파일을 여기에 드래그하거나 클릭하여 선택하세요.
              </p>

              {/* Requirements summary banner */}
              <div className="max-w-md mx-auto grid grid-cols-2 gap-4 text-left border-t border-slate-200 pt-6">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-indigo-600 tracking-wider uppercase block">인구통계 변수 매핑</span>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    • <strong>SQ1</strong>: 성별 (1=남, 2=여)<br />
                    • <strong>SQ2</strong>: 연령 (1~6번 또는 실제 나이)
                  </p>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-indigo-600 tracking-wider uppercase block">질문 메인 코드 규칙</span>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    • <strong>단수형</strong>: A1 (메인 코드)<br />
                    • <strong>복수형</strong>: A1_m1 (_m 포함)<br />
                    • <strong>척도형</strong>: A1_n1 (_n 포함)
                  </p>
                </div>
              </div>
            </div>

            {/* Action Cards for Demo onboarding */}
            <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-6 flex items-start gap-4 shadow-xs hover:bg-slate-50/20 transition-all">
                <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
                  <Play className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1 font-sans">데모 데이터로 즉시 테스트</h4>
                  <p className="text-xs text-slate-400 font-semibold mb-4 leading-relaxed">
                    150명의 가상 응답 데이터가 내장되어 있어 업로드 없이 즉시 분석 기능을 테스트해 볼 수 있습니다.
                  </p>
                  <button
                    id="load-demo-btn"
                    onClick={handleLoadDemo}
                    className="inline-flex items-center gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl transition-all shadow-sm cursor-pointer"
                  >
                    데모 데이터로 시작하기
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 flex items-start gap-4 shadow-xs hover:bg-slate-50/20 transition-all">
                <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1 font-sans">샘플 엑셀 서식 다운로드</h4>
                  <p className="text-xs text-slate-400 font-semibold mb-4 leading-relaxed">
                    분석 가능한 설문 데이터 규격(SQ1, SQ2, 문항 코드 underbar)이 적용된 엑셀 템플릿 파일을 받아 형식을 확인하세요.
                  </p>
                  <button
                    id="download-sample-excel-btn"
                    onClick={handleDownloadDemoExcel}
                    className="inline-flex items-center gap-1.5 text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl transition-all shadow-sm cursor-pointer"
                  >
                    샘플 엑셀 다운로드
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* 2. STATE: Loaded & active analysis dashboards */
          <div className="space-y-6 animate-fade-in">
            
            {/* Status Summary Widget */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">활성 설문 데이터</div>
                    <div className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      {filename}
                      <span className="text-xs font-semibold text-slate-400">({respondents.length}명의 응답 데이터)</span>
                    </div>
                  </div>
                </div>

                {/* Badges summarizing analyzed layout groups */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-semibold text-slate-400">추출된 문항:</span>
                  <span className="font-bold px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md">
                    총 {groups.length}개
                  </span>
                  <span className="font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md">
                    단수형 {groups.filter(g => g.type === 'single').length}개
                  </span>
                  <span className="font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-md">
                    복수형 {groups.filter(g => g.type === 'multi').length}개
                  </span>
                  <span className="font-bold px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-md">
                    척도형 {groups.filter(g => g.type === 'scale').length}개
                  </span>
                </div>
              </div>

              {/* Interactive Demographic Breakdown Grid */}
              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Users className="w-3 h-3" />
                  분석 그룹 N수 정보 (인구 통계 세부 세그먼트)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2">
                  {demoInfo.map(info => (
                    <div
                      key={info.key}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        info.key === 'all'
                          ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                          : 'bg-slate-50/50 border-slate-200 text-slate-600 hover:border-slate-350'
                      }`}
                    >
                      <div className={`text-[10px] ${info.key === 'all' ? 'text-slate-300' : 'text-slate-400'} font-bold truncate`}>
                        {info.label}
                      </div>
                      <div className="text-xs font-extrabold mt-0.5">
                        N = {info.count}
                        <span className={`text-[9px] font-medium block ${info.key === 'all' ? 'text-indigo-300' : 'text-slate-400'}`}>
                          {info.key === 'all' ? '100%' : `${((info.count / respondents.length) * 100).toFixed(0)}%`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Main Application Interface Split Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Left Column: Sidebar with Question Lists (span 4) */}
              <div className="lg:col-span-4 h-full">
                <div className="lg:sticky lg:top-24">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Grid className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-xs font-extrabold text-slate-450 uppercase tracking-wider">
                      집계할 문항 선택
                    </h3>
                  </div>
                  <QuestionList
                    groups={groups}
                    selectedGroup={selectedGroup}
                    onSelectGroup={(g) => {
                      setSelectedGroup(g);
                      setSelectedScaleDemo('all');
                    }}
                  />
                </div>
              </div>

              {/* Right Column: Active Tabulation Preview and Controls (span 8) */}
              <div className="lg:col-span-8 space-y-6">
                {selectedGroup && activeTable ? (
                  <div className="space-y-6">
                    <TableViewer
                      table={activeTable}
                      questionGroup={selectedGroup}
                      currentLayout={currentLayout}
                      onChangeLayout={setCurrentLayout}
                      selectedScaleDemo={selectedScaleDemo}
                      onChangeScaleDemo={setSelectedScaleDemo}
                      onChangeQuestionType={handleChangeQuestionType}
                      respondents={respondents}
                    />

                    {/* How-to guidelines */}
                    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                      <h4 className="text-sm font-extrabold text-slate-900 mb-3 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        파워포인트 차트 데이터 입력 방법
                      </h4>
                      <ol className="text-xs text-slate-500 space-y-2.5 font-semibold leading-relaxed list-decimal list-inside">
                        <li className="text-slate-600">
                          파워포인트에서 원하는 형태의 <strong className="text-slate-850">막대형 차트(세로 또는 가로)</strong>를 생성합니다.
                        </li>
                        <li className="text-slate-600">
                          차트를 우클릭한 후 <strong className="text-slate-850">[데이터 편집]</strong>을 클릭하여 엑셀 형태의 입력 시트를 엽니다.
                        </li>
                        <li className="text-slate-600">
                          본 프로그램에서 <strong className="text-indigo-600 font-bold">[클립보드 복사]</strong> 버튼을 클릭합니다.
                        </li>
                        <li className="text-slate-600">
                          PPT 차트 데이터 편집 창의 <strong className="text-slate-850">A1 셀(또는 첫 번째 좌측 상단 셀)</strong>을 클릭하고 <kbd className="px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-slate-600 font-semibold font-mono">Ctrl + V</kbd>를 누르면 표 형식이 완벽하게 복제됩니다.
                        </li>
                        <li className="text-slate-600">
                          복수형 문항인 경우 여러 항목이 100%를 넘으므로, 누적 막대 그래프보다는 <strong className="text-slate-850">묶은 세로/가로 막대형 차트</strong>를 사용하는 것이 적합합니다.
                        </li>
                      </ol>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 p-16 text-center shadow-xs">
                    <PieChart className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-400 font-bold">왼쪽 문항 목록에서 집계할 문항을 클릭해 주세요.</p>
                  </div>
                )}
              </div>

            </div>

          </div>
        )}

      </main>

      <footer className="mt-16 border-t border-slate-100 bg-white py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 font-medium">
          <p>© 2026 설문조사 PPT 표 생성기. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span>단수형 • 복수형 • 척도형 교차집계 완벽 지원</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
