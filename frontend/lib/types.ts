import type { Address } from "viem";

export type Escrow = {
  depositor: Address;
  beneficiary: Address;
  token: Address;
  totalAmount: bigint;
  released: bigint;
  expiry: bigint;
  nonce: bigint;
  closed: boolean;
};

export type EscrowWithId = Escrow & { id: bigint };

export type EscrowStatus = "active" | "expired" | "closed";

export function statusOf(e: Escrow, now: number): EscrowStatus {
  if (e.closed) return "closed";
  if (Number(e.expiry) <= now) return "expired";
  return "active";
}
