import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { loadStripe } from '@stripe/stripe-js';

// Initialize Stripe - replace with your actual publishable key from environment variables
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder');

const BidPanel = ({ country, session }) => {
  const [bidAmount, setBidAmount] = useState(country?.current_bid ? country.current_bid + 1 : 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleBidChange = (e) => {
    const value = parseInt(e.target.value, 10);
    const minBid = country?.current_bid ? country.current_bid + 1 : 1;
    
    if (value >= minBid) {
      setBidAmount(value);
      setError('');
    } else {
      setBidAmount(minBid);
      setError(`L'enchère minimum est de ${minBid} €`);
    }
  };

  const handleBid = async () => {
    if (!session) {
      // Redirect to login if not authenticated
      navigate('/login');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Create a checkout session with Stripe
      const { data, error: apiError } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          countryId: country.id,
          amount: bidAmount,
          userId: session.user.id,
          successUrl: `${window.location.origin}/?bid_success=true`, // Redirige vers la page d'accueil
          cancelUrl: `${window.location.origin}/?bid_cancelled=true`
        }
      });

      if (apiError) throw apiError;

      // Redirect to Stripe Checkout
      const stripe = await stripePromise;
      const { error: stripeError } = await stripe.redirectToCheckout({
        sessionId: data.sessionId
      });

      if (stripeError) throw stripeError;

    } catch (error) {
      console.error('Error creating checkout session:', error);
      setError('Une erreur est survenue lors de la création de la session de paiement.');
    } finally {
      setLoading(false);
    }
  };

  if (!country) {
    return <div>Sélectionnez un pays sur la carte pour enchérir.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{country.name}</h2>
        <p className="text-gray-600">
          Enchère actuelle: <span className="font-semibold">{country.current_bid || 0} €</span>
        </p>
        {country.current_owner_display_name && (
          <p className="text-sm text-gray-500">
            Possédé par: {country.current_owner_display_name}
          </p>
        )}
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-lg font-semibold mb-3">Placer une enchère</h3>
        
        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded-md mb-3">
            {error}
          </div>
        )}
        
        <div className="mb-4">
          <label htmlFor="bidAmount" className="block text-sm font-medium text-gray-700 mb-1">
            Montant (€)
          </label>
          <input
            id="bidAmount"
            type="number"
            min={country.current_bid ? country.current_bid + 1 : 1}
            value={bidAmount}
            onChange={handleBidChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-sm text-gray-500 mt-1">
            Enchère minimum: {country.current_bid ? country.current_bid + 1 : 1} €
          </p>
        </div>
        
        <button
          onClick={handleBid}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {loading ? 'Traitement...' : 'Enchérir maintenant'}
        </button>
        
        {!session && (
          <p className="text-sm text-gray-500 mt-2 text-center">
            Vous devez être connecté pour enchérir
          </p>
        )}
      </div>

      {country.custom_message && (
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-lg font-semibold mb-2">Message du propriétaire</h3>
          <div 
            className="p-3 rounded-md" 
            style={{ backgroundColor: country.custom_color || '#f3f4f6' }}
          >
            {country.custom_message}
          </div>
        </div>
      )}
    </div>
  );
};

export default BidPanel;
