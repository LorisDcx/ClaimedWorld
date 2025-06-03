import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const CountryRanking = ({ countryId }) => {
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (countryId) {
      fetchCountryBids(countryId);
    }
  }, [countryId]);

  const fetchCountryBids = async (id) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('bids')
        .select(`
          id,
          amount,
          created_at,
          profiles (display_name)
        `)
        .eq('country_id', id)
        .order('amount', { ascending: false })
        .limit(10);

      if (error) throw error;
      setBids(data || []);
    } catch (error) {
      console.error('Error fetching country bids:', error.message);
      setError('Impossible de charger les enchères pour ce pays.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 text-red-700 p-4 rounded-md">
        {error}
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Historique des enchères</h3>
      
      {bids.length === 0 ? (
        <p className="text-gray-500">Aucune enchère pour ce pays pour le moment.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rang
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Utilisateur
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Montant
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {bids.map((bid, index) => (
                <tr key={bid.id} className={index === 0 ? 'bg-yellow-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {index + 1}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {bid.profiles?.display_name || 'Utilisateur anonyme'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                    {bid.amount} €
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(bid.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CountryRanking;
