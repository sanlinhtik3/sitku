import { useState, useCallback, useRef } from "react";
import { Search, Sparkles, X } from "lucide-react";

interface KnowledgeSearchBarProps {
  onSearch: (query: string) => void;
  isSearching: boolean;
}

export const KnowledgeSearchBar = ({ onSearch, isSearching }: KnowledgeSearchBarProps) => {
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      onSearch("");
      return;
    }
    debounceRef.current = setTimeout(() => onSearch(value), 600);
  }, [onSearch]);

  const handleClear = () => {
    setQuery("");
    onSearch("");
  };

  return (
    <div className="relative group">
      <div className="absolute inset-0 rounded-2xl bg-primary/5 opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 -m-0.5" />
      <div className="relative flex items-center bg-card/30 backdrop-blur-xl border border-white/[0.06] rounded-2xl px-4 py-3 gap-3 group-focus-within:border-primary/30 transition-all duration-300">
        {isSearching ? (
          <Sparkles className="h-4 w-4 text-primary animate-pulse shrink-0" />
        ) : (
          <Search className="h-4 w-4 text-muted-foreground/50 shrink-0" />
        )}
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Semantic search... find by meaning, not just keywords"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
        />
        {query && (
          <button onClick={handleClear} className="text-muted-foreground/50 hover:text-foreground transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
