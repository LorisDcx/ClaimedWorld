import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const UserProfile = ({ session }) => {
  const [loading, setLoading] = useState(true);
  const [userBids, setUserBids] = useState([]);
  const [displayName, setDisplayName] = useState('');
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState('winning'); // 'winning' ou 'all'

  useEffect(() => {
    if (session) {
      fetchUserProfile();
      fetchUserBids();
    }
  }, [session]);

  const fetchUserProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setDisplayName(data.display_name || '');
      }
    } catch (error) {
      console.error('Error fetching user profile:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserBids = async () => {
    try {
      const { data, error } = await supabase
        .from('bids')
        .select(`
          *,
          countries (id, name, code)
        `)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUserBids(data || []);
    } catch (error) {
      console.error('Error fetching user bids:', error.message);
    }
  };

  const updateProfile = async (e) => {
    e.preventDefault();
    
    try {
      setUpdating(true);
      setMessage({ type: '', text: '' });

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: session.user.id,
          display_name: displayName,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      
      setMessage({
        type: 'success',
        text: 'Profil mis à jour avec succès!'
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.message
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Error signing out:', error.message);
    }
  };

  const updateCountryCustomization = async (bidId, message, color) => {
    try {
      setUpdating(true);
      
      const { error } = await supabase
        .from('bids')
        .update({
          custom_message: message,
          custom_color: color,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bidId);

      if (error) throw error;
      
      // Refresh bids
      fetchUserBids();
      
      setMessage({
        type: 'success',
        text: 'Personnalisation mise à jour!'
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.message
      });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Mon Profil</h1>
      
      {message.text && (
        <div className={`p-4 mb-6 rounded-md ${
          message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {message.text}
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Informations du compte</h2>
        <form onSubmit={updateProfile} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={session.user.email}
              disabled
              className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-md"
            />
          </div>
          
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
              Nom d'affichage
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="flex justify-between">
            <button
              type="submit"
              disabled={updating}
              className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {updating ? 'Mise à jour...' : 'Mettre à jour le profil'}
            </button>
            
            <button
              type="button"
              onClick={handleSignOut}
              className="bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Déconnexion
            </button>
          </div>
        </form>
      </div>
      
      {/* Statistiques de l'utilisateur */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Mes statistiques</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Total des enchères</p>
            <p className="text-2xl font-bold">{userBids.length}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Pays possédés</p>
            <p className="text-2xl font-bold">{userBids.filter(bid => bid.is_winning).length}</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Valeur totale</p>
            <p className="text-2xl font-bold">
              {userBids.filter(bid => bid.is_winning).reduce((total, bid) => total + bid.amount, 0)} €
            </p>
          </div>
        </div>
      </div>
      
      {/* Liste des enchères */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Mes enchères</h2>
        
        {userBids.length === 0 ? (
          <p className="text-gray-500">Vous n'avez pas encore fait d'enchères.</p>
        ) : (
          <>
            {/* Onglets de filtrage */}
            <div className="flex border-b border-gray-200 mb-4">
              <button 
                className={`px-4 py-2 -mb-px font-medium text-sm ${
                  activeTab === 'winning' 
                    ? 'text-blue-600 border-b-2 border-blue-500' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab('winning')}
              >
                Pays possédés ({userBids.filter(bid => bid.is_winning).length})
              </button>
              <button 
                className={`px-4 py-2 -mb-px font-medium text-sm ${
                  activeTab === 'all' 
                    ? 'text-blue-600 border-b-2 border-blue-500' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab('all')}
              >
                Toutes mes enchères ({userBids.length})
              </button>
            </div>

            <div className="space-y-6">
              {userBids
                .filter(bid => activeTab === 'all' || bid.is_winning)
                .map((bid) => (
              <div key={bid.id} className={`border ${bid.is_winning ? 'border-green-200 bg-green-50' : 'border-gray-200'} rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow duration-200`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{bid.countries.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${bid.is_winning ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {bid.countries.code}
                      </span>
                    </div>
                    <div className="flex items-center mt-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Montant</p>
                        <p className="text-sm font-medium">{bid.amount} €</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Date</p>
                        <p className="text-sm">{new Date(bid.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${bid.is_winning ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {bid.is_winning ? (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Possédé
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          Dépassé
                        </>
                      )}
                    </span>
                  </div>
                </div>
                
                {bid.is_winning && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="font-medium mb-3">Personnalisation du pays</h4>
                    
                    {/* Prévisualisation */}
                    <div 
                      className="mb-4 p-4 rounded-md flex items-center justify-center" 
                      style={{ backgroundColor: bid.custom_color || '#3B82F6' }}
                    >
                      <p className="text-white font-medium">
                        {bid.custom_message || 'Aperçu du message personnalisé'}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Message personnalisé
                        </label>
                        <div className="flex">
                          <input
                            type="text"
                            value={bid.custom_message || ''}
                            onChange={(e) => {
                              const updatedBids = userBids.map(b => 
                                b.id === bid.id ? { ...b, custom_message: e.target.value } : b
                              );
                              setUserBids(updatedBids);
                            }}
                            placeholder="Entrez un message pour ce pays"
                            maxLength={50}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          />
                          <span className="ml-2 text-xs text-gray-500 self-end">
                            {(bid.custom_message?.length || 0)}/50
                          </span>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Couleur du pays
                        </label>
                        <div className="flex space-x-2 items-center">
                          <input
                            type="color"
                            value={bid.custom_color || '#3B82F6'}
                            onChange={(e) => {
                              const updatedBids = userBids.map(b => 
                                b.id === bid.id ? { ...b, custom_color: e.target.value } : b
                              );
                              setUserBids(updatedBids);
                            }}
                            className="h-10 w-20 border border-gray-300 rounded"
                          />
                          <input 
                            type="text" 
                            value={bid.custom_color || '#3B82F6'}
                            onChange={(e) => {
                              const updatedBids = userBids.map(b => 
                                b.id === bid.id ? { ...b, custom_color: e.target.value } : b
                              );
                              setUserBids(updatedBids);
                            }}
                            className="px-3 py-1 border border-gray-300 rounded-md w-32 text-sm"
                          />
                        </div>
                      </div>
                      
                      <button
                        onClick={() => updateCountryCustomization(
                          bid.id, 
                          userBids.find(b => b.id === bid.id).custom_message,
                          userBids.find(b => b.id === bid.id).custom_color
                        )}
                        disabled={updating}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
                      >
                        {updating ? (
                          <>
                            <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></span>
                            Mise à jour...
                          </>
                        ) : 'Appliquer les changements'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UserProfile;
