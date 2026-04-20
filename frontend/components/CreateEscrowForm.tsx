"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { type Address, isAddress, parseEther, parseUnits } from "viem";
import {
  ERC20_ABI,
  INTENT_ESCROW_ABI,
  INTENT_ESCROW_ADDRESS,
  NATIVE_ETH,
  TARGET_CHAIN,
} from "@/lib/contract";

type AssetKind = "eth" | "erc20";

export function CreateEscrowForm() {
  const { address } = useAccount();
  const chainId = useChainId();

  const [asset, setAsset] = useState<AssetKind>("eth");
  const [tokenAddr, setTokenAddr] = useState<string>(
    process.env.NEXT_PUBLIC_DEMO_TOKEN_ADDRESS ?? ""
  );
  const [beneficiary, setBeneficiary] = useState<string>("");
  const [amount, setAmount] = useState<string>("0.01");
  const [expiryHours, setExpiryHours] = useState<string>("24");

  const wrongChain = chainId !== TARGET_CHAIN.id;
  const validToken = asset === "eth" || isAddress(tokenAddr);

  // Only read decimals for ERC-20 path and when address is valid.
  const { data: decimals } = useReadContract({
    address: validToken && asset === "erc20" ? (tokenAddr as Address) : undefined,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: { enabled: asset === "erc20" && isAddress(tokenAddr) },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: validToken && asset === "erc20" ? (tokenAddr as Address) : undefined,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, INTENT_ESCROW_ADDRESS] : undefined,
    query: { enabled: asset === "erc20" && isAddress(tokenAddr) && !!address },
  });

  const parsedAmount = useMemo(() => {
    try {
      if (asset === "eth") return parseEther(amount || "0");
      return parseUnits(amount || "0", Number(decimals ?? 18));
    } catch {
      return 0n;
    }
  }, [asset, amount, decimals]);

  const expiry = useMemo(() => {
    const hours = Number(expiryHours || "0");
    return BigInt(Math.floor(Date.now() / 1000) + hours * 3600);
  }, [expiryHours]);

  // --- Write: approve ---
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: approving,
    reset: resetApprove,
  } = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approveHash });

  const needsApproval =
    asset === "erc20" && parsedAmount > 0n && (allowance ?? 0n) < parsedAmount;

  function onApprove() {
    if (!isAddress(tokenAddr)) return;
    writeApprove({
      address: tokenAddr as Address,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [INTENT_ESCROW_ADDRESS, parsedAmount],
    });
  }

  // Refresh allowance once approval confirms so the Create button enables.
  if (approveReceipt.isSuccess && approveHash) {
    // fire-and-forget; wagmi batches sensibly.
    refetchAllowance();
    resetApprove();
  }

  // --- Write: createEscrow ---
  const {
    writeContract: writeCreate,
    data: createHash,
    isPending: creating,
    error: createError,
  } = useWriteContract();
  const createReceipt = useWaitForTransactionReceipt({ hash: createHash });

  function onCreate() {
    if (!isAddress(beneficiary)) return;
    const tokenArg = asset === "eth" ? NATIVE_ETH : (tokenAddr as Address);
    writeCreate({
      address: INTENT_ESCROW_ADDRESS,
      abi: INTENT_ESCROW_ABI,
      functionName: "createEscrow",
      args: [beneficiary as Address, tokenArg, parsedAmount, expiry],
      value: asset === "eth" ? parsedAmount : 0n,
    });
  }

  const canCreate =
    !wrongChain &&
    isAddress(beneficiary) &&
    parsedAmount > 0n &&
    Number(expiryHours) > 0 &&
    !needsApproval &&
    (asset === "eth" || isAddress(tokenAddr));

  return (
    <div className="card space-y-5">
      <div className="flex gap-2">
        <button
          onClick={() => setAsset("eth")}
          className={`px-3 py-1.5 rounded-lg border text-sm ${
            asset === "eth"
              ? "border-accent text-white bg-accent/10"
              : "border-edge text-muted"
          }`}
        >
          Native ETH
        </button>
        <button
          onClick={() => setAsset("erc20")}
          className={`px-3 py-1.5 rounded-lg border text-sm ${
            asset === "erc20"
              ? "border-accent text-white bg-accent/10"
              : "border-edge text-muted"
          }`}
        >
          ERC-20
        </button>
      </div>

      {asset === "erc20" && (
        <div>
          <label className="label">Token address</label>
          <input
            className="input"
            placeholder="0x…"
            value={tokenAddr}
            onChange={(e) => setTokenAddr(e.target.value)}
          />
          {decimals !== undefined && (
            <div className="text-xs text-muted mt-1">
              Decimals: {String(decimals)}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="label">Beneficiary (counterparty)</label>
        <input
          className="input"
          placeholder="0x…"
          value={beneficiary}
          onChange={(e) => setBeneficiary(e.target.value)}
        />
        <div className="text-xs text-muted mt-1">
          They will sign the release intent.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount</label>
          <input
            className="input"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Expiry (hours)</label>
          <input
            className="input"
            inputMode="numeric"
            value={expiryHours}
            onChange={(e) => setExpiryHours(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {/* 1. Network */}
        {wrongChain && (
          <span className="text-xs text-red-400">
            Switch wallet to {TARGET_CHAIN.name}.
          </span>
        )}

        {/* 2. Approve (ERC-20 only, if needed) */}
        {asset === "erc20" && needsApproval && (
          <button
            className="btn"
            disabled={approving || approveReceipt.isLoading || !isAddress(tokenAddr)}
            onClick={onApprove}
          >
            {approving || approveReceipt.isLoading ? "Approving…" : "Approve exact amount"}
          </button>
        )}

        {/* 3. Create */}
        <button
          className="btn"
          disabled={!canCreate || creating || createReceipt.isLoading}
          onClick={onCreate}
        >
          {creating || createReceipt.isLoading ? "Creating…" : "Create escrow"}
        </button>
      </div>

      {createReceipt.isSuccess && (
        <div className="text-sm text-accent">
          Escrow created. See the{" "}
          <a href="/escrows" className="underline">
            escrows list
          </a>
          .
        </div>
      )}
      {createError && (
        <div className="text-sm text-red-400 break-all">
          {createError.message}
        </div>
      )}
    </div>
  );
}
