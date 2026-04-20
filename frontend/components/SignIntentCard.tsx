"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, useSignTypedData } from "wagmi";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import {
  INTENT_ESCROW_ADDRESS,
  NATIVE_ETH,
  TARGET_CHAIN,
  buildSettleIntentTypedData,
} from "@/lib/contract";
import type { Escrow } from "@/lib/types";

export function SignIntentCard({
  escrowId,
  escrow,
  tokenDecimals,
  tokenSymbol,
}: {
  escrowId: bigint;
  escrow: Escrow;
  tokenDecimals?: number;
  tokenSymbol?: string;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const isBeneficiary =
    !!address && address.toLowerCase() === escrow.beneficiary.toLowerCase();

  const isEth = escrow.token.toLowerCase() === NATIVE_ETH.toLowerCase();
  const decimals = isEth ? 18 : tokenDecimals ?? 18;
  const symbol = isEth ? "ETH" : tokenSymbol ?? "TKN";

  const remaining = escrow.totalAmount - escrow.released;
  const remainingStr = isEth
    ? formatEther(remaining)
    : formatUnits(remaining, decimals);

  const [amountStr, setAmountStr] = useState<string>(remainingStr);
  const [deadlineHours, setDeadlineHours] = useState<string>("1");

  const amount = useMemo(() => {
    try {
      return isEth ? parseEther(amountStr || "0") : parseUnits(amountStr || "0", decimals);
    } catch {
      return 0n;
    }
  }, [amountStr, isEth, decimals]);

  const deadline = useMemo(
    () => BigInt(Math.floor(Date.now() / 1000) + Number(deadlineHours || "0") * 3600),
    [deadlineHours]
  );

  const { signTypedData, data: signature, isPending, error } = useSignTypedData();
  const [copied, setCopied] = useState(false);

  function onSign() {
    const typed = buildSettleIntentTypedData({
      chainId: TARGET_CHAIN.id,
      verifyingContract: INTENT_ESCROW_ADDRESS,
      escrowId,
      amount,
      deadline,
      nonce: escrow.nonce,
    });
    signTypedData(typed);
  }

  // JSON payload the depositor will paste into the settle form.
  const payload = signature
    ? JSON.stringify(
        {
          escrowId: escrowId.toString(),
          amount: amount.toString(),
          deadline: deadline.toString(),
          nonce: escrow.nonce.toString(),
          signature,
        },
        null,
        2
      )
    : "";

  if (!isBeneficiary) {
    return (
      <div className="card text-sm text-muted">
        Connect as the beneficiary (
        <span className="font-mono text-white">{escrow.beneficiary.slice(0, 10)}…</span>
        ) to sign a release intent.
      </div>
    );
  }

  if (chainId !== TARGET_CHAIN.id) {
    return (
      <div className="card text-sm text-muted">
        Signing requires chain {TARGET_CHAIN.name}. (It doesn&apos;t cost gas, but your
        wallet needs to match the domain.)
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted mb-1">
          Sign release intent
        </div>
        <div className="text-sm text-muted">
          Remaining: {remainingStr} {symbol} · current nonce:{" "}
          <span className="font-mono">{escrow.nonce.toString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount to release</label>
          <input
            className="input"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Signature deadline (hours)</label>
          <input
            className="input"
            inputMode="numeric"
            value={deadlineHours}
            onChange={(e) => setDeadlineHours(e.target.value)}
          />
        </div>
      </div>

      <button
        className="btn"
        disabled={isPending || amount === 0n || amount > remaining}
        onClick={onSign}
      >
        {isPending ? "Awaiting wallet…" : "Sign intent (gasless)"}
      </button>

      {error && (
        <div className="text-sm text-red-400 break-all">{error.message}</div>
      )}

      {signature && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted">
            Intent payload — send this to the depositor
          </div>
          <textarea
            readOnly
            rows={8}
            className="input font-mono text-xs"
            value={payload}
          />
          <button
            className="btn-ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(payload);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy payload"}
          </button>
        </div>
      )}
    </div>
  );
}
