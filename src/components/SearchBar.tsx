import { forwardRef, useState } from 'react';
import { useGeocodingSearch } from '../features/search/useGeocodingSearch';
import type { Coordinates, GeocodingSuggestion } from '../types';

interface SearchBarProps {
  onSelect: (suggestion: GeocodingSuggestion) => void;
  proximity?: Coordinates | null;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { onSelect, proximity },
  ref,
) {
  const [query, setQuery] = useState('');
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const { suggestions, error } = useGeocodingSearch(query, proximity);

  const handleSelect = (suggestion: GeocodingSuggestion) => {
    setQuery(suggestion.placeName);
    setIsSuggestionsOpen(false);
    onSelect(suggestion);
  };

  return (
    <div className="relative w-full">
      <input
        ref={ref}
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsSuggestionsOpen(true);
        }}
        placeholder="Para onde você vai?"
        className="w-full rounded-lg border border-surface-foreground/20 bg-surface px-4 py-2 text-surface-foreground shadow-sm focus:border-primary focus:outline-none"
        aria-label="Buscar destino"
      />
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      {isSuggestionsOpen && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-surface-foreground/10 bg-surface shadow-lg">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id} className="text-surface-foreground">
              <button
                type="button"
                onClick={() => handleSelect(suggestion)}
                className="w-full px-4 py-2 text-left hover:bg-primary/10"
              >
                {suggestion.placeName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
