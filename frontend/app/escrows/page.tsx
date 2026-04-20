"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { type Address } from "viem";
import {
  INTENT_ESCROW_ABI,
  INTENT_ESCROW_ADDRESS,
} from "@/lib/contract";
import type { EscrowWithId } from "@/lib/types";
import { EscrowCard } from "@/components/EscrowCard";

export default function EscrowsPage() {
  const client = usePublicClient();
  const { address } = useAccount();

  // Reading `nextEscrowId` is the cheap way to bound the loop below.
  const { data: nextId, refetch } = useReadContract({
    address: INTENT_ESCROW_ADDRESS,
    abi: INTENT_ESCROW_ABI,
    functionName: "nextEscrowId",
  });

  const [escrows, setEscrows] = useState<EscrowWithId[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterMine, setFilterMine] = useState(false);

  useEffect(() => {
    async function load() {
      if (!client || nextId === undefined) return;
      setLoading(true);
      const total = Number(nextId);
      const ids = Array.from({ length: total }, (_, i) => BigInt(i));

      // Parallel multicall via individual getEscrow reads. viem batches these
      // at the HTTP level if the RPC supports multicall; even if not, this
      // is fine for a demo contract with dozens of escrows at most.
      const results = await Promise.all(
        ids.map((id) =>
          client
            .readContract({
              address: INTENT_ESCROW_ADDRESS,
              abi: INTENT_ESCROW_ABI,
              functionName: "getEscrow",
              args: [id],
            })
            .then((e) => ({ ...e, id }))
            .catch(() => null)
        )
      );
      setEscrows(results.filter(Boolean) as EscrowWithId[]);
      setLoading(false);
    }
    load();
  }, [client, nextId]);

  const displayed = filterMine
    ? escrows.filter(
        (e) =>
          address &&
          (e.depositor.toLowerCase() === address.toLowerCase() ||
            e.beneficiary.toLowerCase() === address.toLowerCase())
      )
    : escrows;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Escrows</h2>
          <p className="text-muted text-sm">
            All escrows ever created on this deployment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={filterMine}
              onChange={(e) => setFilterMine(e.target.checked)}
            />
            Only mine
          </label>
          <button className="btn-ghost" onClick={() => refetch()}>
            Refresh
          </button>
        </div>
      </div>

      {loading && <div className="text-muted">Loading…</div>}
      {!loading && displayed.length === 0 && (
        <div className="text-muted">
          No escrows yet. <a className="underline" href="/create">Create one</a>.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {displayed.map((e) => (
          <EscrowCard key={e.id.toString()} e={e} />
        ))}
      </div>
    </div>
  );
}
