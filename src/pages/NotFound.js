import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <h1 className="text-4xl font-bold text-gray-800 mb-4">404</h1>
      <p className="text-xl text-gray-600 mb-8">Page non trouvée</p>
      <p className="text-gray-500 mb-8 text-center max-w-md">
        La page que vous recherchez n'existe pas ou a été déplacée.
      </p>
      <Link 
        to="/" 
        className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Retour à l'accueil
      </Link>
    </div>
  );
};

export default NotFound;
