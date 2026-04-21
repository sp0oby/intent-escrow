"use client";

import { useMemo, useState } from "react";
import {
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { type Hex } from "viem";
import {
  INTENT_ESCROW_ABI,
  INTENT_ESCROW_ADDRESS,
  TARGET_CHAIN,
} from "@/lib/contract";
import { parseContractError } from "@/lib/errors";

type Parsed = {
  escrowId: bigint;
  amount: bigint;
  deadline: bigint;
  nonce: bigint;
  signature: Hex;
};

function parsePayload(raw: string): Parsed | string {
  try {
    const obj = JSON.parse(raw);
    return {
      escrowId: BigInt(obj.escrowId),
      amount: BigInt(obj.amount),
      deadline: BigInt(obj.deadline),
      nonce: BigInt(obj.nonce),
      signature: obj.signature as Hex,
    };
  } catch (e) {
    return (e as Error).message;
  }
}

export function SettleIntentCard({ escrowId }: { escrowId: bigint }) {
  const chainId = useChainId();
  const [raw, setRaw] = useState("");
  const parsed = useMemo(() => (raw.trim() ? parsePayload(raw) : null), [raw]);
  const ok = parsed && typeof parsed !== "string";
  const matchesId = ok && parsed.escrowId === escrowId;

  const {
    writeContract,
    data: hash,
    isPending,
    error,
  } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  function onSettle() {
    if (!ok || !matchesId) return;
    writeContract({
      address: INTENT_ESCROW_ADDRESS,
      abi: INTENT_ESCROW_ABI,
      functionName: "settleWithSignature",
      args: [parsed.escrowId, parsed.amount, parsed.deadline, parsed.signature],
    });
  }

  const wrongChain = chainId !== TARGET_CHAIN.id;

  return (
    <div className="card space-y-3">
      <div className="text-xs uppercase tracking-wider text-muted">
        Settle with signature
      </div>
      <p className="text-sm text-muted">
        Paste the intent payload produced by the beneficiary. Anyone can submit
        it; gas is paid by whoever submits.
      </p>
      <textarea
        rows={6}
        className="input font-mono text-xs"
        placeholder='{"escrowId":"0","amount":"...","deadline":"...","nonce":"...","signature":"0x..."}'
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      {parsed && typeof parsed === "string" && (
        <div className="text-sm text-red-400">Invalid JSON: {parsed}</div>
      )}
      {ok && !matchesId && (
        <div className="text-sm text-red-400">
          Payload escrowId ({parsed.escrowId.toString()}) does not match this
          page ({escrowId.toString()}).
        </div>
      )}
      <button
        className="btn"
        disabled={!ok || !matchesId || wrongChain || isPending || receipt.isLoading}
        onClick={onSettle}
      >
        {isPending || receipt.isLoading ? "Submitting…" : "Submit settlement"}
      </button>
      {receipt.isSuccess && (
        <div className="text-sm text-accent">Settled. Tx mined.</div>
      )}
      {error && (
        <div className="text-sm text-red-400 break-words">
          {parseContractError(error)}
        </div>
      )}
    </div>
  );
}
