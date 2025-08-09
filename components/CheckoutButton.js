import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
);

const CheckoutButton = ({ disabled = false, className = "" }) => {
  const handleCheckout = async () => {
    try {
      const stripe = await stripePromise;

      // Call your backend to create the checkout session
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { sessionId } = await response.json();

      // Redirect to Stripe Checkout
      const { error } = await stripe.redirectToCheckout({
        sessionId,
      });

      if (error) {
        console.error("Stripe checkout error:", error);
        alert('Payment failed. Please try again.');
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert('Payment failed. Please try again.');
    }
  };

  return (
    <Button 
      onClick={handleCheckout} 
      disabled={disabled}
      className={`bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 ${className}`}
      size="lg"
    >
      💳 Upgrade to Premium - €5.99
    </Button>
  );
};

export default CheckoutButton;
