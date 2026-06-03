'use client';

import { createContext, useContext } from 'react';

const ErpShellNotificationsContext = createContext(null);

export function ErpShellNotificationsProvider({ value, children }) {
  return (
    <ErpShellNotificationsContext.Provider value={value}>{children}</ErpShellNotificationsContext.Provider>
  );
}

export function useErpShellNotifications() {
  return useContext(ErpShellNotificationsContext);
}
