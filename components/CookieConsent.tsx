'use client';

import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { X } from 'lucide-react';

export default function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem('cookie-consent', JSON.stringify({
      essential: true,
      analytics: true,
      marketing: true,
      timestamp: Date.now()
    }));
    setIsVisible(false);
  };

  const handleAcceptEssential = () => {
    localStorage.setItem('cookie-consent', JSON.stringify({
      essential: true,
      analytics: false,
      marketing: false,
      timestamp: Date.now()
    }));
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="font-semibold mb-2">We use cookies</h3>
            <p className="text-sm text-gray-600 mb-4">
              We use cookies to enhance your experience, analyze site traffic, and provide personalized content. 
              Essential cookies are required for the site to function properly.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleAcceptAll} className="bg-blue-600 hover:bg-blue-700">
                Accept All
              </Button>
              <Button variant="outline" onClick={handleAcceptEssential}>
                Essential Only
              </Button>
            </div>
          </div>
          <button
            onClick={handleAcceptEssential}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}