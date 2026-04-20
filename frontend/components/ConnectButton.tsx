"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { TARGET_CHAIN } from "@/lib/contract";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectButton() {
  const { address, status } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  if (status === "connected" && address) {
    if (chainId !== TARGET_CHAIN.id) {
      return (
        <button
          onClick={() => switchChain({ chainId: TARGET_CHAIN.id })}
          className="btn"
          disabled={switching}
        >
          {switching ? "Switching…" : `Switch to ${TARGET_CHAIN.name}`}
        </button>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs px-2 py-1 rounded bg-panel border border-edge">
          {short(address)}
        </span>
        <button onClick={() => disconnect()} className="btn-ghost">
          Disconnect
        </button>
      </div>
    );
  }

  // For simplicity show the first available connector (usually injected).
  const first = connectors[0];
  if (!first) return null;

  return (
    <button
      className="btn"
      disabled={isPending}
      onClick={() => connect({ connector: first })}
    >
      {isPending ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
