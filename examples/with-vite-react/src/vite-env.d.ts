/// <reference types="vite/client" />

interface CardanoWalletApi {
  getNetworkId(): Promise<number>;
  getUtxos(amount?: string, paginate?: { page: number; limit: number }): Promise<string[] | null>;
  getBalance(): Promise<string>;
  getUsedAddresses(): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  getRewardAddresses(): Promise<string[]>;
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  signData(addr: string, payload: string): Promise<{ signature: string; key: string }>;
  submitTx(tx: string): Promise<string>;
  getCollateral(): Promise<string[] | null>;
}

interface CardanoWalletExtension {
  enable(): Promise<CardanoWalletApi>;
  isEnabled(): Promise<boolean>;
  name: string;
  icon: string;
  apiVersion: string;
}

interface Window {
  cardano?: Record<string, CardanoWalletExtension>;
}
