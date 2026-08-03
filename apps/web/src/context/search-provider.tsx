import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type SearchContextValue = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
};

const SearchContext = createContext<SearchContextValue | null>(null);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable=true]") !== null
  );
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "k" ||
        (!event.metaKey && !event.ctrlKey) ||
        isEditableTarget(event.target)
      )
        return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return <SearchContext value={value}>{children}</SearchContext>;
}

export function useSearch() {
  const value = useContext(SearchContext);
  if (!value) throw new Error("useSearch must be used within SearchProvider.");
  return value;
}
