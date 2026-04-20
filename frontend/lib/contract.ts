import { type Address, parseAbi } from "viem";
import { sepolia } from "wagmi/chains";

// Deployed contract address. Read from env so the ABI object stays deploy-agnostic.
export const INTENT_ESCROW_ADDRESS =
  (process.env.NEXT_PUBLIC_INTENT_ESCROW_ADDRESS as Address) ??
  ("0x0000000000000000000000000000000000000000" as Address);

// Sentinel used by the contract to mean "native ETH".
export const NATIVE_ETH: Address = "0x0000000000000000000000000000000000000000";

// The target chain. Wrapped here so frontend components don't import wagmi/chains.
export const TARGET_CHAIN = sepolia;

// Human-readable ABI of the parts of IntentEscrow the frontend needs. Using
// `parseAbi` keeps the TS types inferred end-to-end.
export const INTENT_ESCROW_ABI = parseAbi([
  // reads
  "function nextEscrowId() view returns (uint256)",
  "function protocolFeeBps() view returns (uint16)",
  "function totalLocked(address token) view returns (uint256)",
  "function getEscrow(uint256 escrowId) view returns ((address depositor,address beneficiary,address token,uint256 totalAmount,uint256 released,uint64 expiry,uint64 nonce,bool closed))",
  "function hashSettleIntent(uint256 escrowId,uint256 amount,uint256 deadline,uint256 nonce) view returns (bytes32)",
  "function domainSeparator() view returns (bytes32)",
  // writes
  "function createEscrow(address beneficiary,address token,uint256 amount,uint64 expiry) payable returns (uint256)",
  "function settleWithSignature(uint256 escrowId,uint256 amount,uint256 deadline,bytes signature)",
  "function refundAfterExpiry(uint256 escrowId)",
  "function cancelByBeneficiary(uint256 escrowId)",
  // events (used by `getLogs`)
  "event EscrowCreated(uint256 indexed escrowId,address indexed depositor,address indexed beneficiary,address token,uint256 amount,uint64 expiry)",
  "event EscrowSettled(uint256 indexed escrowId,address indexed beneficiary,uint256 amount,uint256 fee,uint256 totalReleased,uint64 newNonce)",
  "event EscrowRefunded(uint256 indexed escrowId,address indexed depositor,uint256 amount)",
  "event EscrowCancelled(uint256 indexed escrowId,address indexed beneficiary,uint256 amount)",
]);

// Minimal ERC-20 ABI — decimals/symbol/balanceOf/approve only. Using
// `parseAbi` keeps it inferred.
export const ERC20_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

/// EIP-712 typed data helper. Whatever the user signs here must match the
/// struct declared in `IntentEscrow.sol`; any drift breaks signature recovery.
export function buildSettleIntentTypedData(params: {
  chainId: number;
  verifyingContract: Address;
  escrowId: bigint;
  amount: bigint;
  deadline: bigint;
  nonce: bigint;
}) {
  return {
    domain: {
      name: "IntentEscrow",
      version: "1",
      chainId: params.chainId,
      verifyingContract: params.verifyingContract,
    },
    types: {
      SettleIntent: [
        { name: "escrowId", type: "uint256" },
        { name: "amount", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "SettleIntent" as const,
    message: {
      escrowId: params.escrowId,
      amount: params.amount,
      deadline: params.deadline,
      nonce: params.nonce,
    },
  };
}
