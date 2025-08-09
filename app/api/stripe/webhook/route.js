import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request) {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    let event;

    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        // Here you would typically save the payment info to your database
        // For now, we'll just log it
        console.log('Payment successful:', {
            sessionId: session.id,
            customerEmail: session.customer_details?.email,
            amountTotal: session.amount_total,
            metadata: session.metadata
        });

        // You could save to database here:
        // await savePaymentToDatabase({
        //     sessionId: session.id,
        //     email: session.customer_details?.email,
        //     paid: true,
        //     expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        // });
    }

    return NextResponse.json({ received: true });
}