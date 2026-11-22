"use client";

import { PaymentReceiptDetail } from "@/components/wallet/PaymentReceiptDetail";
import { ReceiptDetailSkeletonBoot } from "@/components/wallet/ReceiptDetailSkeletonBoot";
import { useParams } from "next/navigation";
import { Suspense } from "react";

function PlayerReceiptDetailInner() {
  const params = useParams<{ id: string }>();
  return <PaymentReceiptDetail receiptId={params.id || ""} backHref="/receipts" />;
}

export default function PlayerReceiptDetailPage() {
  return (
    <Suspense fallback={<ReceiptDetailSkeletonBoot />}>
      <PlayerReceiptDetailInner />
    </Suspense>
  );
}
