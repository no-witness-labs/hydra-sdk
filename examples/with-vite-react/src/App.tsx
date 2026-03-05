import { useState } from "react";
import WalletConnect from "./components/WalletConnect";
import HydraCommit from "./components/HydraCommit";

export default function App() {
  const [walletApi, setWalletApi] = useState<CardanoWalletApi | null>(null);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-semibold">
          Hydra SDK — Wallet Connect Example
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Connect a CIP-30 wallet and interact with a Hydra Head on Preview
          testnet.
        </p>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <WalletConnect onApiReady={setWalletApi} />
        {walletApi && <HydraCommit walletApi={walletApi} />}
      </main>
    </div>
  );
}
