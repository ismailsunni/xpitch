import type { MatchAnalytics, FormatKey } from './analytics';
import type { LatLon } from './geo';
import type { Segment } from './segmentation';

export interface MatchPersistenceOptions {
  age: number | null;
  maxHR: number | null;
  maxHRSource: 'entered' | 'default' | null;
  restHR: number | null;
  sprintKmh: number;
  highIntensityKmh: number;
  format: FormatKey;
  groupGapMin: number;
}

export interface MatchPersistenceSnapshot {
  analytics: MatchAnalytics;
  rawFiles: { name: string; bytes: ArrayBuffer }[];
  files: string[];
  segments: Segment[];
  fields: { id: string; corners: LatLon[] }[];
  directions: Record<string, {
    attacking_dir: number;
    side_dir: number;
    flips: { attack: Record<string, number>; side: Record<string, number> };
  }>;
  selectedFieldId: string | null;
  matchTitle: string;
  location: string | null;
  breakFiles: string[];
  breakSessionStarts: number[];
  manualSplits: { sessionBreaks: number[]; halfBreaks: number[] } | null;
  options: MatchPersistenceOptions;
  source: { type: 'strava'; activityId: string } | null;
}
