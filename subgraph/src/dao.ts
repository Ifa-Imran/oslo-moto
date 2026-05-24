import {
  DAOMemberQualified,
  RoyaltyClaimed,
} from "../generated/OSLODAO/OSLODAO";
import { DAOMember, RoyaltyClaim } from "../generated/schema";
import { toDecimal, getOrCreateUser, ZERO_BD } from "./helpers";

export function handleDAOMemberQualified(event: DAOMemberQualified): void {
  let member = new DAOMember(event.params.user);
  member.memberNumber = event.params.memberNumber;
  member.teamSize = event.params.teamSize;
  member.qualifiedAt = event.block.timestamp;
  member.totalRoyaltyClaimed = ZERO_BD;
  member.save();

  let user = getOrCreateUser(event.params.user);
  user.isDAOMember = true;
  user.save();
}

export function handleRoyaltyClaimed(event: RoyaltyClaimed): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let claim = new RoyaltyClaim(id);
  claim.user = event.params.user;
  claim.amount = toDecimal(event.params.amount);
  claim.monthId = event.params.monthId;
  claim.timestamp = event.block.timestamp;
  claim.txHash = event.transaction.hash;
  claim.save();

  let member = DAOMember.load(event.params.user);
  if (member != null) {
    member.totalRoyaltyClaimed = member.totalRoyaltyClaimed.plus(toDecimal(event.params.amount));
    member.save();
  }
}
