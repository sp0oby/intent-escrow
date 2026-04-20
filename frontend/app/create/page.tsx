import { CreateEscrowForm } from "@/components/CreateEscrowForm";

export default function CreatePage() {
  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-2xl font-semibold">Create escrow</h2>
        <p className="text-muted text-sm">
          Funds are locked until the beneficiary signs a release intent, or
          until the expiry passes and you refund.
        </p>
      </div>
      <CreateEscrowForm />
    </div>
  );
}
