import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const GlobalRanking = () => {
  const [topBidders, setTopBidders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTopBidders();
  }, []);

  const fetchTopBidders = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get top bidders by total amount spent
      const { data, error } = await supabase
        .rpc('get_top_bidders', { limit_count: 10 })
        .select('*');

      if (error) throw error;
      setTopBidders(data || []);
    } catch (error) {
      console.error('Error fetching top bidders:', error.message);
      setError('Impossible de charger le classement global.');
      
      // Fallback to a simpler query if the RPC function is not available
      try {
        const { data, error } = await supabase
          .from('bids')
          .select(`
            user_id,
            profiles (display_name),
            countries (name)
          `)
          .order('amount', { ascending: false })
          .limit(10);
        
        if (error) throw error;
        
        // Process the data to group by user
        const userTotals = data.reduce((acc, bid) => {
          const userId = bid.user_id;
          if (!acc[userId]) {
            acc[userId] = {
              user_id: userId,
              display_name: bid.profiles?.display_name || 'Utilisateur anonyme',
              total_amount: 0,
              countries_count: 0,
              countries: []
            };
          }
          
          acc[userId].total_amount += bid.amount;
          if (!acc[userId].countries.includes(bid.countries.name)) {
            acc[userId].countries.push(bid.countries.name);
            acc[userId].countries_count += 1;
          }
          
          return acc;
        }, {});
        
        const processedData = Object.values(userTotals)
          .sort((a, b) => b.total_amount - a.total_amount)
          .slice(0, 10);
        
        setTopBidders(processedData);
        setError(null);
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError.message);
      }
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
    <div className="bg-white p-4 rounded-lg shadow-md">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Classement Mondial</h2>
        <p className="text-gray-600">Les plus grands investisseurs de ClaimedWorld</p>
      </div>
      
      {/* Podium pour les 3 premiers */}
      <div className="hidden md:flex justify-center items-end mb-8 space-x-4">
        {topBidders.slice(0, 3).map((bidder, index) => {
          const heights = ['h-24', 'h-20', 'h-16'];
          const positions = ['order-2', 'order-1', 'order-3'];
          const bgColors = [
            'bg-gradient-to-t from-yellow-400 to-yellow-300',
            'bg-gradient-to-t from-gray-300 to-gray-200',
            'bg-gradient-to-t from-yellow-700 to-yellow-600'
          ];
          const medal = ['🏆', '🥈', '🥉'];
          
          return (
            <div key={bidder.user_id} className={`flex flex-col items-center ${positions[index]}`}>
              <div className="text-center mb-2">
                <p className="font-bold">{bidder.display_name || 'Anonyme'}</p>
                <p className="text-sm text-gray-600">{bidder.total_amount} €</p>
              </div>
              <div className={`w-24 ${heights[index]} ${bgColors[index]} rounded-t-lg flex items-center justify-center`}>
                <span className="text-2xl">{medal[index]}</span>
              </div>
              <div className="bg-gray-800 text-white w-24 py-1 text-center font-bold rounded-b-lg">
                #{index + 1}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tableau classique */}
      <div className="overflow-hidden rounded-lg border border-gray-200 shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Rang
              </th>
              <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Utilisateur
              </th>
              <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Total
              </th>
              <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Pays
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {topBidders.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-8 text-center text-gray-500 bg-gray-50">
                  <p className="font-medium">Aucune enchère pour le moment</p>
                  <p className="text-sm mt-1">Soyez le premier à posséder un pays !</p>
                </td>
              </tr>
            ) : (
              topBidders.map((bidder, index) => (
                <tr key={bidder.user_id} 
                    className={`${index < 3 ? 'bg-yellow-50' : 'hover:bg-gray-50'} transition-colors duration-150`}>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-sm font-bold ${index < 3 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                        {index + 1}
                      </span>
                      <span className="ml-2 text-lg">
                        {index === 0 && '🏆'}
                        {index === 1 && '🥈'}
                        {index === 2 && '🥉'}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap font-medium text-gray-900">
                    {bidder.display_name || 'Utilisateur anonyme'}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-gray-900 font-semibold">
                    {bidder.total_amount} €
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 mr-1" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-gray-700">{bidder.countries_count} pays</span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      <div className="mt-4 text-center text-sm text-gray-500">
        Mis à jour en temps réel • {new Date().toLocaleDateString()}
      </div>
    </div>
  );
};

export default GlobalRanking;
