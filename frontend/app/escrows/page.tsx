"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { type Address } from "viem";
import {
  ERC20_ABI,
  INTENT_ESCROW_ABI,
  INTENT_ESCROW_ADDRESS,
  NATIVE_ETH,
} from "@/lib/contract";
import type { EscrowWithId } from "@/lib/types";
import { EscrowCard } from "@/components/EscrowCard";
import { AddressTag } from "@/components/AddressTag";

type TokenMeta = { symbol: string; decimals: number };

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
  const [tokenMeta, setTokenMeta] = useState<Record<string, TokenMeta>>({});
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
      const found = results.filter(Boolean) as EscrowWithId[];
      setEscrows(found);

      // Batch-fetch symbol + decimals for every unique ERC-20 appearing in
      // the list, so cards render the real ticker instead of the "TKN"
      // fallback. ETH entries skip this path entirely.
      const uniqueTokens = Array.from(
        new Set(
          found
            .map((e) => e.token.toLowerCase())
            .filter((t) => t !== NATIVE_ETH.toLowerCase())
        )
      ) as Address[];

      const metas = await Promise.all(
        uniqueTokens.map(async (addr) => {
          try {
            const [symbol, decimals] = await Promise.all([
              client.readContract({
                address: addr,
                abi: ERC20_ABI,
                functionName: "symbol",
              }),
              client.readContract({
                address: addr,
                abi: ERC20_ABI,
                functionName: "decimals",
              }),
            ]);
            return [addr, { symbol: String(symbol), decimals: Number(decimals) }] as const;
          } catch {
            return [addr, null] as const;
          }
        })
      );
      const dict: Record<string, TokenMeta> = {};
      for (const [addr, meta] of metas) if (meta) dict[addr] = meta;
      setTokenMeta(dict);
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold">Escrows</h2>
          <p className="text-muted text-sm">
            All escrows ever created on this deployment.
          </p>
          <div className="text-xs text-muted mt-2">
            Contract:{" "}
            <AddressTag address={INTENT_ESCROW_ADDRESS} truncate={false} />
          </div>
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
        {displayed.map((e) => {
          const meta = tokenMeta[e.token.toLowerCase()];
          return (
            <EscrowCard
              key={e.id.toString()}
              e={e}
              tokenSymbol={meta?.symbol}
              tokenDecimals={meta?.decimals}
            />
          );
        })}
      </div>
    </div>
  );
}
