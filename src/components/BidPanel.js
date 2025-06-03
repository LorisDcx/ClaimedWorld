import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { loadStripe } from '@stripe/stripe-js';

// Initialize Stripe - replace with your actual publishable key from environment variables
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder');

const BidPanel = ({ country, session }) => {
  const [bidAmount, setBidAmount] = useState(country?.current_bid ? country.current_bid + 1 : 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [recentBids, setRecentBids] = useState([]);
  const navigate = useNavigate();
  
  // Déterminer les montants d'enchères rapides
  const minBid = country?.current_bid ? country.current_bid + 1 : 1;
  const quickBidAmounts = [
    minBid,
    minBid + 5,
    minBid + 10,
    minBid + 25
  ];

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

  // Vérifier si l'URL contient un paramètre de succès ou d'annulation
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('bid_success') === 'true') {
      setSuccess('Votre enchère a été placée avec succès!');
      // Nettoyer l'URL après avoir affiché le message
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('bid_cancelled') === 'true') {
      setError('L\'enchère a été annulée.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Charger les enchères récentes
  useEffect(() => {
    if (country?.id) {
      const fetchRecentBids = async () => {
        try {
          const { data, error } = await supabase
            .from('bids')
            .select(`
              id,
              amount,
              created_at,
              profiles (display_name)
            `)
            .eq('country_id', country.id)
            .order('created_at', { ascending: false })
            .limit(3);

          if (error) throw error;
          setRecentBids(data || []);
        } catch (error) {
          console.error('Error fetching recent bids:', error.message);
        }
      };

      fetchRecentBids();
    }
  }, [country]);

  if (!country) {
    return <div>Sélectionnez un pays sur la carte pour enchérir.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{country.name}</h2>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: country.custom_color || '#CCCCCC' }}></div>
          <p className="text-gray-600">
            Enchère actuelle: <span className="font-semibold text-lg">{country.current_bid || 0} €</span>
          </p>
        </div>
        {country.current_owner_name && (
          <p className="text-sm text-gray-500 mt-1">
            Possédé par: <span className="font-semibold">{country.current_owner_name}</span>
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

        {success && (
          <div className="bg-green-100 text-green-700 p-3 rounded-md mb-3">
            {success}
          </div>
        )}
        
        {/* Options d'enchères rapides */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Enchères rapides
          </label>
          <div className="flex flex-wrap gap-2">
            {quickBidAmounts.map(amount => (
              <button
                key={amount}
                onClick={() => setBidAmount(amount)}
                className={`px-3 py-1.5 rounded-md text-sm ${bidAmount === amount 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-800'}`}
              >
                {amount} €
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="bidAmount" className="block text-sm font-medium text-gray-700 mb-1">
            Montant personnalisé (€)
          </label>
          <div className="flex space-x-2">
            <input
              id="bidAmount"
              type="number"
              min={minBid}
              value={bidAmount}
              onChange={handleBidChange}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => setBidAmount(prevBid => prevBid + 1)}
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md"
              title="Augmenter de 1€"
            >
              +1
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Enchère minimum: <span className="font-semibold">{minBid} €</span>
          </p>
        </div>
        
        <button
          onClick={handleBid}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 flex items-center justify-center space-x-2"
        >
          <span>{loading ? 'Traitement...' : `Enchérir ${bidAmount} €`}</span>
          {!loading && <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>}
        </button>
        
        {!session ? (
          <p className="text-sm text-gray-500 mt-2 text-center">
            Vous devez être connecté pour enchérir
          </p>
        ) : (
          <p className="text-sm text-gray-600 mt-2 text-center">
            Le paiement sera traité par Stripe de manière sécurisée
          </p>
        )}
      </div>

      {/* Message personnalisé et historique des enchères récentes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {country.custom_message && (
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-lg font-semibold mb-2">Message du propriétaire</h3>
            <div 
              className="p-3 rounded-md" 
              style={{ backgroundColor: country.custom_color || '#f3f4f6' }}
            >
              <p className="italic">"{country.custom_message}"</p>
            </div>
          </div>
        )}
        
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-lg font-semibold mb-2">Dernières enchères</h3>
          {recentBids.length > 0 ? (
            <ul className="space-y-2">
              {recentBids.map(bid => (
                <li key={bid.id} className="flex justify-between p-2 rounded-md bg-gray-50">
                  <span className="font-medium">{bid.profiles?.display_name || 'Anonyme'}</span>
                  <span>{bid.amount} € <span className="text-xs text-gray-500">({new Date(bid.created_at).toLocaleDateString()})</span></span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">Aucune enchère récente</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BidPanel;
