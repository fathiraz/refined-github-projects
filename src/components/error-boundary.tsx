import React from 'react'

interface State { hasError: boolean; message: string }

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren<{ name: string }>,
  State
> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '8px 12px', fontSize: 11,
          color: 'var(--color-danger-fg, #f85149)',
          background: 'rgba(248,81,73,0.08)',
          border: '1px solid var(--color-danger-muted)',
          borderRadius: 6,
        }}>
          RGP error ({this.props.name}): {this.state.message}
        </div>
      )
    }
    return this.props.children
  }
}
