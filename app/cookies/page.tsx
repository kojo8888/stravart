export default function CookiesPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Cookie Policy</h1>
      
      <div className="prose max-w-none">
        <p className="mb-4">
          This Cookie Policy explains how Strava Art (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) uses cookies and similar technologies 
          when you visit our website.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">What are cookies?</h2>
        <p className="mb-4">
          Cookies are small text files that are placed on your device when you visit our website. 
          They help us provide you with a better experience and allow certain features to function properly.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">Types of cookies we use</h2>
        
        <h3 className="text-xl font-semibold mt-6 mb-3">Essential Cookies</h3>
        <p className="mb-4">
          These cookies are necessary for the website to function properly. They enable basic features 
          like page navigation, access to secure areas, and payment processing.
        </p>

        <h3 className="text-xl font-semibold mt-6 mb-3">Analytics Cookies</h3>
        <p className="mb-4">
          These cookies help us understand how visitors interact with our website by collecting 
          and reporting information anonymously. This helps us improve our website performance.
        </p>

        <h3 className="text-xl font-semibold mt-6 mb-3">Marketing Cookies</h3>
        <p className="mb-4">
          These cookies are used to deliver relevant advertisements and track advertising campaign effectiveness.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">Third-party services</h2>
        <ul className="list-disc pl-6 mb-4">
          <li><strong>Stripe:</strong> Payment processing (essential cookies)</li>
          <li><strong>OpenStreetMap/Overpass API:</strong> Map data (no cookies)</li>
          <li><strong>Nominatim:</strong> Location search (no cookies)</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-8 mb-4">Managing your preferences</h2>
        <p className="mb-4">
          You can manage your cookie preferences at any time through your browser settings or by 
          revisiting our cookie banner. Note that disabling certain cookies may affect website functionality.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">Contact</h2>
        <p className="mb-4">
          If you have questions about our use of cookies, please contact us through our website.
        </p>

        <p className="text-sm text-gray-600 mt-8">
          Last updated: {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}