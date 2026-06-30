/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type QuestionType = 'single' | 'multi' | 'scale' | 'text';

export interface QuestionGroup {
  mainCode: string;
  type: QuestionType;
  columns: string[];
  options: string[]; // Sorted options (e.g. ['1', '2', '3'] or column names for column-per-option multi)
  multiOptionMode?: 'column-per-option' | 'value-per-column';
  label?: string; // Optional descriptive label
}

export interface Respondent {
  id: number;
  SQ1: number | string | null; // Gender (1: Male, 2: Female, or raw text)
  SQ2: number | string | null; // Age (1: <=19, 2: 20-29, 3: 30-39, etc., or raw number)
  rawData: Record<string, any>;
}

export type DemographicKey =
  | 'all'
  | 'male'
  | 'female'
  | 'age_19'
  | 'age_20s'
  | 'age_30s'
  | 'age_40s'
  | 'age_50s'
  | 'age_60s';

export interface DemographicInfo {
  key: DemographicKey;
  label: string;
  count: number;
}

export interface TabulationRow {
  rowLabel: string;
  rowKey: string;
  values: Record<string, number>; // Maps option to percentage (0 to 100)
  counts: Record<string, number>; // Maps option to count
  totalN: number; // Total respondents in this group who answered
}

export interface TabulationTable {
  title: string;
  headers: string[]; // Options/Columns of the table
  rows: TabulationRow[];
}
