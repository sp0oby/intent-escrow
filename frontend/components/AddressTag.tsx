"use client";

import { useState } from "react";
import { TARGET_CHAIN } from "@/lib/contract";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function explorerUrl(addr: string) {
  const base =
    TARGET_CHAIN.blockExplorers?.default?.url ?? "https://sepolia.etherscan.io";
  return `${base}/address/${addr}`;
}

// Tiny, dependency-free address chip that covers the three things the
// ethskills frontend-ux checklist asks for: visible identity, copy-to-
// clipboard, and explorer link. Full ENS support is out of scope on Sepolia.
export function AddressTag({
  address,
  truncate = true,
  label,
}: {
  address: string;
  truncate?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard API may be unavailable in non-secure contexts; fail quietly.
    }
  }

  const display = truncate ? short(address) : address;

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      {label && <span className="text-muted">{label}</span>}
      <span>{display}</span>
      <button
        type="button"
        onClick={copy}
        className="text-muted hover:text-white px-1"
        aria-label="Copy address"
        title={copied ? "Copied" : "Copy"}
      >
        {copied ? "✓" : "⧉"}
      </button>
      <a
        href={explorerUrl(address)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-muted hover:text-white px-1"
        aria-label="Open on block explorer"
        title="Open on block explorer"
      >
        ↗
      </a>
    </span>
  );
}
