import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StatusScreen } from './StatusScreen';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence for the whole tree.
 *
 * react-three-fiber renders `null` for errors raised *inside* the canvas, so the
 * scene guards its own failures (see `Scene.tsx` and the frame watchdog in
 * `App.tsx`). Anything that escapes the canvas itself - a failed WebGL context,
 * a bad import, a render-time exception in the UI - lands here and is shown to
 * the user instead of leaving an empty page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Argo Float Explorer crashed:', error, info.componentStack);
  }

  private readonly reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <div className="app">
        <main className="viewport">
          <StatusScreen
            title="The app hit an unexpected error"
            detail={`${error.message || error.name}. Reload the page, or try again below.`}
            onRetry={this.reset}
          />
        </main>
      </div>
    );
  }
}
