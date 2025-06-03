import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import WorldMap from '../components/WorldMap';
import BidPanel from '../components/BidPanel';
import CountryRanking from '../components/CountryRanking';
import GlobalRanking from '../components/GlobalRanking';

const Home = ({ session }) => {
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [activeTab, setActiveTab] = useState('bid'); // 'bid' or 'ranking'
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCountries();
    
    // Subscribe to changes in the countries table
    const subscription = supabase
      .channel('countries-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'countries' 
      }, payload => {
        // Update the countries state when changes occur
        fetchCountries();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchCountries = async () => {
    try {
      setLoading(true);
      
      // Récupère les pays avec leurs enchères gagnantes et infos de personnalisation
      const { data, error } = await supabase
        .from('countries')
        .select(`
          *,
          winning_bid:bids(
            id, 
            amount, 
            custom_color, 
            custom_message, 
            user_id,
            profiles(display_name)
          )
        `)
        .eq('winning_bid.is_winning', true)
        .order('current_bid', { ascending: false });

      if (error) throw error;
      
      // Traiter les données pour un format plus facile à utiliser
      const processedData = data?.map(country => {
        const winningBid = country.winning_bid?.[0] || null;
        return {
          ...country,
          custom_color: winningBid?.custom_color || '#CCCCCC',
          custom_message: winningBid?.custom_message || '',
          current_owner_name: winningBid?.profiles?.display_name || '',
          current_owner_id: winningBid?.user_id || null
        };
      }) || [];
      
      setCountries(processedData);
    } catch (error) {
      console.error('Error fetching countries:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCountryClick = (countryId) => {
    const country = countries.find(c => c.id === countryId);
    setSelectedCountry(country);
    setActiveTab('bid'); // Default to bid tab when selecting a country
  };

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Left side - Map */}
      <div className="w-full md:w-2/3 bg-white rounded-lg shadow-md p-4">
        <h2 className="text-2xl font-bold mb-4 text-center">Carte du Monde Interactive</h2>
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
          </div>
        ) : (
          <WorldMap 
            countries={countries} 
            onCountryClick={handleCountryClick} 
            selectedCountry={selectedCountry?.id} 
          />
        )}
      </div>
      
      {/* Right side - Bid panel or Country ranking */}
      <div className="w-full md:w-1/3 bg-white rounded-lg shadow-md p-4">
        {selectedCountry ? (
          <>
            <div className="flex border-b mb-4">
              <button 
                className={`px-4 py-2 ${activeTab === 'bid' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-500'}`}
                onClick={() => setActiveTab('bid')}
              >
                Enchérir
              </button>
              <button 
                className={`px-4 py-2 ${activeTab === 'ranking' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-500'}`}
                onClick={() => setActiveTab('ranking')}
              >
                Classement
              </button>
            </div>
            
            {activeTab === 'bid' ? (
              <BidPanel country={selectedCountry} session={session} />
            ) : (
              <CountryRanking countryId={selectedCountry.id} />
            )}
          </>
        ) : (
          <div>
            <h2 className="text-2xl font-bold mb-4">Classement Global</h2>
            <GlobalRanking />
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
