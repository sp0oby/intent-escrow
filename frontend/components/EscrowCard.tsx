"use client";

import Link from "next/link";
import { formatEther, formatUnits } from "viem";
import { NATIVE_ETH } from "@/lib/contract";
import { type EscrowWithId, statusOf } from "@/lib/types";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function EscrowCard({
  e,
  tokenSymbol,
  tokenDecimals,
}: {
  e: EscrowWithId;
  tokenSymbol?: string;
  tokenDecimals?: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const status = statusOf(e, now);
  const remaining = e.totalAmount - e.released;

  const isEth = e.token.toLowerCase() === NATIVE_ETH.toLowerCase();
  const fmt = (v: bigint) =>
    isEth
      ? `${formatEther(v)} ETH`
      : `${formatUnits(v, tokenDecimals ?? 18)} ${tokenSymbol ?? "TKN"}`;

  return (
    <Link
      href={`/escrow/${e.id}`}
      className="card block hover:border-accent transition"
    >
      <div className="flex items-center justify-between">
        <div className="font-mono text-sm text-muted">#{e.id.toString()}</div>
        <span
          className={`text-xs uppercase tracking-wider px-2 py-0.5 rounded border ${
            status === "active"
              ? "text-accent border-accent"
              : status === "expired"
              ? "text-yellow-400 border-yellow-400"
              : "text-muted border-edge"
          }`}
        >
          {status}
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold">{fmt(remaining)}</div>
      <div className="text-xs text-muted mt-1">
        {fmt(e.released)} released of {fmt(e.totalAmount)}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
        <div>Depositor</div>
        <div className="font-mono text-right text-white">
          {short(e.depositor)}
        </div>
        <div>Beneficiary</div>
        <div className="font-mono text-right text-white">
          {short(e.beneficiary)}
        </div>
        <div>Expiry</div>
        <div className="text-right text-white">
          {new Date(Number(e.expiry) * 1000).toLocaleString()}
        </div>
      </div>
    </Link>
  );
}
