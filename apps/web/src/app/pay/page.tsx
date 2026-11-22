import { PaddlePayBridge } from "@/components/payments/PaddlePayBridge";

export const dynamic = "force-dynamic";

/** Public Paddle payment-link bridge (set as Paddle default payment link / checkout.url). */
export default function PayPage() {
  return <PaddlePayBridge />;
}
