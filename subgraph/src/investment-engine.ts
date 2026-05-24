import {
  Deposited,
  RewardsClaimed,
} from "../generated/OSLOInvestmentEngine/OSLOInvestmentEngine";
import { Deposit } from "../generated/schema";
import { toDecimal, getOrCreateProtocolStat, getOrCreateUser, ZERO_BD } from "./helpers";

export function handleDeposited(event: Deposited): void {
  let user = getOrCreateUser(event.params.user);
  let netDec = toDecimal(event.params.netAmount);
  user.totalDeposited = user.totalDeposited.plus(netDec);
  user.save();

  let depositId = event.params.user.toHexString() + "-" + event.params.depositIndex.toString();
  let deposit = new Deposit(depositId);
  deposit.user = event.params.user;
  deposit.amount = toDecimal(event.params.amount);
  deposit.netAmount = netDec;
  deposit.tier = event.params.tier.toI32();
  deposit.depositTime = event.block.timestamp;
  deposit.totalClaimed = ZERO_BD;
  deposit.active = true;
  deposit.depositIndex = event.params.depositIndex;
  deposit.save();

  let stats = getOrCreateProtocolStat();
  stats.totalDeposited = stats.totalDeposited.plus(netDec);
  stats.save();
}

export function handleRewardsClaimed(event: RewardsClaimed): void {
  let total = toDecimal(event.params.investmentReturn.plus(event.params.profitReturn));

  let user = getOrCreateUser(event.params.user);
  user.totalClaimed = user.totalClaimed.plus(total);
  user.save();

  let depositId = event.params.user.toHexString() + "-" + event.params.depositIndex.toString();
  let deposit = Deposit.load(depositId);
  if (deposit != null) {
    deposit.totalClaimed = deposit.totalClaimed.plus(total);
    deposit.save();
  }

  let stats = getOrCreateProtocolStat();
  stats.totalRewardsPaid = stats.totalRewardsPaid.plus(total);
  stats.save();
}

