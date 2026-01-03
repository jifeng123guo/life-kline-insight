
export interface ChartPoint {
  age: number;
  year: number;
  daYun: string;
  ganZhi: string;
  open: number;
  close: number;
  high: number;
  low: number;
  score: number;
  reason: string;
}

export interface BaziReport {
  bazi: string[];
  summary: string;
  summaryScore: number;
  personality: string;
  personalityScore: number;
  industry: string;
  industryScore: number;
  fengShui: string;
  fengShuiScore: number;
  wealth: string;
  wealthScore: number;
  marriage: string;
  marriageScore: number;
  health: string;
  healthScore: number;
  family: string;
  familyScore: number;
  chartPoints: ChartPoint[];
}

export interface UserInput {
  realName: string;
  gender: 'Male' | 'Female';
  birthDate: string; // YYYY-MM-DD
  birthTime: string; // HH:mm
  city: string;
}

export interface User {
  id: string;
  email: string;
  points: number;
  role: string;
}
