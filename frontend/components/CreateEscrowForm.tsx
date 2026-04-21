"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
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
import { parseContractError } from "@/lib/errors";

type AssetKind = "eth" | "erc20";

export function CreateEscrowForm() {
  const { address, status } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  const [asset, setAsset] = useState<AssetKind>("eth");
  const [tokenAddr, setTokenAddr] = useState<string>(
    process.env.NEXT_PUBLIC_DEMO_TOKEN_ADDRESS ?? ""
  );
  const [beneficiary, setBeneficiary] = useState<string>("");
  const [amount, setAmount] = useState<string>("0.01");
  const [expiryHours, setExpiryHours] = useState<string>("24");

  const connected = status === "connected";
  const wrongChain = connected && chainId !== TARGET_CHAIN.id;
  const validToken = asset === "eth" || isAddress(tokenAddr);

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
  // Two overlapping pending states, per ethskills frontend-ux:
  //   - `approving`: wagmi's own isPending (click -> wallet -> hash)
  //   - `approveCooldown`: the 3s window after confirmation where the
  //     allowance cache may not have refreshed yet
  // Both must be `false` before the Create button re-enables, otherwise a
  // user can double-submit in the confirm->cache gap.
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: approving,
    reset: resetApprove,
  } = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approveHash });
  const [approveCooldown, setApproveCooldown] = useState(false);

  useEffect(() => {
    if (!approveReceipt.isSuccess) return;
    setApproveCooldown(true);
    const t = setTimeout(() => {
      refetchAllowance();
      setApproveCooldown(false);
      resetApprove();
    }, 2500);
    return () => clearTimeout(t);
  }, [approveReceipt.isSuccess, refetchAllowance, resetApprove]);

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

  const fieldsValid =
    isAddress(beneficiary) &&
    parsedAmount > 0n &&
    Number(expiryHours) > 0 &&
    (asset === "eth" || isAddress(tokenAddr));

  const canCreate =
    connected &&
    !wrongChain &&
    fieldsValid &&
    !needsApproval &&
    !approveCooldown;

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
          They will sign the release intent. EOAs or ERC-1271 contract wallets
          (Safe, ERC-4337 smart accounts, EIP-7702 delegates) both work.
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

      {/* Four-state primary action slot (ethskills frontend-ux rule 2):
          exactly one primary button, chosen in priority order:
            connect -> switch network -> approve -> create.
          Never show Approve and Create at the same time. */}
      <div className="pt-1">
        {!connected ? (
          <div className="text-xs text-muted">
            Connect your wallet (top right) to continue.
          </div>
        ) : wrongChain ? (
          <button
            className="btn"
            disabled={switching}
            onClick={() => switchChain({ chainId: TARGET_CHAIN.id })}
          >
            {switching ? "Switching…" : `Switch to ${TARGET_CHAIN.name}`}
          </button>
        ) : asset === "erc20" && needsApproval ? (
          <button
            className="btn"
            disabled={
              approving ||
              approveReceipt.isLoading ||
              approveCooldown ||
              !isAddress(tokenAddr) ||
              parsedAmount === 0n
            }
            onClick={onApprove}
          >
            {approving || approveReceipt.isLoading
              ? "Approving…"
              : approveCooldown
              ? "Confirming…"
              : "Approve exact amount"}
          </button>
        ) : (
          <button
            className="btn"
            disabled={!canCreate || creating || createReceipt.isLoading}
            onClick={onCreate}
          >
            {creating || createReceipt.isLoading
              ? "Creating…"
              : "Create escrow"}
          </button>
        )}
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
        <div className="text-sm text-red-400 break-words">
          {parseContractError(createError)}
        </div>
      )}
    </div>
  );
}
