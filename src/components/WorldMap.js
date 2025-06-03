import React, { useState, useEffect, useRef, useCallback } from 'react';
import worldMapSvg from '../assets/world-map.svg';

const WorldMap = ({ countries, onCountryClick, selectedCountry }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [svgContent, setSvgContent] = useState(null);
  const [hoveredCountry, setHoveredCountry] = useState(null);
  
  const mapRef = useRef(null);

  // This will be populated with actual country data from the database
  const countryData = countries.reduce((acc, country) => {
    acc[country.code] = {
      id: country.id,
      name: country.name,
      currentBid: country.current_bid,
      customColor: country.custom_color || '#CCCCCC',
      customMessage: country.custom_message || '',
      ownerId: country.current_owner_id
    };
    return acc;
  }, {});

  const handleCountryClick = useCallback((e) => {
    const countryCode = e.target.getAttribute('id');
    if (countryCode && countryData[countryCode]) {
      onCountryClick(countryData[countryCode].id);
    }
  }, [countryData, onCountryClick]);

  const handleMouseDown = useCallback((e) => {
    // Permettre le déplacement que ce soit en cliquant sur le SVG ou son conteneur
    if (e.target.tagName === 'svg' || e.target.tagName === 'SVG' || 
        e.target.className === 'svg-container' || 
        e.target.parentNode.className === 'svg-container') {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  }, [position]);

  const handleMouseMove = useCallback((e) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleZoom = useCallback((factor) => {
    const newScale = Math.max(0.5, Math.min(scale * factor, 4));
    setScale(newScale);
  }, [scale]);

  // Effet pour charger le SVG et l'injecter dans le DOM
  useEffect(() => {
    fetch(worldMapSvg)
      .then(response => response.text())
      .then(svgText => {
        setSvgContent(svgText);
      })
      .catch(error => {
        console.error('Erreur lors du chargement de la carte SVG:', error);
      });
  }, []);

  // Effet pour appliquer les couleurs personnalisées et les événements aux pays
  useEffect(() => {
    if (svgContent && mapRef.current) {
      // Trouver tous les éléments de pays et leur appliquer les événements et styles
      const countryElements = mapRef.current.querySelectorAll('path[id]');
      
      countryElements.forEach(country => {
        const countryCode = country.id.toUpperCase();
        const countryInfo = countryData[countryCode];
        
        // Appliquer la couleur personnalisée si disponible
        if (countryInfo) {
          country.style.fill = countryInfo.customColor || '#CCCCCC';
          country.dataset.name = countryInfo.name;
          country.dataset.bid = countryInfo.currentBid || '0';
          country.dataset.message = countryInfo.customMessage || '';
        } else {
          country.style.fill = '#CCCCCC'; // Couleur par défaut
        }
        
        // Ajouter les événements
        country.addEventListener('click', handleCountryClick);
        country.addEventListener('mouseenter', () => setHoveredCountry(countryCode));
        country.addEventListener('mouseleave', () => setHoveredCountry(null));
        
        // Appliquer un style spécial au pays sélectionné
        if (countryInfo && countryInfo.id === selectedCountry) {
          country.style.stroke = '#2563EB'; // Bleu
          country.style.strokeWidth = '2';
        } else {
          country.style.stroke = '#FFFFFF';
          country.style.strokeWidth = '0.5';
        }
        
        // Rendre le pays interactif
        country.style.cursor = 'pointer';
        country.classList.add('country-path', 'hover:opacity-80');
      });
    }
  }, [svgContent, countries, selectedCountry, countryData, handleCountryClick]);

  return (
    <div className="relative w-full h-[60vh] overflow-hidden border border-gray-200 rounded-lg">
      {/* Zoom controls */}
      <div className="absolute top-4 right-4 z-10 bg-white rounded-md shadow-md">
        <button
          onClick={() => handleZoom(1.2)}
          className="px-3 py-1 border-r border-gray-200 hover:bg-gray-100"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => handleZoom(0.8)}
          className="px-3 py-1 hover:bg-gray-100"
          aria-label="Zoom out"
        >
          -
        </button>
      </div>

      {/* SVG Map */}
      <div
        className="w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Injecter le SVG de la carte du monde */}
        <div 
          ref={mapRef}
          className="svg-container" 
          style={{
            width: '100%',
            height: '100%',
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            cursor: isDragging ? 'grabbing' : 'grab',
            transformOrigin: 'center center'
          }}
          dangerouslySetInnerHTML={svgContent ? { __html: svgContent } : undefined}
        />
      </div>

      {/* Info-bulle au survol d'un pays */}
      {hoveredCountry && countryData[hoveredCountry] && (
        <div className="absolute bottom-4 right-4 bg-white p-3 rounded-md shadow-md max-w-xs">
          <p className="font-bold text-lg">{countryData[hoveredCountry].name}</p>
          <p className="text-sm">Enchère actuelle: <span className="font-semibold">{countryData[hoveredCountry].currentBid || 0} €</span></p>
          {countryData[hoveredCountry].customMessage && (
            <p className="text-sm mt-1 italic">" {countryData[hoveredCountry].customMessage} "</p>
          )}
        </div>
      )}

      {/* Indicateur du pays sélectionné */}
      {selectedCountry && (
        <div className="absolute top-4 left-4 bg-white p-2 rounded-md shadow-md">
          <p className="font-bold">{countryData[selectedCountry]?.name || 'Pays sélectionné'}</p>
          <p className="text-sm">Enchère: {countryData[selectedCountry]?.currentBid || 0} €</p>
        </div>
      )}
    </div>
  );
};

export default WorldMap;
