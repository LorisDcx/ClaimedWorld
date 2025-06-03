import React from 'react';
import { Link } from 'react-router-dom';

const Header = ({ session }) => {
  return (
    <header className="bg-white shadow-md">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <Link to="/" className="text-2xl font-bold text-blue-600 flex items-center">
          <span role="img" aria-label="globe" className="mr-2">🌍</span>
          ClaimedWorld
        </Link>
        
        <nav>
          <ul className="flex space-x-6">
            <li>
              <Link to="/" className="text-gray-700 hover:text-blue-600">
                Accueil
              </Link>
            </li>
            {session ? (
              <>
                <li>
                  <Link to="/profile" className="text-gray-700 hover:text-blue-600">
                    Mon Profil
                  </Link>
                </li>
              </>
            ) : (
              <li>
                <Link 
                  to="/login" 
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  Connexion
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;
