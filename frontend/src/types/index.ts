export interface UserStake {
  activeStake: bigint;
  totalEarnings: bigint;
  stakeStartTime: bigint;
  stakeDayIndex: number;
  tier: number;
  referrer: string;
  isActive: boolean;
}

export interface DAOMember {
  isQualified: boolean;
  slotNumber: bigint;
  qualificationTime: bigint;
  lastVerifiedMonth: bigint;
  teamSize: bigint;
  teamVolume: bigint;
  legCount: number;
}

export interface LevelConfig {
  level: bigint;
  rate: bigint;
  directsRequired: bigint;
}
