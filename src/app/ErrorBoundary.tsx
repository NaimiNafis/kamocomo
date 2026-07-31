import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Last line of defense against a white screen (Phase 9): any render/runtime
 * error below this boundary shows a recoverable message instead of a blank
 * page -- important for flaky outdoor mobile where a failed map init or
 * data fetch shouldn't strand the user. Copy is intentionally not i18n'd:
 * i18next may itself be the thing that failed.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-kamo-stone p-8 text-center">
        <p className="font-display text-lg text-kamo-ink">Something went wrong</p>
        <p className="font-ui text-sm text-kamo-ink/60">問題が発生しました</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-kamo-indigo px-5 py-2.5 font-ui text-sm font-medium text-kamo-stone"
        >
          Reload · 再読み込み
        </button>
      </div>
    );
  }
}
