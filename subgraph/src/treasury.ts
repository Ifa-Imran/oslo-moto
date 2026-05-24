import { FeesReceived, Distributed } from "../generated/OSLOTreasury/OSLOTreasury";
import { TreasuryDistribution } from "../generated/schema";
import { toDecimal, getOrCreateProtocolStat } from "./helpers";

export function handleFeesReceived(event: FeesReceived): void {
  let stats = getOrCreateProtocolStat();
  stats.totalFeesCollected = stats.totalFeesCollected.plus(toDecimal(event.params.amount));
  stats.save();
}

export function handleDistributed(event: Distributed): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let dist = new TreasuryDistribution(id);
  dist.toRank = toDecimal(event.params.toRank);
  dist.toDao = toDecimal(event.params.toDao);
  dist.toLiquidity = toDecimal(event.params.toLiquidity);
  dist.timestamp = event.block.timestamp;
  dist.txHash = event.transaction.hash;
  dist.save();
}
