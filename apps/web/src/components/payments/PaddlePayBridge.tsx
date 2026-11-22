"use client";

import { useEffect, useRef, useState } from "react";

type PaddleCheckout = {
  Initialize: (opts: Record<string, unknown>) => void;
  Environment?: { set: (env: "sandbox" | "production") => void };
  Checkout?: { open: (opts: Record<string, unknown>) => void };
};

declare global {
  interface Window {
    Paddle?: PaddleCheckout;
  }
}

function paddleClientToken(): string {
  return (process.env.NEXT_PUBLIC_DAMA_PADDLE_CLIENT_TOKEN || "").trim();
}

function paddleEnv(): "sandbox" | "production" {
  const e = (process.env.NEXT_PUBLIC_DAMA_PADDLE_ENV || "live").trim().toLowerCase();
  return e === "sandbox" || e === "sdbx" || e === "test" ? "sandbox" : "production";
}

function safeSameOriginReturn(raw: string): string {
  const t = (raw || "").trim();
  if (!t || typeof window === "undefined") return "";
  try {
    const u = new URL(t, window.location.origin);
    if (u.origin !== window.location.origin) return "";
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.toString();
  } catch {
    return "";
  }
}

function defaultWalletSuccess(): string {
  if (typeof window === "undefined") return "/wallet?checkout=success";
  return `${window.location.origin}/wallet?checkout=success`;
}

/**
 * Paddle Billing default-payment-link bridge.
 * Official: page with Paddle.js + ?_ptxn= auto-opens checkout; successUrl returns to Dama.
 * Wallet credit remains webhook-only.
 */
export function PaddlePayBridge() {
  const [message, setMessage] = useState("Opening checkout…");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const txn = (params.get("_ptxn") || "").trim();
    const returnUrl =
      safeSameOriginReturn(params.get("return_url") || "") || defaultWalletSuccess();
    const token = paddleClientToken();

    if (!token) {
      setMessage("Checkout is not configured.");
      return;
    }
    if (!txn) {
      setMessage("Missing checkout reference.");
      return;
    }

    const goSuccess = () => {
      window.location.replace(returnUrl);
    };

    const boot = () => {
      const paddle = window.Paddle;
      if (!paddle) {
        setMessage("Checkout failed to load.");
        return;
      }
      try {
        paddle.Environment?.set(paddleEnv());
        paddle.Initialize({
          token,
          checkout: {
            settings: {
              successUrl: returnUrl,
            },
          },
          eventCallback: (event: {
            name?: string;
            data?: { custom_data?: { return_url?: string } };
          }) => {
            if (event?.name !== "checkout.completed") return;
            const fromCustom = safeSameOriginReturn(event.data?.custom_data?.return_url || "");
            if (fromCustom) {
              window.location.replace(fromCustom);
              return;
            }
            goSuccess();
          },
        });
        // Explicit open (docs: pass transactionId). _ptxn auto-open is fallback only.
        if (paddle.Checkout?.open) {
          paddle.Checkout.open({
            transactionId: txn,
            settings: { successUrl: returnUrl },
          });
        }
        setMessage("Complete payment in the checkout window.");
      } catch {
        setMessage("Checkout failed to start.");
      }
    };

    if (window.Paddle) {
      boot();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => boot();
    script.onerror = () => setMessage("Checkout failed to load.");
    document.body.appendChild(script);
  }, []);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center text-[var(--dama-text)]">
      <p className="text-sm text-[var(--dama-muted)]">{message}</p>
    </div>
  );
}
