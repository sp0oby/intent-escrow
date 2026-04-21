import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "A plain-English walkthrough of the intent-based escrow flow: deposit, sign an EIP-712 intent off-chain, and settle on-chain.",
};

export default function HowItWorksPage() {
  return (
    <div className="space-y-12">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">How it works</h1>
        <p className="text-muted max-w-2xl">
          A three-step flow where the beneficiary never has to send a
          transaction. They just sign a message; anyone can carry that
          signature on-chain to release funds.
        </p>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        <Step
          n={1}
          title="Depositor locks funds"
          body="The depositor calls createEscrow, picking a beneficiary, an asset (ETH or any ERC-20), an amount, and an expiry. Funds move into the contract and an escrow ID is minted."
        />
        <Step
          n={2}
          title="Beneficiary signs an intent"
          body="Off-chain, the beneficiary signs an EIP-712 SettleIntent: { escrowId, amount, deadline, nonce }. No gas, no transaction — it's just a signed message."
        />
        <Step
          n={3}
          title="Anyone settles on-chain"
          body="A relayer (or the depositor, or the beneficiary themselves) submits the signature to settleWithSignature. The contract verifies it, pays out, and bumps the nonce so the same signature can't be replayed."
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Why sign instead of just sending funds?</h2>
        <div className="card space-y-3 text-sm text-muted">
          <p>
            A signature is a portable, verifiable promise. The beneficiary can
            authorise a release from a phone with no ETH for gas; the depositor
            (or any relayer) pays the gas to execute it. That&apos;s the &quot;intent&quot;
            pattern: users express <em>what</em> they want, and anyone
            competes to make it happen.
          </p>
          <p>
            EIP-712 makes the signed payload human-readable in the wallet
            (&quot;Release 10 USDC from escrow #4 before Nov 1&quot;) instead of an
            opaque hex blob, which is what makes this safe to use in practice.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Safety rails</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Rail
            title="Replay protection"
            body="Each escrow has its own nonce. After every successful settlement the nonce increments, invalidating any previously-signed intent."
          />
          <Rail
            title="Deadlines"
            body="Every intent has a deadline. Sign once, and if it isn't submitted in time, it's automatically dead."
          />
          <Rail
            title="Partial releases"
            body="A signed intent can authorise part of the locked amount. The remainder stays escrowed and can be released (or refunded) later."
          />
          <Rail
            title="Refund after expiry"
            body="If nothing is settled by the expiry, the depositor can pull the remaining balance back out — no counterparty signature needed."
          />
          <Rail
            title="Cancel by beneficiary"
            body="The beneficiary can also walk away and return the funds before expiry. Both sides have an exit."
          />
          <Rail
            title="Smart-wallet friendly"
            body="Signatures are verified via ERC-1271, so the beneficiary can be a Safe, a 4337 account, or any contract wallet — not just an EOA."
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">The lifecycle, at a glance</h2>
        <div className="card font-mono text-xs leading-6 text-muted overflow-x-auto">
          <pre className="whitespace-pre">{String.raw`  depositor                 contract                 beneficiary / relayer
      │                         │                             │
      │ createEscrow(...)       │                             │
      │────────────────────────▶│                             │
      │                         │  EscrowCreated              │
      │                         │────────────────────────────▶│
      │                         │                             │
      │                         │     signTypedData (off-chain, gasless)
      │                         │◀────────────────────────────│
      │                         │                             │
      │                         │ settleWithSignature(sig)    │
      │                         │◀────────────────────────────│
      │                         │  EscrowSettled / nonce++    │
      │◀────────────────────────│────────────────────────────▶│
`}</pre>
        </div>
      </section>

      <section className="flex flex-wrap gap-3">
        <Link href="/create" className="btn">
          Try it: create an escrow
        </Link>
        <Link href="/escrows" className="btn-ghost">
          Browse existing escrows
        </Link>
      </section>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="card space-y-2">
      <div className="text-xs uppercase tracking-wider text-muted">
        {n} · {title.split(" ")[0]}
      </div>
      <div className="font-medium">{title}</div>
      <div className="text-sm text-muted">{body}</div>
    </div>
  );
}

function Rail({ title, body }: { title: string; body: string }) {
  return (
    <div className="card space-y-1">
      <div className="font-medium text-sm">{title}</div>
      <div className="text-sm text-muted">{body}</div>
    </div>
  );
}
