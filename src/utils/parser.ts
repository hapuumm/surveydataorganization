/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Respondent,
  QuestionGroup,
  QuestionType,
  DemographicKey,
  DemographicInfo,
  TabulationTable,
  TabulationRow,
} from '../types';

/**
 * Extracts question code and its optional suffix from a header string.
 * Supports patterns like "A1", "A11_m1", "B4_n2" even if followed by text.
 * E.g., "A11_m1. 주로 사용하는 브랜드" -> Code: "A11", Suffix: "m1", FullCode: "A11_m1"
 */
export function parseHeaderCode(header: string): {
  fullCode: string;
  mainCode: string;
  suffix: string | null;
  label: string;
  isText?: boolean;
} | null {
  let cleanHeader = header.trim();
  let isText = false;

  // Check if header starts with (text) or (TEXT) or [text] or [TEXT]
  const textPrefixRegex = /^[\(\[][tT][eE][xX][tT][\)\]]\s*/;
  if (textPrefixRegex.test(cleanHeader)) {
    isText = true;
    cleanHeader = cleanHeader.replace(textPrefixRegex, "").trim();
  }

  // Match standard survey code format like A1, A1_m1, B4_n2, etc. at the start
  // Split by common delimiters (space, period, bracket) to isolate the code
  const firstWord = cleanHeader.split(/[\s.\[(]/)[0] || '';
  
  // Regex to match MainCode (Alphabet + Digits) and optional underbar suffix (Alphabet + Digits)
  const codeRegex = /^([a-zA-Z]+)(\d+)(?:_([a-zA-Z]+)(\d+))?$/;
  const match = firstWord.match(codeRegex);

  if (match) {
    const mainAlpha = match[1];
    const mainNum = match[2];
    const mainCode = `${mainAlpha}${mainNum}`;

    const suffAlpha = match[3];
    const suffNum = match[4];
    const suffix = suffAlpha && suffNum ? `${suffAlpha}${suffNum}` : null;
    const fullCode = suffix ? `${mainCode}_${suffix}` : mainCode;

    // The rest of the header is the label
    const label = cleanHeader.substring(firstWord.length).replace(/^[\s.\]\)::-]+/, '').trim() || fullCode;

    return {
      fullCode,
      mainCode,
      suffix,
      label,
      isText,
    };
  }

  // Fallback match: if there is no punctuation, try to match the prefix in the whole string
  const generalRegex = /^([a-zA-Z]+)(\d+)(?:_([a-zA-Z]+)(\d+))?/;
  const fallbackMatch = cleanHeader.match(generalRegex);
  if (fallbackMatch) {
    const mainCode = `${fallbackMatch[1]}${fallbackMatch[2]}`;
    const suffix = fallbackMatch[3] && fallbackMatch[4] ? `${fallbackMatch[3]}${fallbackMatch[4]}` : null;
    const fullCode = suffix ? `${mainCode}_${suffix}` : mainCode;
    const label = cleanHeader.substring(fallbackMatch[0].length).replace(/^[\s.\]\)::-]+/, '').trim() || fullCode;

    return {
      fullCode,
      mainCode,
      suffix,
      label,
      isText,
    };
  }

  return null;
}

/**
 * Standardizes the cell value to string or number, handling Excel nulls/empties.
 */
function cleanValue(val: any): string | number | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return null;
    // If it's a number string, convert it
    if (!isNaN(Number(trimmed)) && trimmed !== '') {
      return Number(trimmed);
    }
    return trimmed;
  }
  return val;
}

/**
 * Normalizes gender value (SQ1) to number: 1 (Male), 2 (Female)
 */
export function normalizeGender(val: any): number | string | null {
  const cleaned = cleanValue(val);
  if (cleaned === null) return null;
  if (cleaned === 1 || cleaned === '1') return 1;
  if (cleaned === 2 || cleaned === '2') return 2;
  const str = String(cleaned).trim();
  if (str === '남' || str === '남자' || str === '남성' || str.toLowerCase() === 'm' || str.toLowerCase() === 'male') {
    return 1;
  }
  if (str === '여' || str === '여자' || str === '여성' || str.toLowerCase() === 'f' || str.toLowerCase() === 'female') {
    return 2;
  }
  return str; // Return raw value if we can't classify
}

/**
 * Normalizes age value (SQ2) to category number:
 * 1 (<=19), 2 (20-29), 3 (30-39), 4 (40-49), 5 (50-59), 6 (>=60)
 */
export function normalizeAge(val: any): number | string | null {
  const cleaned = cleanValue(val);
  if (cleaned === null) return null;
  if (cleaned === 1 || cleaned === '1') return 1;
  if (cleaned === 2 || cleaned === '2') return 2;
  if (cleaned === 3 || cleaned === '3') return 3;
  if (cleaned === 4 || cleaned === '4') return 4;
  if (cleaned === 5 || cleaned === '5') return 5;
  if (cleaned === 6 || cleaned === '6') return 6;

  // Handle actual age numbers (e.g. 25, 43, 62)
  if (typeof cleaned === 'number') {
    if (cleaned <= 19) return 1;
    if (cleaned >= 20 && cleaned <= 29) return 2;
    if (cleaned >= 30 && cleaned <= 39) return 3;
    if (cleaned >= 40 && cleaned <= 49) return 4;
    if (cleaned >= 50 && cleaned <= 59) return 5;
    if (cleaned >= 60) return 6;
  }

  // Handle strings like "20대", "30s"
  const str = String(cleaned).trim();
  if (str.includes('19') || str.includes('10대') || str.includes('under 20') || str.includes('10s')) return 1;
  if (str.includes('20') || str.includes('20대') || str.includes('20s')) return 2;
  if (str.includes('30') || str.includes('30대') || str.includes('30s')) return 3;
  if (str.includes('40') || str.includes('40대') || str.includes('40s')) return 4;
  if (str.includes('50') || str.includes('50대') || str.includes('50s')) return 5;
  if (str.includes('60') || str.includes('60대') || str.includes('60세') || str.includes('60s') || str.includes('이상')) return 6;

  return str;
}

/**
 * Analyzes parsed data rows and groups columns into question blocks
 */
export function analyzeSchema(
  headers: string[],
  rows: any[]
): {
  groups: QuestionGroup[];
  sqCols: { SQ1: string | null; SQ2: string | null };
} {
  // Find SQ1 and SQ2 column names (case insensitive matching)
  let sq1Col: string | null = null;
  let sq2Col: string | null = null;

  for (const h of headers) {
    const hUpper = h.trim().toUpperCase();
    if (hUpper.startsWith('SQ1') && !sq1Col) {
      sq1Col = h;
    } else if (hUpper.startsWith('SQ2') && !sq2Col) {
      sq2Col = h;
    }
  }

  // Group columns by their main code
  const groupsMap: Record<string, { columns: string[]; labels: string[]; suffixes: string[]; isText?: boolean }> = {};

  for (const h of headers) {
    // Skip SQ1 and SQ2 from standard question list
    if (h === sq1Col || h === sq2Col) continue;

    const parsed = parseHeaderCode(h);
    if (!parsed) continue;

    const { mainCode, suffix, label, isText } = parsed;
    if (!groupsMap[mainCode]) {
      groupsMap[mainCode] = { columns: [], labels: [], suffixes: [], isText };
    }
    groupsMap[mainCode].columns.push(h);
    groupsMap[mainCode].labels.push(label);
    if (suffix) {
      groupsMap[mainCode].suffixes.push(suffix);
    }
  }

  const groups: QuestionGroup[] = [];

  for (const [mainCode, data] of Object.entries(groupsMap)) {
    // Sort columns to ensure consistent order (e.g. B4, B4_n2, B4_n3...)
    // A natural sort or alphabetically on full code
    const columnsWithParsed = data.columns.map(col => ({
      col,
      parsed: parseHeaderCode(col)
    }));

    columnsWithParsed.sort((a, b) => {
      if (!a.parsed || !b.parsed) return 0;
      // Main code matches. Compare suffix.
      const suffA = a.parsed.suffix;
      const suffB = b.parsed.suffix;
      if (!suffA && !suffB) return 0;
      if (!suffA) return -1; // null (no suffix) comes first (e.g. B4 before B4_n2)
      if (!suffB) return 1;

      // Extract number if any
      const numA = parseInt(suffA.replace(/\D/g, '')) || 0;
      const numB = parseInt(suffB.replace(/\D/g, '')) || 0;
      const alphaA = suffA.replace(/\d/g, '');
      const alphaB = suffB.replace(/\d/g, '');

      if (alphaA !== alphaB) return alphaA.localeCompare(alphaB);
      return numA - numB;
    });

    const sortedColumns = columnsWithParsed.map(item => item.col);

    // Identify suffixes
    const suffixes = data.suffixes;
    const hasM = suffixes.some(s => s.toLowerCase().startsWith('m'));
    const hasN = suffixes.some(s => s.toLowerCase().startsWith('n'));
    
    // Check if the only 'n' suffix is exactly 'n2'
    const nSuffixes = suffixes.filter(s => s.toLowerCase().startsWith('n'));
    const isOnlyN2 = nSuffixes.length === 1 && nSuffixes[0].toLowerCase() === 'n2';

    let type: QuestionType = 'single';
    if (data.isText) {
      type = 'text';
    } else if (hasN && !isOnlyN2) {
      type = 'scale';
    } else if (hasM || sortedColumns.length > 1) {
      type = 'multi';
    }

    // Determine descriptive label (use first non-empty label or mainCode)
    const label = data.labels.find(l => l && l !== mainCode) || mainCode;

    // Detect options / scale values
    const { options, multiOptionMode } = computeQuestionOptions(type, mainCode, sortedColumns, rows);

    groups.push({
      mainCode,
      type,
      columns: sortedColumns,
      options,
      multiOptionMode,
      label,
    });
  }

  // Sort groups alphabetically by their main code (e.g., A1, A2, B1, C1)
  groups.sort((a, b) => {
    const alphaA = a.mainCode.replace(/\d/g, '');
    const alphaB = b.mainCode.replace(/\d/g, '');
    const numA = parseInt(a.mainCode.replace(/\D/g, '')) || 0;
    const numB = parseInt(b.mainCode.replace(/\D/g, '')) || 0;

    if (alphaA !== alphaB) return alphaA.localeCompare(alphaB);
    return numA - numB;
  });

  return {
    groups,
    sqCols: { SQ1: sq1Col, SQ2: sq2Col },
  };
}

/**
 * Filter and categorize respondents into demographic groups
 */
export function partitionRespondents(
  rawRows: any[],
  sqCols: { SQ1: string | null; SQ2: string | null }
): {
  respondents: Respondent[];
  demographics: Record<DemographicKey, Respondent[]>;
} {
  const respondents: Respondent[] = rawRows.map((row, idx) => {
    const sq1Raw = sqCols.SQ1 ? row[sqCols.SQ1] : null;
    const sq2Raw = sqCols.SQ2 ? row[sqCols.SQ2] : null;

    return {
      id: idx + 1,
      SQ1: normalizeGender(sq1Raw),
      SQ2: normalizeAge(sq2Raw),
      rawData: row,
    };
  });

  const demographics: Record<DemographicKey, Respondent[]> = {
    all: [],
    male: [],
    female: [],
    age_19: [],
    age_20s: [],
    age_30s: [],
    age_40s: [],
    age_50s: [],
    age_60s: [],
  };

  for (const r of respondents) {
    demographics.all.push(r);

    // Gender filter
    if (r.SQ1 === 1) {
      demographics.male.push(r);
    } else if (r.SQ1 === 2) {
      demographics.female.push(r);
    }

    // Age filter
    if (r.SQ2 === 1) {
      demographics.age_19.push(r);
    } else if (r.SQ2 === 2) {
      demographics.age_20s.push(r);
    } else if (r.SQ2 === 3) {
      demographics.age_30s.push(r);
    } else if (r.SQ2 === 4) {
      demographics.age_40s.push(r);
    } else if (r.SQ2 === 5) {
      demographics.age_50s.push(r);
    } else if (r.SQ2 === 6) {
      demographics.age_60s.push(r);
    }
  }

  return {
    respondents,
    demographics,
  };
}

/**
 * Get Demographic metadata
 */
export function getDemographicInfoList(
  demographics: Record<DemographicKey, Respondent[]>
): DemographicInfo[] {
  return [
    { key: 'all', label: '전체', count: demographics.all.length },
    { key: 'male', label: '남성', count: demographics.male.length },
    { key: 'female', label: '여성', count: demographics.female.length },
    { key: 'age_19', label: '19세 이하', count: demographics.age_19.length },
    { key: 'age_20s', label: '20-29세', count: demographics.age_20s.length },
    { key: 'age_30s', label: '30-39세', count: demographics.age_30s.length },
    { key: 'age_40s', label: '40-49세', count: demographics.age_40s.length },
    { key: 'age_50s', label: '50-59세', count: demographics.age_50s.length },
    { key: 'age_60s', label: '60세 이상', count: demographics.age_60s.length },
  ];
}

/**
 * Tabulates data for Single-select question
 */
function tabulateSingle(
  group: QuestionGroup,
  demographics: Record<DemographicKey, Respondent[]>
): TabulationTable {
  const col = group.columns[0];
  const options = group.options;

  const demoRows: { key: DemographicKey; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'male', label: '남성' },
    { key: 'female', label: '여성' },
    { key: 'age_19', label: '19세 이하' },
    { key: 'age_20s', label: '20-29세' },
    { key: 'age_30s', label: '30-39세' },
    { key: 'age_40s', label: '40-49세' },
    { key: 'age_50s', label: '50-59세' },
    { key: 'age_60s', label: '60세 이상' },
  ];

  const rows: TabulationRow[] = demoRows.map(demo => {
    const list = demographics[demo.key];
    const totalN = list.filter(r => cleanValue(r.rawData[col]) !== null).length;

    const values: Record<string, number> = {};
    const counts: Record<string, number> = {};

    for (const opt of options) {
      const cnt = list.filter(r => String(cleanValue(r.rawData[col])) === opt).length;
      counts[opt] = cnt;
      values[opt] = totalN > 0 ? Number(((cnt / totalN) * 100).toFixed(1)) : 0;
    }

    // Adjust to exactly 100% if totalN > 0 and options are non-empty
    if (totalN > 0 && options.length > 0) {
      const sum = options.reduce((s, opt) => s + values[opt], 0);
      const diff = 100 - sum;
      if (Math.abs(diff) > 0.001 && Math.abs(diff) < 2.0) {
        // Find largest value to adjust rounding
        let maxOpt = options[0];
        let maxVal = values[maxOpt];
        for (const opt of options) {
          if (values[opt] > maxVal) {
            maxVal = values[opt];
            maxOpt = opt;
          }
        }
        values[maxOpt] = Number((values[maxOpt] + diff).toFixed(1));
      }
    }

    return {
      rowLabel: demo.label,
      rowKey: demo.key,
      values,
      counts,
      totalN,
    };
  });

  return {
    title: `${group.mainCode} [단수형] : ${group.label}`,
    headers: options,
    rows,
  };
}

/**
 * Tabulates data for Multi-select question
 */
function tabulateMulti(
  group: QuestionGroup,
  demographics: Record<DemographicKey, Respondent[]>
): TabulationTable {
  const options = group.options; // unique choices or columns depending on mode
  const cols = group.columns;
  const isColPerOption = group.multiOptionMode === 'column-per-option';

  const demoRows: { key: DemographicKey; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'male', label: '남성' },
    { key: 'female', label: '여성' },
    { key: 'age_19', label: '19세 이하' },
    { key: 'age_20s', label: '20-29세' },
    { key: 'age_30s', label: '30-39세' },
    { key: 'age_40s', label: '40-49세' },
    { key: 'age_50s', label: '50-59세' },
    { key: 'age_60s', label: '60세 이상' },
  ];

  const rows: TabulationRow[] = demoRows.map(demo => {
    const list = demographics[demo.key];
    
    // Total respondents in this demo group who answered at least one sub-question column of this group
    const totalN = list.filter(r => {
      return cols.some(col => cleanValue(r.rawData[col]) !== null);
    }).length;

    const values: Record<string, number> = {};
    const counts: Record<string, number> = {};

    for (let idx = 0; idx < options.length; idx++) {
      const opt = options[idx];
      let cnt = 0;

      if (isColPerOption) {
        // Option maps to a column directly
        const col = cols[idx];
        cnt = list.filter(r => {
          const val = cleanValue(r.rawData[col]);
          if (val === null) return false;
          const sVal = String(val).trim();
          // Check if checked
          return sVal === '1' || sVal === '1.0' || sVal === '선택' || sVal === 'Y' || sVal === 'y' || sVal === 'checked' || sVal.toLowerCase() === 'true';
        }).length;
      } else {
        // Option is a value stored across any column
        cnt = list.filter(r => {
          return cols.some(col => String(cleanValue(r.rawData[col])) === opt);
        }).length;
      }

      counts[opt] = cnt;
      values[opt] = totalN > 0 ? Number(((cnt / totalN) * 100).toFixed(1)) : 0;
    }

    return {
      rowLabel: demo.label,
      rowKey: demo.key,
      values,
      counts,
      totalN,
    };
  });

  return {
    title: `${group.mainCode} [복수형] : ${group.label}`,
    headers: options,
    rows,
  };
}

/**
 * Tabulates data for Scale-type question (e.g. B4, B4_n2, B4_n3...)
 * This generates rows for each sub-question code, for the selected demographic group
 */
export function tabulateScale(
  group: QuestionGroup,
  demographics: Record<DemographicKey, Respondent[]>,
  selectedDemo: DemographicKey = 'all'
): TabulationTable {
  const cols = group.columns;
  const options = group.options; // The ratings (e.g. 1, 2, 3, 4, 5)

  const list = demographics[selectedDemo];

  const rows: TabulationRow[] = cols.map(col => {
    const totalN = list.filter(r => cleanValue(r.rawData[col]) !== null).length;

    const values: Record<string, number> = {};
    const counts: Record<string, number> = {};

    for (const opt of options) {
      const cnt = list.filter(r => String(cleanValue(r.rawData[col])) === opt).length;
      counts[opt] = cnt;
      values[opt] = totalN > 0 ? Number(((cnt / totalN) * 100).toFixed(1)) : 0;
    }

    // Rounding adjustments to sum exactly to 100% for each sub-item row
    if (totalN > 0 && options.length > 0) {
      const sum = options.reduce((s, opt) => s + values[opt], 0);
      const diff = 100 - sum;
      if (Math.abs(diff) > 0.001 && Math.abs(diff) < 2.0) {
        let maxOpt = options[0];
        let maxVal = values[maxOpt];
        for (const opt of options) {
          if (values[opt] > maxVal) {
            maxVal = values[opt];
            maxOpt = opt;
          }
        }
        values[maxOpt] = Number((values[maxOpt] + diff).toFixed(1));
      }
    }

    // Get sub-item label
    const parsed = parseHeaderCode(col);
    const itemLabel = parsed ? `${parsed.fullCode}${parsed.label ? ` (${parsed.label})` : ''}` : col;

    return {
      rowLabel: itemLabel,
      rowKey: col,
      values,
      counts,
      totalN,
    };
  });

  const demoLabel = {
    all: '전체',
    male: '남성',
    female: '여성',
    age_19: '19세 이하',
    age_20s: '20-29세',
    age_30s: '30-39세',
    age_40s: '40-49세',
    age_50s: '50-59세',
    age_60s: '60세 이상',
  }[selectedDemo];

  return {
    title: `${group.mainCode} [척도형 - 세부 문항별 집계 (${demoLabel})] : ${group.label}`,
    headers: options,
    rows,
  };
}

/**
 * Tabulates data for Text (subjective) question
 */
export function tabulateText(
  group: QuestionGroup,
  demographics: Record<DemographicKey, Respondent[]>
): TabulationTable {
  const col = group.columns[0];
  const demoRows: { key: DemographicKey; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'male', label: '남성' },
    { key: 'female', label: '여성' },
    { key: 'age_19', label: '19세 이하' },
    { key: 'age_20s', label: '20-29세' },
    { key: 'age_30s', label: '30-39세' },
    { key: 'age_40s', label: '40-49세' },
    { key: 'age_50s', label: '50-59세' },
    { key: 'age_60s', label: '60세 이상' },
  ];

  const rows: TabulationRow[] = demoRows.map(demo => {
    const list = demographics[demo.key] || [];
    const validAnswers = list.filter(r => {
      const val = cleanValue(r.rawData[col]);
      return val !== null && String(val).trim() !== '';
    });
    const totalN = validAnswers.length;

    return {
      rowLabel: demo.label,
      rowKey: demo.key,
      values: {},
      counts: {},
      totalN,
    };
  });

  return {
    title: `${group.mainCode} [주관식] : ${group.label}`,
    headers: [],
    rows,
  };
}

/**
 * High level tabulation router
 */
export function tabulateQuestion(
  group: QuestionGroup,
  demographics: Record<DemographicKey, Respondent[]>,
  selectedDemo: DemographicKey = 'all' // only relevant for scale
): TabulationTable {
  if (group.type === 'single') {
    return tabulateSingle(group, demographics);
  } else if (group.type === 'multi') {
    return tabulateMulti(group, demographics);
  } else if (group.type === 'text') {
    return tabulateText(group, demographics);
  } else {
    return tabulateScale(group, demographics, selectedDemo);
  }
}

/**
 * Formats a tabulation table as a CSV string
 * Transposes based on user selection:
 * - Vertical bar: options as columns, demographics as rows (default for single/multi)
 * - Horizontal bar: demographics as columns, options as rows (transposed for single/multi)
 */
export function tableToCSV(
  table: TabulationTable,
  layout: 'vertical' | 'horizontal',
  positiveOptions?: string[],
  customRows?: TabulationRow[]
): string {
  const rowsToUse = customRows || table.rows;
  if (layout === 'vertical') {
    // Columns: [문항/그룹, 총 N수, Option1, Option2...]
    const headers = ['구분', 'N수', ...table.headers];
    if (positiveOptions && positiveOptions.length > 0) {
      headers.push(`긍정 응답률 (${positiveOptions.join('+')})`);
    }
    const csvRows = [headers.join(',')];

    for (const r of rowsToUse) {
      const row = [
        `"${r.rowLabel.replace(/"/g, '""')}"`,
        r.totalN,
        ...table.headers.map(opt => `${r.values[opt]}%`)
      ];
      if (positiveOptions && positiveOptions.length > 0) {
        const sum = positiveOptions.reduce((acc, opt) => acc + (r.values[opt] || 0), 0);
        row.push(`${Number(sum.toFixed(1))}%`);
      }
      csvRows.push(row.join(','));
    }
    return csvRows.join('\n');
  } else {
    // Transposed layout (Horizontal bar: rows become columns, columns become rows)
    // Row 1: 구분, 전체, 남성, 여성, 19세 이하... (The row headers of original table)
    // Then each row is Option, followed by percentage values
    const demoHeaders = ['옵션', ...rowsToUse.map(r => `"${r.rowLabel.replace(/"/g, '""')}" (N=${r.totalN})`)];
    const csvRows = [demoHeaders.join(',')];

    for (const opt of table.headers) {
      const row = [
        `"${opt.replace(/"/g, '""')}"`,
        ...rowsToUse.map(r => `${r.values[opt]}%`)
      ];
      csvRows.push(row.join(','));
    }
    return csvRows.join('\n');
  }
}

/**
 * Manually changes the type of a question group and recalculates its options & mode accordingly.
 */
export function convertQuestionType(
  group: QuestionGroup,
  newType: QuestionType,
  rows: any[]
): QuestionGroup {
  const sortedColumns = group.columns;
  const { options, multiOptionMode } = computeQuestionOptions(newType, group.mainCode, sortedColumns, rows);

  return {
    ...group,
    type: newType,
    options,
    multiOptionMode,
  };
}

/**
 * Helper to check if a value string looks like a checkbox checkmark.
 */
function isBinaryCheckmark(s: string): boolean {
  const lower = s.toLowerCase();
  return lower === '1' || lower === '1.0' || lower === '선택' || lower === 'y' || lower === 'yes' || lower === 'checked' || lower === 'true' || lower === 'o' || lower === 'v';
}

/**
 * Computes options and multiOptionMode for any question type given its columns and data rows.
 */
export function computeQuestionOptions(
  type: QuestionType,
  mainCode: string,
  columns: string[],
  rows: any[]
): {
  options: string[];
  multiOptionMode?: 'column-per-option' | 'value-per-column';
} {
  let options: string[] = [];
  let multiOptionMode: 'column-per-option' | 'value-per-column' | undefined;

  if (type === 'text') {
    return { options: [], multiOptionMode: undefined };
  }

  // Set of codes to exclude from actual options (to prevent code strings from leaking as options)
  const excludeSet = new Set<string>();
  excludeSet.add(mainCode.toUpperCase());
  for (const col of columns) {
    excludeSet.add(col.toUpperCase());
    const parsed = parseHeaderCode(col);
    if (parsed) {
      excludeSet.add(parsed.fullCode.toUpperCase());
      excludeSet.add(parsed.mainCode.toUpperCase());
    }
  }

  const isExcluded = (sVal: string): boolean => {
    const sUpper = sVal.trim().toUpperCase();
    if (excludeSet.has(sUpper)) return true;
    // Also exclude any cell values that are exactly standard question code formats (e.g., A1, SQ1, C1_m2)
    if (/^[a-zA-Z]+\d+(_[a-zA-Z]+\d+)?$/i.test(sVal.trim())) return true;
    return false;
  };

  if (type === 'single') {
    const valsSet = new Set<string>();
    const col = columns[0];
    if (col) {
      for (const row of rows) {
        const val = cleanValue(row[col]);
        if (val !== null) {
          const sVal = String(val).trim();
          if (!isExcluded(sVal)) {
            valsSet.add(sVal);
          }
        }
      }
    }
    options = Array.from(valsSet).sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  } else if (type === 'multi') {
    // Detect if all responses across all columns are binary checkmarks
    let allValuesAreBinary = true;
    let totalNonEmptyCount = 0;
    const valuesSet = new Set<string>();

    for (const col of columns) {
      for (const row of rows) {
        const val = cleanValue(row[col]);
        if (val !== null) {
          totalNonEmptyCount++;
          const sVal = String(val).trim();
          if (!isBinaryCheckmark(sVal)) {
            allValuesAreBinary = false;
          }
          if (!isExcluded(sVal)) {
            valuesSet.add(sVal);
          }
        }
      }
    }

    if (totalNonEmptyCount > 0 && allValuesAreBinary) {
      multiOptionMode = 'column-per-option';
      options = columns.map(col => {
        const parsed = parseHeaderCode(col);
        return parsed?.label || col;
      });
    } else {
      multiOptionMode = 'value-per-column';
      options = Array.from(valuesSet).sort((a, b) => {
        const numA = Number(a);
        const numB = Number(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      });
    }
  } else if (type === 'scale') {
    const valsSet = new Set<string>();
    for (const col of columns) {
      for (const row of rows) {
        const val = cleanValue(row[col]);
        if (val !== null) {
          const sVal = String(val).trim();
          if (!isExcluded(sVal)) {
            valsSet.add(sVal);
          }
        }
      }
    }
    options = Array.from(valsSet).sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }

  return {
    options,
    multiOptionMode,
  };
}
