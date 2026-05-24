import { BigDecimal, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { ProtocolStat, User } from "../generated/schema";

export let ZERO_BD = BigDecimal.fromString("0");
export let ZERO_BI = BigInt.fromI32(0);
export let ONE_BI = BigInt.fromI32(1);
export let EIGHTEEN_DECIMALS = BigInt.fromI32(18);

export function toDecimal(value: BigInt): BigDecimal {
  return value.toBigDecimal().div(
    BigInt.fromI32(10)
      .pow(18)
      .toBigDecimal()
  );
}

export function getOrCreateProtocolStat(): ProtocolStat {
  let stats = ProtocolStat.load("1");
  if (stats == null) {
    stats = new ProtocolStat("1");
    stats.totalDeposited = ZERO_BD;
    stats.totalRewardsPaid = ZERO_BD;
    stats.totalUsers = ZERO_BI;
    stats.totalBurned = ZERO_BD;
    stats.totalFeesCollected = ZERO_BD;
    stats.save();
  }
  return stats;
}

export function getOrCreateUser(address: Bytes): User {
  let user = User.load(address);
  if (user == null) {
    user = new User(address);
    user.referrer = null;
    user.directReferrals = [];
    user.teamSize = ZERO_BI;
    user.unlockedLevels = ZERO_BI;
    user.totalDeposited = ZERO_BD;
    user.totalClaimed = ZERO_BD;
    user.totalReferralEarned = ZERO_BD;
    user.currentRank = 0;
    user.isDAOMember = false;
    user.registrationNumber = ZERO_BI;
    user.registeredAt = ZERO_BI;
    user.save();
  }
  return user;
}
