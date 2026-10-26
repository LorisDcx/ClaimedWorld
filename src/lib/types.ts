import type { Appearance, Progression } from './progression-catalog';
export interface Country {
  id: string;
  name: string;
  englishName: string;
  code: string;
  flag: string;
  path: string;
  overviewPath: string;
  regionalPath: string;
  center: number[];
  bounds: number[][];
  sponsorBox: number[];
  parentName: string | null;
  anchors: { point: number[]; size: number }[];
  overviewMarker: boolean;
  area: number;
  tier: number;
}
export interface Camp {
  id: string;
  name: string;
  color: string;
  emblem: string;
  score: number;
  alliance: boolean;
  nextExpiryAt?: number;
  appearance?: Appearance;
}
export interface Territory {
  id: string;
  owner: Camp | null;
  scores: Camp[];
  sponsor: Sponsor | null;
  changes: number;
  sponsorReserved?: boolean;
}
export interface Sponsor {
  house?: boolean;
  logo_url?: string;
  id: string;
  country_id: string;
  name: string;
  description: string;
  url: string;
  initials: string;
  color: string;
  status: string;
  amount: number;
  user_id?: string;
  payment_status?: string;
  logo_id?: string | null;
}
export interface SponsorBid extends Sponsor {
  winning: boolean;
  nextExpiryAt: number;
}
export interface SponsorStake {
  id: string;
  user_id: string;
  campaign_id: string;
  country_id: string;
  amount_cents: number;
  placed_at: number;
  expires_at: number;
  changed_at: number;
  status: string;
  origin_id: string;
}
export interface SponsorConsoleData {
  wallet: { balance_cents: number; debt_cents: number; frozen: number };
  minimumBidCents: number;
  campaigns: Sponsor[];
  stakes: SponsorStake[];
  bids: SponsorBid[];
  ledger: { id: string; kind: string; amount_cents: number; created_at: number }[];
}
export interface Player {
  id: string;
  username: string;
  color: string;
  wallet: number;
  reserve: number;
  nextGenerationAt: number;
  stockCap: number;
  generationRate: number;
  seasonBonus: {
    sourceSeason: number;
    activeDays: number;
    usefulInfluence: number;
    territoryDays: number;
    capacityBonus: number;
    rateBonus: number;
    startingInfluence: number;
  } | null;
  alliance_id: string | null;
  alliance_role: 'leader' | 'general' | 'member';
  alliance_joined_at: number;
  cooldown_until: number;
  isAdmin: boolean;
  created_at: number;
  alliance?: string;
  appearance?: Appearance;
}
export interface Alliance {
  id: string;
  name: string;
  color: string;
  emblem: string;
  description: string;
  leader_id: string;
  leader: string;
  members: number;
  territories: number;
  influence: number;
  invite: string;
  objective: string;
  targets: string[];
  treasury: number;
  treasuryCap: number;
  memberLimit: number;
}
export interface Activity {
  id: number;
  text: string;
  color: string;
  created_at: number;
  country_id: string | null;
}
export interface Season {
  id: number;
  starts_at: number;
  ends_at: number;
  archived_at: number | null;
}
export interface Snapshot {
  realtime?: { url: string; key: string } | null;
  paymentsMode?: 'disabled' | 'test' | 'live';
  progression: Progression | null;
  player: Player | null;
  territories: Territory[];
  alliances: Alliance[];
  activity: Activity[];
  season: Season;
  players: number;
  contributions: number;
  paymentsEnabled: boolean;
  sponsorAuctions: SponsorBid[];
  sponsorWallet: { balance_cents: number; debt_cents: number; frozen: number } | null;
  leaderboard: Camp[];
  archived: { id: number; starts_at: number; ends_at: number; summary: string }[];
  serverTime: number;
}
