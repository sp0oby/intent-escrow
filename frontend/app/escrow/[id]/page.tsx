"use client";

import { use } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatEther, formatUnits } from "viem";
import {
  ERC20_ABI,
  INTENT_ESCROW_ABI,
  INTENT_ESCROW_ADDRESS,
  NATIVE_ETH,
} from "@/lib/contract";
import { SignIntentCard } from "@/components/SignIntentCard";
import { SettleIntentCard } from "@/components/SettleIntentCard";
import { statusOf } from "@/lib/types";

export default function EscrowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = use(params);
  const escrowId = BigInt(idStr);
  const { address } = useAccount();

  const { data: escrow, refetch, isLoading } = useReadContract({
    address: INTENT_ESCROW_ADDRESS,
    abi: INTENT_ESCROW_ABI,
    functionName: "getEscrow",
    args: [escrowId],
  });

  const isEth = escrow && escrow.token.toLowerCase() === NATIVE_ETH.toLowerCase();

  const { data: decimals } = useReadContract({
    address: !isEth && escrow ? escrow.token : undefined,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: { enabled: !!escrow && !isEth },
  });
  const { data: symbol } = useReadContract({
    address: !isEth && escrow ? escrow.token : undefined,
    abi: ERC20_ABI,
    functionName: "symbol",
    query: { enabled: !!escrow && !isEth },
  });

  const { writeContract: writeRefund, data: refundHash, isPending: refunding } = useWriteContract();
  const refundReceipt = useWaitForTransactionReceipt({ hash: refundHash });

  const { writeContract: writeCancel, data: cancelHash, isPending: cancelling } = useWriteContract();
  const cancelReceipt = useWaitForTransactionReceipt({ hash: cancelHash });

  if (isLoading || !escrow) {
    return <div className="text-muted">Loading escrow…</div>;
  }

  if (escrow.depositor === "0x0000000000000000000000000000000000000000") {
    return <div className="text-muted">Escrow #{idStr} not found.</div>;
  }

  const now = Math.floor(Date.now() / 1000);
  const status = statusOf(escrow, now);
  const symStr = isEth ? "ETH" : symbol ?? "TKN";
  const dec = isEth ? 18 : Number(decimals ?? 18);
  const fmt = (v: bigint) => (isEth ? formatEther(v) : formatUnits(v, dec));

  const isDepositor =
    !!address && address.toLowerCase() === escrow.depositor.toLowerCase();
  const isBeneficiary =
    !!address && address.toLowerCase() === escrow.beneficiary.toLowerCase();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-semibold">
          Escrow <span className="font-mono text-muted">#{idStr}</span>
        </h2>
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

      <div className="card grid md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Row k="Depositor" v={escrow.depositor} mono />
        <Row k="Beneficiary" v={escrow.beneficiary} mono />
        <Row k="Token" v={isEth ? "Native ETH" : escrow.token} mono />
        <Row k="Total" v={`${fmt(escrow.totalAmount)} ${symStr}`} />
        <Row k="Released" v={`${fmt(escrow.released)} ${symStr}`} />
        <Row k="Remaining" v={`${fmt(escrow.totalAmount - escrow.released)} ${symStr}`} />
        <Row k="Expiry" v={new Date(Number(escrow.expiry) * 1000).toLocaleString()} />
        <Row k="Nonce" v={escrow.nonce.toString()} mono />
      </div>

      {/* Beneficiary: sign intent */}
      {!escrow.closed && isBeneficiary && (
        <SignIntentCard
          escrowId={escrowId}
          escrow={escrow}
          tokenDecimals={dec}
          tokenSymbol={symStr}
        />
      )}

      {/* Anyone: settle using a pasted intent */}
      {!escrow.closed && <SettleIntentCard escrowId={escrowId} />}

      {/* Depositor: refund after expiry */}
      {!escrow.closed && isDepositor && status === "expired" && (
        <div className="card space-y-3">
          <div className="text-xs uppercase tracking-wider text-muted">
            Refund after expiry
          </div>
          <button
            className="btn"
            disabled={refunding || refundReceipt.isLoading}
            onClick={() =>
              writeRefund({
                address: INTENT_ESCROW_ADDRESS,
                abi: INTENT_ESCROW_ABI,
                functionName: "refundAfterExpiry",
                args: [escrowId],
              })
            }
          >
            {refunding || refundReceipt.isLoading
              ? "Submitting…"
              : `Refund ${fmt(escrow.totalAmount - escrow.released)} ${symStr}`}
          </button>
          {refundReceipt.isSuccess && (
            <div className="text-sm text-accent">Refunded.</div>
          )}
        </div>
      )}

      {/* Beneficiary: cancel and return remainder early */}
      {!escrow.closed && isBeneficiary && status !== "closed" && (
        <div className="card space-y-3">
          <div className="text-xs uppercase tracking-wider text-muted">
            Cancel (return remainder to depositor)
          </div>
          <button
            className="btn-ghost"
            disabled={cancelling || cancelReceipt.isLoading}
            onClick={() =>
              writeCancel({
                address: INTENT_ESCROW_ADDRESS,
                abi: INTENT_ESCROW_ABI,
                functionName: "cancelByBeneficiary",
                args: [escrowId],
              })
            }
          >
            {cancelling || cancelReceipt.isLoading ? "Submitting…" : "Cancel"}
          </button>
        </div>
      )}

      <button className="btn-ghost" onClick={() => refetch()}>
        Refresh
      </button>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <>
      <div className="text-muted">{k}</div>
      <div className={mono ? "font-mono break-all" : ""}>{v}</div>
    </>
  );
}
