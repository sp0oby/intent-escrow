import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">
          Gasless escrow releases, verified on-chain.
        </h1>
        <p className="text-muted max-w-2xl">
          A minimal intent-based escrow. Lock ETH or any ERC-20 for a
          counterparty; they authorise releases by signing an EIP-712{" "}
          <span className="font-mono text-accent">SettleIntent</span> off-chain.
          Anyone can submit the signature to release funds, so the signer pays
          no gas.
        </p>
        <div className="flex gap-3">
          <Link href="/create" className="btn">
            Create escrow
          </Link>
          <Link href="/escrows" className="btn-ghost">
            View escrows
          </Link>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        <div className="card">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">
            1 · Deposit
          </div>
          <div className="text-sm">
            Depositor locks ETH or an ERC-20 for a beneficiary with an expiry.
          </div>
        </div>
        <div className="card">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">
            2 · Sign
          </div>
          <div className="text-sm">
            Beneficiary signs an EIP-712 intent off-chain authorising a partial
            or full release.
          </div>
        </div>
        <div className="card">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">
            3 · Settle
          </div>
          <div className="text-sm">
            Anyone submits the signature on-chain; funds move and the nonce
            bumps to prevent replay.
          </div>
        </div>
      </section>
    </div>
  );
}
