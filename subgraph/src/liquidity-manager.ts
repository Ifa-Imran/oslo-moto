import {
  LiquidityAdded,
  BuybackBurned,
} from "../generated/OSLOLiquidityManager/OSLOLiquidityManager";
import { LiquidityEvent, BuybackBurn } from "../generated/schema";
import { toDecimal } from "./helpers";

export function handleLiquidityAdded(event: LiquidityAdded): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let entity = new LiquidityEvent(id);
  entity.busdAmount = toDecimal(event.params.busdAmount);
  entity.osloAmount = toDecimal(event.params.osloAmount);
  entity.liquidity = toDecimal(event.params.liquidity);
  entity.timestamp = event.block.timestamp;
  entity.txHash = event.transaction.hash;
  entity.save();
}

export function handleBuybackBurned(event: BuybackBurned): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let entity = new BuybackBurn(id);
  entity.busdSpent = toDecimal(event.params.busdSpent);
  entity.osloBurned = toDecimal(event.params.osloBurned);
  entity.timestamp = event.block.timestamp;
  entity.txHash = event.transaction.hash;
  entity.save();
}
