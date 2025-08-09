'use client'

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

function SuccessContent() {
    const searchParams = useSearchParams();
    const sessionId = searchParams.get('session_id');
    const [paymentStatus, setPaymentStatus] = useState('loading');

    useEffect(() => {
        if (sessionId) {
            // Store payment success in localStorage
            localStorage.setItem('premium_access', JSON.stringify({
                sessionId,
                purchaseDate: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
            }));
            setPaymentStatus('success');
        } else {
            setPaymentStatus('error');
        }
    }, [sessionId]);

    if (paymentStatus === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p>Processing your payment...</p>
                </div>
            </div>
        );
    }

    if (paymentStatus === 'error') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center max-w-md">
                    <h1 className="text-2xl font-bold text-red-600 mb-4">Payment Error</h1>
                    <p className="mb-6">There was an issue processing your payment.</p>
                    <Link href="/">
                        <Button>Return to Home</Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-green-50">
            <div className="text-center max-w-md p-8 bg-white rounded-xl shadow-lg">
                <div className="text-green-500 text-6xl mb-4">✓</div>
                <h1 className="text-3xl font-bold text-green-600 mb-4">Payment Successful!</h1>
                <p className="text-gray-600 mb-6">
                    Thank you for your purchase! You now have premium access to unlimited route generation.
                </p>
                <div className="space-y-3">
                    <Link href="/">
                        <Button className="w-full" size="lg">
                            Start Creating Routes 🚀
                        </Button>
                    </Link>
                    <p className="text-sm text-gray-500">
                        Your premium access expires in 30 days
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function Success() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p>Loading...</p>
                </div>
            </div>
        }>
            <SuccessContent />
        </Suspense>
    );
}