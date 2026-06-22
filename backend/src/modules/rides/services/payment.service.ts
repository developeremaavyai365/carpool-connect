import { queryOne } from '../repositories/pg.client';

export interface PaymentProvider {
  createOrder(amount: number, currency: string, metadata: Record<string, unknown>): Promise<{
    providerRef: string;
    checkoutUrl?: string;
  }>;
}

class RazorpayProvider implements PaymentProvider {
  async createOrder(amount: number, currency: string, metadata: Record<string, unknown>) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    if (!keyId) {
      return { providerRef: `dev_${Date.now()}`, checkoutUrl: undefined };
    }
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency,
        receipt: String(metadata.booking_id || Date.now()),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Razorpay order failed: ${res.status}`);
    const data = await res.json() as { id: string };
    return { providerRef: data.id };
  }
}

class StripeProvider implements PaymentProvider {
  async createOrder(amount: number, currency: string) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return { providerRef: `stripe_dev_${Date.now()}` };
    const params = new URLSearchParams({
      amount: String(Math.round(amount * 100)),
      currency: currency.toLowerCase(),
    });
    const res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Stripe payment intent failed: ${res.status}`);
    const data = await res.json() as { id: string };
    return { providerRef: data.id };
  }
}

export class PaymentService {
  private providers: Record<string, PaymentProvider> = {
    razorpay: new RazorpayProvider(),
    stripe: new StripeProvider(),
  };

  async createForBooking(
    bookingId: number,
    passengerId: number,
    amount: number,
    provider = 'razorpay',
  ) {
    const impl = this.providers[provider] || this.providers.razorpay;
    const order = await impl.createOrder(amount, 'INR', { booking_id: bookingId });

    const payment = await queryOne(
      `INSERT INTO trip_payments (
        booking_id, passenger_id, amount, provider, provider_ref, status
      ) VALUES ($1,$2,$3,$4,$5,'pending')
      RETURNING *`,
      [bookingId, passengerId, amount, provider, order.providerRef],
    );

    return { payment, checkout: order };
  }

  async markPaid(providerRef: string) {
    return queryOne(
      `UPDATE trip_payments SET status = 'paid', updated_at = now()
       WHERE provider_ref = $1 RETURNING *`,
      [providerRef],
    );
  }

  async refund(paymentId: number) {
    return queryOne(
      `UPDATE trip_payments SET status = 'refunded', updated_at = now()
       WHERE id = $1 RETURNING *`,
      [paymentId],
    );
  }
}

export const paymentService = new PaymentService();
