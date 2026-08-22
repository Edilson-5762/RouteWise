import { useState } from 'react';
import { useGeocodingSearch } from '../features/search/useGeocodingSearch';
import type { GeocodingSuggestion } from '../types';

interface SearchBarProps {
  onSelect: (suggestion: GeocodingSuggestion) => void;
}

export function SearchBar({ onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const { suggestions, error } = useGeocodingSearch(query);

  const handleSelect = (suggestion: GeocodingSuggestion) => {
    setQuery(suggestion.placeName);
    onSelect(suggestion);
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Para onde você vai?"
        className="w-full rounded-lg border border-slate-300 px-4 py-2 shadow-sm focus:border-blue-500 focus:outline-none"
        aria-label="Buscar destino"
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                onClick={() => handleSelect(suggestion)}
                className="w-full px-4 py-2 text-left hover:bg-slate-100"
              >
                {suggestion.placeName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
