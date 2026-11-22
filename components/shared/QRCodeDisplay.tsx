"use client";

import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Smartphone } from "lucide-react";

interface QRCodeDisplayProps {
  sessionCode: string;
  joinUrl: string;
  size?: number;
}

export function QRCodeDisplay({
  sessionCode,
  joinUrl,
  size = 220,
}: QRCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="tvos-glass flex flex-col items-center rounded-tvos-lg p-7 text-center">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
        <Smartphone className="h-3.5 w-3.5 text-tvos-accent" />
        Scanner pour rejoindre
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-2xl">
        <QRCodeSVG
          value={joinUrl}
          size={size}
          bgColor="#FFFFFF"
          fgColor="#07080C"
          level="M"
        />
      </div>

      <div className="mt-5">
        <p className="text-xs uppercase tracking-[0.2em] text-white/55">
          Code de partie
        </p>
        <p className="mt-1 font-mono text-4xl font-black tracking-[0.24em] text-white">
          {sessionCode}
        </p>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white/80 transition hover:bg-white/20 hover:text-white"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-400" />
            Lien copié
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            Copier le lien joueur
          </>
        )}
      </button>
    </div>
  );
}
