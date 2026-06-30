/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { QuestionGroup, QuestionType } from '../types';
import { Search, HelpCircle, CheckSquare, Layers, HelpCircle as HelpIcon } from 'lucide-react';

interface QuestionListProps {
  groups: QuestionGroup[];
  selectedGroup: QuestionGroup | null;
  onSelectGroup: (group: QuestionGroup) => void;
}

type FilterType = 'all' | QuestionType;

export default function QuestionList({
  groups,
  selectedGroup,
  onSelectGroup,
}: QuestionListProps) {
  const [search, setSearch] = useState('');
  const [activeType, setActiveType] = useState<FilterType>('all');

  const filteredGroups = groups.filter(g => {
    // Filter by type
    if (activeType !== 'all' && g.type !== activeType) return false;

    // Filter by search query (case-insensitive on mainCode and label)
    const q = search.trim().toLowerCase();
    if (!q) return true;

    return (
      g.mainCode.toLowerCase().includes(q) ||
      (g.label && g.label.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col h-full bg-slate-50/30 rounded-xl border border-slate-200 p-5 shadow-sm">
      {/* Search Bar */}
      <div className="relative mb-4">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </span>
        <input
          id="question-search-input"
          type="text"
          placeholder="문항 코드 또는 키워드 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-sm pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 placeholder-slate-400 shadow-xs"
        />
      </div>

      {/* Tabs / Filter Badges */}
      <div className="flex flex-wrap gap-1.5 mb-4 border-b border-slate-200 pb-3">
        <button
          id="filter-type-all-btn"
          onClick={() => setActiveType('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeType === 'all'
               ? 'bg-slate-900 text-white shadow-sm'
               : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          전체 ({groups.length})
        </button>
        <button
          id="filter-type-single-btn"
          onClick={() => setActiveType('single')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeType === 'single'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-500 hover:bg-indigo-50/50 hover:text-indigo-600'
          }`}
        >
          단수형 ({groups.filter(g => g.type === 'single').length})
        </button>
        <button
          id="filter-type-multi-btn"
          onClick={() => setActiveType('multi')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeType === 'multi'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-500 hover:bg-emerald-50/50 hover:text-emerald-600'
          }`}
        >
          복수형 ({groups.filter(g => g.type === 'multi').length})
        </button>
        <button
          id="filter-type-scale-btn"
          onClick={() => setActiveType('scale')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeType === 'scale'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-500 hover:bg-amber-50/50 hover:text-amber-600'
          }`}
        >
          척도형 ({groups.filter(g => g.type === 'scale').length})
        </button>
        <button
          id="filter-type-text-btn"
          onClick={() => setActiveType('text')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeType === 'text'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-500 hover:bg-purple-50/50 hover:text-purple-600'
          }`}
        >
          주관식 ({groups.filter(g => g.type === 'text').length})
        </button>
      </div>

      {/* Question Cards Grid / List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[580px] custom-scrollbar">
        {filteredGroups.length === 0 ? (
          <div className="text-center py-12 px-4 bg-white border border-slate-200 rounded-xl">
            <HelpIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-semibold">검색 조건에 맞는 문항이 없습니다.</p>
          </div>
        ) : (
          filteredGroups.map(g => {
            const isSelected = selectedGroup?.mainCode === g.mainCode;

            return (
              <button
                id={`question-item-${g.mainCode}`}
                key={g.mainCode}
                onClick={() => onSelectGroup(g)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-2 relative cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-50/40 border-indigo-600 shadow-sm ring-1 ring-indigo-600/30'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/20 shadow-xs hover:shadow-sm'
                }`}
              >
                {/* Question Code and Badge */}
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-slate-800 font-mono text-sm">
                    {g.mainCode}
                  </span>
                  
                  {/* Type badges */}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    g.type === 'single' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                    g.type === 'multi' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                    g.type === 'text' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                    'bg-amber-50 text-amber-700 border-amber-100'
                  }`}>
                    {g.type === 'single' ? '단수형' :
                     g.type === 'multi' ? '복수형' :
                     g.type === 'text' ? '주관식' :
                     '척도형'}
                  </span>
                </div>

                {/* Question description */}
                <p className="text-xs font-semibold text-slate-500 line-clamp-2 leading-relaxed">
                  {g.label}
                </p>

                {/* Extra Stats Footer */}
                <div className="flex items-center gap-3 pt-1.5 border-t border-slate-100 mt-1 text-[10px] text-slate-400 font-medium">
                  <span>변수 {g.columns.length}개</span>
                  <span>•</span>
                  <span>{g.type === 'text' ? '응답 분류 분석' : `보기 ${g.options.length}개`}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
