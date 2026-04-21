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
        <LifecycleDiagram />
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

function LifecycleDiagram() {
  // UML-style sequence diagram rendered as inline SVG so it scales on every
  // viewport and respects the app's color tokens. Three swim lanes
  // (Depositor, Contract, Beneficiary) with dashed lifelines, arrows for
  // on-chain messages, and a highlighted callout for the single off-chain
  // (gasless) step — which is the whole point of the intent pattern.
  const ACCENT = "#6ee7b7";
  const MUTED = "#8b95a7";
  const EDGE = "#222634";
  const INK = "#e7ecf3";
  const PANEL = "#14171f";
  return (
    <div className="card overflow-x-auto">
      <svg
        role="img"
        aria-label="Sequence diagram of the intent-based escrow lifecycle."
        viewBox="0 0 640 380"
        className="w-full h-auto min-w-[520px]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <marker
            id="arrow-accent"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={ACCENT} />
          </marker>
          <marker
            id="arrow-muted"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={MUTED} />
          </marker>
        </defs>

        {/* Lane headers */}
        <g fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="13" fontWeight={500}>
          {[
            { x: 30, label: "Depositor" },
            { x: 255, label: "Contract" },
            { x: 480, label: "Beneficiary" },
          ].map(({ x, label }) => (
            <g key={label}>
              <rect x={x} y={10} width={130} height={32} rx={6} fill={PANEL} stroke={EDGE} />
              <text x={x + 65} y={31} textAnchor="middle" fill={INK}>
                {label}
              </text>
            </g>
          ))}
        </g>

        {/* Lifelines */}
        <g stroke={EDGE} strokeWidth={1} strokeDasharray="4 4">
          <line x1={95} y1={46} x2={95} y2={360} />
          <line x1={320} y1={46} x2={320} y2={360} />
          <line x1={545} y1={46} x2={545} y2={360} />
        </g>

        <g fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="12">
          {/* 1. Depositor -> Contract: createEscrow */}
          <text x={205} y={76} textAnchor="middle" fill={ACCENT}>
            createEscrow(...)
          </text>
          <line
            x1={95}
            y1={88}
            x2={315}
            y2={88}
            stroke={ACCENT}
            strokeWidth={1.5}
            markerEnd="url(#arrow-accent)"
          />

          {/* 2. Contract -> Beneficiary: EscrowCreated (event, dashed/muted) */}
          <text x={432} y={124} textAnchor="middle" fill={MUTED}>
            EscrowCreated event
          </text>
          <line
            x1={320}
            y1={136}
            x2={540}
            y2={136}
            stroke={MUTED}
            strokeWidth={1}
            strokeDasharray="3 3"
            markerEnd="url(#arrow-muted)"
          />

          {/* 3. Off-chain signing — highlighted as a callout, NOT an on-chain arrow */}
          <g>
            <rect
              x={400}
              y={170}
              width={220}
              height={52}
              rx={6}
              fill={PANEL}
              stroke={ACCENT}
              strokeOpacity={0.55}
            />
            <text x={510} y={190} textAnchor="middle" fill={ACCENT}>
              signTypedData (off-chain)
            </text>
            <text
              x={510}
              y={208}
              textAnchor="middle"
              fill={MUTED}
              fontSize="11"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              no gas · just a signed message
            </text>
            <line
              x1={545}
              y1={170}
              x2={545}
              y2={160}
              stroke={ACCENT}
              strokeOpacity={0.55}
              strokeDasharray="2 2"
            />
          </g>

          {/* 4. Anyone -> Contract: settleWithSignature(sig) */}
          <text x={432} y={256} textAnchor="middle" fill={ACCENT}>
            settleWithSignature(sig)
          </text>
          <line
            x1={540}
            y1={268}
            x2={325}
            y2={268}
            stroke={ACCENT}
            strokeWidth={1.5}
            markerEnd="url(#arrow-accent)"
          />

          {/* 5. Contract -> Beneficiary: payout + EscrowSettled + nonce bump
                 all happen in the same tx, so one arrow reads cleaner than
                 two parallel ones and avoids implying payout goes to the
                 depositor (that's the refund / cancel flow, not settle). */}
          <text x={432} y={306} textAnchor="middle" fill={ACCENT}>
            payout · EscrowSettled · nonce++
          </text>
          <line
            x1={325}
            y1={318}
            x2={540}
            y2={318}
            stroke={ACCENT}
            strokeWidth={1.5}
            markerEnd="url(#arrow-accent)"
          />
        </g>

        {/* Legend */}
        <g
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="11"
          fill={MUTED}
          transform="translate(30, 355)"
        >
          <line x1={0} y1={-3} x2={22} y2={-3} stroke={ACCENT} strokeWidth={1.5} />
          <text x={28} y={0}>
            on-chain call
          </text>
          <line
            x1={130}
            y1={-3}
            x2={152}
            y2={-3}
            stroke={MUTED}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text x={158} y={0}>
            event / return
          </text>
        </g>
      </svg>
    </div>
  );
}
