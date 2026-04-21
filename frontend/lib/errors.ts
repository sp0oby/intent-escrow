import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

// All IntentEscrow custom errors, keyed by the name that viem extracts from
// the revert. Kept in sync with IntentEscrow.sol so a wallet popup can tell
// the user exactly *why* the call reverted — not "execution reverted".
const ERROR_MESSAGES: Record<string, string> = {
  ZeroAddress: "Zero address not allowed.",
  ZeroAmount: "Amount must be greater than zero.",
  ExpiryInPast: "Expiry must be in the future.",
  ExpiryTooFar: "Expiry is too far in the future (max 5 years).",
  BadEthValue: "ETH value doesn't match the declared amount.",
  NotDepositor: "Only the depositor can do that.",
  NotBeneficiary: "Only the beneficiary can do that.",
  NotExpiredYet: "Escrow hasn't expired yet.",
  AlreadyClosed: "This escrow is already closed.",
  NothingToRelease: "Nothing left to release.",
  AmountExceedsRemaining: "Amount exceeds the remaining balance.",
  DeadlinePassed: "The intent's deadline has passed.",
  InvalidSignature: "Signature didn't verify for this beneficiary.",
  FeeTooHigh: "Protocol fee above the hard-coded maximum.",
  EthTransferFailed: "ETH transfer failed (recipient rejected it).",
  InsufficientSurplus: "Not enough surplus above escrowed balances.",
};

export function parseContractError(err: unknown): string {
  if (!err) return "";

  if (err instanceof BaseError) {
    // User rejections come through as clean, deterministic errors.
    const rejected = err.walk((e) => e instanceof UserRejectedRequestError);
    if (rejected) return "Transaction rejected in the wallet.";

    // Custom-error revert → look up by name.
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName ?? reverted.reason ?? "";
      if (name && ERROR_MESSAGES[name]) return ERROR_MESSAGES[name];
      if (name) return `Reverted: ${name}`;
    }

    // Fall back to the shortMessage which is already human-ish.
    return err.shortMessage || err.message;
  }

  if (err instanceof Error) return err.message;
  return String(err);
}
