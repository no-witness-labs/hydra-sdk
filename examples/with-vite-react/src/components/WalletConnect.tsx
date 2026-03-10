import { useCardano } from "@cardano-foundation/cardano-connect-with-wallet";
import { NetworkType } from "@cardano-foundation/cardano-connect-with-wallet-core";
import { useCallback, useEffect, useState } from "react";

/** Decode lovelace from a CIP-30 getBalance() CBOR hex string. */
function decodeCborCoin(hex: string): bigint {
  const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  // Major type 4 (array) means multi-asset Value — first element is lovelace
  const offset = bytes[0]! >> 5 === 4 ? 1 : 0;
  return readCborUint(bytes, offset);
}

function readCborUint(bytes: Uint8Array, offset: number): bigint {
  const info = bytes[offset]! & 0x1f;
  if (info <= 23) return BigInt(info);
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 1);
  if (info === 24) return BigInt(view.getUint8(0));
  if (info === 25) return BigInt(view.getUint16(0));
  if (info === 26) return BigInt(view.getUint32(0));
  if (info === 27) return view.getBigUint64(0);
  return 0n;
}

interface Props {
  onApiReady: (api: CardanoWalletApi | null) => void;
}

export default function WalletConnect({ onApiReady }: Props) {
  const {
    isConnected,
    isConnecting,
    enabledWallet,
    stakeAddress,
    installedExtensions,
    connect,
    disconnect,
  } = useCardano({ limitNetwork: NetworkType.TESTNET });

  const [balance, setBalance] = useState<bigint | null>(null);

  // When the wallet connects, enable the CIP-30 API and lift it to the parent
  useEffect(() => {
    if (!isConnected || !enabledWallet) {
      onApiReady(null);
      setBalance(null);
      return;
    }

    let cancelled = false;

    window.cardano?.[enabledWallet]
      ?.enable()
      .then(async (api) => {
        if (cancelled) return;
        onApiReady(api);
        const balHex = await api.getBalance();
        if (!cancelled) setBalance(decodeCborCoin(balHex));
      })
      .catch((err) => {
        console.error("Failed to enable wallet API:", err);
        if (!cancelled) onApiReady(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isConnected, enabledWallet, onApiReady]);

  const handleConnect = useCallback(
    (name: string) => {
      connect(name, undefined, (err) =>
        console.error("Wallet connect error:", err),
      );
    },
    [connect],
  );

  const handleDisconnect = useCallback(() => {
    disconnect();
    onApiReady(null);
  }, [disconnect, onApiReady]);

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <h2 className="mb-4 text-lg font-medium">Wallet Connection</h2>

      {isConnected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
            <span className="font-medium capitalize">{enabledWallet}</span>
          </div>

          {stakeAddress && (
            <p className="break-all text-sm text-gray-400">
              <span className="text-gray-500">Stake:</span> {stakeAddress}
            </p>
          )}

          <p className="text-sm text-gray-400">
            <span className="text-gray-500">Balance:</span>{" "}
            {balance !== null
              ? `${(Number(balance) / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ADA`
              : "Loading…"}
          </p>

          <button
            onClick={handleDisconnect}
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-700"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div>
          {installedExtensions.length === 0 ? (
            <p className="text-sm text-gray-500">
              No CIP-30 wallets detected. Install a Cardano wallet extension
              (Nami, Eternl, Lace, Flint, Typhon, VESPR, etc.).
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {installedExtensions.map((name) => (
                <button
                  key={name}
                  onClick={() => handleConnect(name)}
                  disabled={isConnecting}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium capitalize hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isConnecting ? "Connecting…" : name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
