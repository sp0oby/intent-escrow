"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { TARGET_CHAIN } from "@/lib/contract";

// Site-wide banner: visible on every page whenever a wallet is connected but
// reporting a chainId that isn't Sepolia. Catches cases where users land on
// a fresh browser, or any page without its own inline chain guard, so they
// don't accidentally send a tx that the wallet will silently reject (or, in
// the EIP-712 case, sign a domain-bound message the contract can't verify).
export function WrongChainBanner() {
  // IMPORTANT: read chainId from useAccount (the connector), not useChainId
  // (the wagmi config). For a single-chain config, useChainId always returns
  // the configured chain even if the wallet is sitting on mainnet, which
  // defeats the whole guard.
  const { chainId, status } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (status !== "connected") return null;
  if (chainId === TARGET_CHAIN.id) return null;

  return (
    <div className="border-b border-yellow-400/40 bg-yellow-400/10">
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <span className="font-medium text-yellow-300">Wrong network.</span>{" "}
          <span className="text-muted">
            Your wallet is on chain {chainId ?? "unknown"}. This app only works
            on {TARGET_CHAIN.name}.
          </span>
        </div>
        <button
          className="btn"
          disabled={isPending}
          onClick={() => switchChain({ chainId: TARGET_CHAIN.id })}
        >
          {isPending ? "Switching…" : `Switch to ${TARGET_CHAIN.name}`}
        </button>
      </div>
    </div>
  );
}
