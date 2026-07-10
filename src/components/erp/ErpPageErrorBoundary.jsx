'use client';

import React from 'react';

/**
 * Catches render errors inside a single ERP page so the whole /erp tree
 * error boundary does not replace the shell with "Workspace unavailable".
 */
export default class ErpPageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ERP page error:', error, info);
  }

  render() {
    const { error } = this.state;
    if (error) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Something went wrong';
      return (
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-200/80 bg-rose-50/90 px-6 py-8 text-center shadow-sm dark:border-rose-900/45 dark:bg-rose-950/30">
          <p className="text-base font-bold text-rose-900 dark:text-rose-100">Could not load this page</p>
          <p className="mt-2 text-sm text-rose-800/90 dark:text-rose-200/90">{message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null }, () => this.props.onRetry?.())}
            className="mt-5 rounded-xl erp-brand-fill px-5 py-2.5 text-sm font-bold text-white shadow-md"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
