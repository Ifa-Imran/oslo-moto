import {
  UserRegistered,
  LevelUnlocked,
  ReferralPaid,
  ReferralRewardsClaimed,
} from "../generated/OSLOReferral/OSLOReferral";
import { ReferralPayment } from "../generated/schema";
import { toDecimal, getOrCreateProtocolStat, getOrCreateUser, ONE_BI } from "./helpers";
import { Bytes } from "@graphprotocol/graph-ts";

export function handleUserRegistered(event: UserRegistered): void {
  let user = getOrCreateUser(event.params.user);
  user.referrer = event.params.referrer;
  user.registrationNumber = event.params.registrationNumber;
  user.registeredAt = event.block.timestamp;
  user.save();

  // Add to referrer's direct referrals
  let referrer = getOrCreateUser(event.params.referrer);
  let directs = referrer.directReferrals;
  directs.push(event.params.user);
  referrer.directReferrals = directs;
  referrer.teamSize = referrer.teamSize.plus(ONE_BI);
  referrer.save();

  let stats = getOrCreateProtocolStat();
  stats.totalUsers = stats.totalUsers.plus(ONE_BI);
  stats.save();
}

export function handleLevelUnlocked(event: LevelUnlocked): void {
  let user = getOrCreateUser(event.params.user);
  user.unlockedLevels = event.params.level;
  user.save();
}

export function handleReferralPaid(event: ReferralPaid): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let payment = new ReferralPayment(id);
  payment.upline = event.params.upline;
  payment.downline = event.params.downline;
  payment.level = event.params.level.toI32();
  payment.amount = toDecimal(event.params.amount);
  payment.timestamp = event.block.timestamp;
  payment.txHash = event.transaction.hash;
  payment.save();

  let upline = getOrCreateUser(event.params.upline);
  upline.totalReferralEarned = upline.totalReferralEarned.plus(toDecimal(event.params.amount));
  upline.save();
}

export function handleReferralRewardsClaimed(event: ReferralRewardsClaimed): void {
  // Rewards already tracked via ReferralPaid, this is just the claim tx
}
