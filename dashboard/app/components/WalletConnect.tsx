"use client";

import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, formatUnits, Contract } from "ethers";
import { CONTRACTS, USDC_ABI, FUJI_CHAIN } from "@/lib/contracts";

interface WalletConnectProps {
  onConnect: (provider: BrowserProvider, address: string) => void;
}

/* Inline SVG wallet icon */
const WalletIcon = () => (
  <svg className="icon-inline" viewBox="0 0 24 24">
    <path d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-5z" />
    <path d="M16 12a1 1 0 100 2 1 1 0 000-2z" fill="currentColor" stroke="none" />
  </svg>
);

export default function WalletConnect({ onConnect }: WalletConnectProps) {
  const [address, setAddress] = useState<string>("");
  const [balance, setBalance] = useState<string>("0");
  const [chainId, setChainId] = useState<string>("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>("");

  const isCorrectChain = chainId === "0xa869";

  const fetchBalance = useCallback(async (provider: BrowserProvider, addr: string) => {
    try {
      const signer = await provider.getSigner();
      const usdc = new Contract(CONTRACTS.usdc, USDC_ABI, signer);
      const bal = await usdc.balanceOf(addr);
      setBalance(formatUnits(bal, 6));
    } catch {
      setBalance("0");
    }
  }, []);

  const switchToFuji = async () => {
    try {
      await window.ethereum?.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: FUJI_CHAIN.chainId }],
      });
    } catch (switchError: unknown) {
      const err = switchError as { code: number };
      if (err.code === 4902) {
        await window.ethereum?.request({
          method: "wallet_addEthereumChain",
          params: [FUJI_CHAIN],
        });
      }
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError("MetaMask not detected. Install the extension to continue.");
      return;
    }

    setConnecting(true);
    setError("");

    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const addr = accounts[0];
      const network = await provider.getNetwork();
      const currentChainId = "0x" + network.chainId.toString(16);

      setAddress(addr);
      setChainId(currentChainId);

      if (currentChainId !== FUJI_CHAIN.chainId) {
        await switchToFuji();
      }

      await fetchBalance(provider, addr);
      onConnect(provider, addr);
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts.length === 0) {
        setAddress("");
      } else {
        setAddress(accounts[0]);
      }
    };

    const handleChainChanged = (...args: unknown[]) => {
      const newChainId = args[0] as string;
      setChainId(newChainId);
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  if (!address) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          className={`btn btn-primary ${connecting ? "btn-loading" : ""}`}
          onClick={connectWallet}
          disabled={connecting}
          id="connect-wallet-btn"
        >
          {connecting ? (
            <>
              <span className="status-dot-loading" />
              Connecting…
            </>
          ) : (
            <>
              <WalletIcon />
              Connect Wallet
            </>
          )}
        </button>
        {error && <span style={{ color: "var(--colors-semantic-down)", fontSize: "12px" }}>{error}</span>}
      </div>
    );
  }

  return (
    <div className="wallet-info">
      {isCorrectChain ? (
        <span className="network-badge">Fuji</span>
      ) : (
        <button
          className="btn btn-secondary"
          onClick={switchToFuji}
          style={{ fontSize: "12px", padding: "6px 14px", height: "32px" }}
        >
          Switch to Fuji
        </button>
      )}
      <span className="wallet-balance">{parseFloat(balance).toFixed(2)} USDC</span>
      <span className="wallet-address">
        {address.slice(0, 6)}...{address.slice(-4)}
      </span>
    </div>
  );
}

// Extend Window interface for MetaMask
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}
