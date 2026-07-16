import { useState } from "react";
import WalletConnect from "./components/WalletConnect";
import HydraCommit from "./components/HydraCommit";

export default function App() {
  const [walletApi, setWalletApi] = useState<CardanoWalletApi | null>(null);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="flex items-start justify-between border-b border-gray-800 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">
            Hydra SDK — Wallet Connect Example
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Connect a CIP-30 wallet and interact with a Hydra Head on Preview
            testnet.
          </p>
        </div>
        <nav className="flex gap-4 text-sm">
          <a
            href="https://no-witness-labs.github.io/hydra-sdk/"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-400 hover:text-indigo-300"
          >
            Docs
          </a>
          <a
            href="https://github.com/no-witness-labs/hydra-sdk"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-400 hover:text-indigo-300"
          >
            GitHub
          </a>
        </nav>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <WalletConnect onApiReady={setWalletApi} />
        {walletApi && <HydraCommit walletApi={walletApi} />}
      </main>
    </div>
  );
}
