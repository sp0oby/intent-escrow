"use client";

import { useReadContracts } from "wagmi";
import { formatEther } from "viem";
import {
  INTENT_ESCROW_ABI,
  INTENT_ESCROW_ADDRESS,
  NATIVE_ETH,
} from "@/lib/contract";

// Small client island that reads live numbers from the deployed IntentEscrow
// on Sepolia. Keeps the home page a server component overall; only this strip
// hydrates on the client.
export function LiveStats() {
  const { data, isLoading, isError } = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: INTENT_ESCROW_ADDRESS,
        abi: INTENT_ESCROW_ABI,
        functionName: "nextEscrowId",
      },
      {
        address: INTENT_ESCROW_ADDRESS,
        abi: INTENT_ESCROW_ABI,
        functionName: "totalLocked",
        args: [NATIVE_ETH],
      },
      {
        address: INTENT_ESCROW_ADDRESS,
        abi: INTENT_ESCROW_ABI,
        functionName: "protocolFeeBps",
      },
    ],
  });

  const escrowCount = data?.[0]?.result as bigint | undefined;
  const ethLocked = data?.[1]?.result as bigint | undefined;
  const feeBps = data?.[2]?.result as number | undefined;

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat
        label="Escrows created"
        value={formatCount(escrowCount, isLoading, isError)}
      />
      <Stat
        label="ETH currently locked"
        value={formatEth(ethLocked, isLoading, isError)}
      />
      <Stat
        label="Protocol fee"
        value={formatFee(feeBps, isLoading, isError)}
      />
      <Stat label="Network" value="Sepolia" />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-muted mb-1">
        {label}
      </div>
      <div className="text-xl font-mono text-accent leading-tight">{value}</div>
    </div>
  );
}

function formatCount(v: bigint | undefined, loading: boolean, err: boolean) {
  if (err) return "—";
  if (v === undefined) return loading ? "…" : "0";
  return v.toString();
}

function formatEth(v: bigint | undefined, loading: boolean, err: boolean) {
  if (err) return "—";
  if (v === undefined) return loading ? "…" : "0 ETH";
  const eth = formatEther(v);
  const [whole, frac = ""] = eth.split(".");
  const trimmed = frac.slice(0, 4).replace(/0+$/, "");
  return `${whole}${trimmed ? "." + trimmed : ""} ETH`;
}

function formatFee(v: number | undefined, loading: boolean, err: boolean) {
  if (err) return "—";
  if (v === undefined) return loading ? "…" : "0%";
  return `${(v / 100).toString()}%`;
}
