import {
  RankAchieved,
  RankBonusClaimed,
  TurnoverRecorded,
} from "../generated/OSLORankSystem/OSLORankSystem";
import { RankAchievement, RankBonusClaim, WeeklyTurnover } from "../generated/schema";
import { toDecimal, getOrCreateUser, ZERO_BD } from "./helpers";

export function handleRankAchieved(event: RankAchieved): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let entity = new RankAchievement(id);
  entity.user = event.params.user;
  entity.rank = event.params.rank.toI32();
  entity.weekId = event.params.weekId;
  entity.turnover = toDecimal(event.params.turnover);
  entity.timestamp = event.block.timestamp;
  entity.save();

  let user = getOrCreateUser(event.params.user);
  user.currentRank = event.params.rank.toI32();
  user.save();
}

export function handleRankBonusClaimed(event: RankBonusClaimed): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let claim = new RankBonusClaim(id);
  claim.user = event.params.user;
  claim.amount = toDecimal(event.params.amount);
  claim.weekId = event.params.weekId;
  claim.timestamp = event.block.timestamp;
  claim.txHash = event.transaction.hash;
  claim.save();
}

export function handleTurnoverRecorded(event: TurnoverRecorded): void {
  let weekTurnoverId = event.params.user.toHexString() + "-" + event.params.weekId.toString();
  let turnover = WeeklyTurnover.load(weekTurnoverId);
  if (turnover == null) {
    turnover = new WeeklyTurnover(weekTurnoverId);
    turnover.user = event.params.user;
    turnover.weekId = event.params.weekId;
    turnover.amount = ZERO_BD;
  }
  turnover.amount = turnover.amount.plus(toDecimal(event.params.amount));
  turnover.save();
}
