"use client";

import { QRCodeSVG } from "qrcode.react";

export function Qr({ url }: { url: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="rounded-lg bg-white p-2">
        <QRCodeSVG value={url} size={104} level="M" />
      </div>
      <span className="text-xs text-muted">scan to open</span>
    </div>
  );
}
