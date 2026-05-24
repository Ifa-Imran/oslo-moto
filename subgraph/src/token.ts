import { SellTaxApplied } from "../generated/OSLOToken/OSLOToken";
import { SellTax } from "../generated/schema";
import { toDecimal, getOrCreateProtocolStat } from "./helpers";

export function handleSellTaxApplied(event: SellTaxApplied): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let entity = new SellTax(id);
  entity.from = event.params.from;
  entity.taxAmount = toDecimal(event.params.taxAmount);
  entity.toLp = toDecimal(event.params.toLp);
  entity.burned = toDecimal(event.params.burned);
  entity.timestamp = event.block.timestamp;
  entity.txHash = event.transaction.hash;
  entity.save();

  let stats = getOrCreateProtocolStat();
  stats.totalBurned = stats.totalBurned.plus(toDecimal(event.params.burned));
  stats.save();
}
