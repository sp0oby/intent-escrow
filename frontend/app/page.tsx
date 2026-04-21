import Link from "next/link";
import { LiveStats } from "@/components/LiveStats";
import { AddressTag } from "@/components/AddressTag";
import { INTENT_ESCROW_ADDRESS } from "@/lib/contract";

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="space-y-4">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
          Gasless escrow releases, verified on-chain.
        </h1>
        <p className="text-muted max-w-2xl text-lg">
          A minimal intent-based escrow. Lock ETH or any ERC-20 for a
          counterparty; they authorise releases by signing an EIP-712{" "}
          <span className="font-mono text-accent">SettleIntent</span> off-chain.
          Anyone can submit the signature to release funds, so the signer pays
          no gas.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/create" className="btn">
            Create escrow
          </Link>
          <Link href="/how-it-works" className="btn-ghost">
            How it works
          </Link>
          <Link href="/escrows" className="btn-ghost">
            View escrows
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">
          Live on Sepolia
        </h2>
        <LiveStats />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">The flow</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <FlowCard
            n={1}
            title="Deposit"
            body="Depositor locks ETH or an ERC-20 for a beneficiary with an expiry. Funds sit in the contract, not in either party's wallet."
          />
          <FlowCard
            n={2}
            title="Sign"
            body="Beneficiary signs an EIP-712 intent off-chain authorising a partial or full release. No gas, no transaction."
          />
          <FlowCard
            n={3}
            title="Settle"
            body="Anyone submits the signature on-chain; funds move and the nonce bumps to prevent replay. Signer pays nothing."
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">The intent</h2>
        <p className="text-muted max-w-2xl text-sm">
          This is the exact EIP-712 typed struct the beneficiary signs. Wallets
          render it as a readable prompt instead of an opaque hex blob, and the
          per-escrow <span className="font-mono text-accent">nonce</span> plus{" "}
          <span className="font-mono text-accent">deadline</span> make every
          signature single-use.
        </p>
        <div className="card overflow-x-auto">
          <pre className="font-mono text-xs leading-6 text-muted">{`struct SettleIntent {
    uint256 escrowId;   // which escrow this release applies to
    uint256 amount;     // how much to release (partial ok)
    uint256 deadline;   // UNIX seconds — signature auto-expires
    uint256 nonce;      // per-escrow; bumps on every settlement
}`}</pre>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Safety, at a glance</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Safety
            title="Replay-safe signatures"
            body="EIP-712 domain + per-escrow nonce + deadline. A signed intent can't be reused across chains, contracts, escrows, or after its deadline."
          />
          <Safety
            title="Smart-wallet compatible"
            body="Signatures verified via ERC-1271, so the beneficiary can be a Safe, an ERC-4337 account, or any contract wallet — not just an EOA."
          />
          <Safety
            title="Reentrancy-hardened"
            body="Every fund-moving function is nonReentrant and follows Checks-Effects-Interactions. Mock-attack test included in the suite."
          />
          <Safety
            title="Fee-on-transfer aware"
            body="createEscrow records the actual ERC-20 amount received, not the caller-supplied amount, so deflationary tokens can't desync accounting."
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Under the hood</h2>
        <div className="flex flex-wrap gap-2">
          {[
            "Solidity ^0.8.28",
            "OpenZeppelin v5",
            "Foundry",
            "EIP-712",
            "ERC-1271",
            "SafeERC20",
            "Next.js 15",
            "wagmi v2",
            "viem",
            "TanStack Query",
            "Tailwind",
          ].map((t) => (
            <span
              key={t}
              className="inline-flex items-center text-xs font-mono text-muted border border-edge rounded-full px-3 py-1"
            >
              {t}
            </span>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted">
          Deployed on Sepolia
        </div>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">IntentEscrow (verified)</div>
            <AddressTag address={INTENT_ESCROW_ADDRESS} truncate={false} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/create" className="btn">
              Try it
            </Link>
            <a
              href="https://github.com/sp0oby/intent-escrow"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost"
            >
              View source
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

function FlowCard({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <div className="card space-y-2">
      <div className="text-xs uppercase tracking-wider text-muted">
        {n} · {title}
      </div>
      <div className="text-sm text-muted">{body}</div>
    </div>
  );
}

function Safety({ title, body }: { title: string; body: string }) {
  return (
    <div className="card space-y-1">
      <div className="font-medium text-sm">{title}</div>
      <div className="text-sm text-muted">{body}</div>
    </div>
  );
}
