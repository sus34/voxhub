import { useCallback, useEffect, useState } from 'react';

/** Where the chat sits and how big it is — remembered between launches. */

const KEY = 'voxhub.layout';

export const LAYOUT_DEFAULTS = {
  chatSide: 'bottom', // 'bottom' | 'right'
  chatHeight: 210,
  chatWidth: 340,
  sidebarHidden: false,
};

function read() {
  try {
    return { ...LAYOUT_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return { ...LAYOUT_DEFAULTS };
  }
}

export function useLayout() {
  const [layout, setLayout] = useState(read);

  const update = useCallback((patch) => {
    setLayout((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* applies for this run, just not remembered */
      }
      return next;
    });
  }, []);

  return [layout, update];
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}
