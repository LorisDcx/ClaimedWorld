import React from 'react';

const Footer = () => {
  return (
    <footer className="bg-gray-800 text-white py-6">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <h3 className="text-xl font-bold flex items-center">
              <span role="img" aria-label="globe" className="mr-2">🌍</span>
              ClaimedWorld
            </h3>
            <p className="text-gray-400 mt-1">Enchérissez pour posséder virtuellement des pays</p>
          </div>
          
          <div className="text-center md:text-right">
            <p className="text-gray-400">&copy; {new Date().getFullYear()} ClaimedWorld. Tous droits réservés.</p>
            <div className="mt-2 text-sm">
              <a href="#" className="text-gray-400 hover:text-white mr-4">Conditions d'utilisation</a>
              <a href="#" className="text-gray-400 hover:text-white">Politique de confidentialité</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
