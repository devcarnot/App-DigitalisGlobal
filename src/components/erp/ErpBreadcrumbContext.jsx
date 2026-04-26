'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ErpBreadcrumbContext = createContext(null);

export function ErpBreadcrumbProvider({ children }) {
  const [labels, setLabels] = useState({});

  const setBreadcrumbLabel = useCallback((key, value) => {
    setLabels((prev) => {
      const next = { ...prev };
      if (value == null || value === '') {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ labels, setBreadcrumbLabel }),
    [labels, setBreadcrumbLabel]
  );

  return <ErpBreadcrumbContext.Provider value={value}>{children}</ErpBreadcrumbContext.Provider>;
}

export function useErpBreadcrumb() {
  const ctx = useContext(ErpBreadcrumbContext);
  if (!ctx) {
    return { labels: {}, setBreadcrumbLabel: () => {} };
  }
  return ctx;
}
