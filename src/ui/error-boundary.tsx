import React from 'react'
import { Box, Text } from '@primer/react'

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

interface ErrorBoundaryProps extends React.PropsWithChildren {
  name: string
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    console.error('[rgp:error-boundary] caught error:', error)
    return { hasError: true, message: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box
          role="alert"
          sx={{
            p: 3,
            fontSize: 0,
            color: 'danger.fg',
            bg: 'danger.subtle',
            border: '1px solid',
            borderColor: 'danger.muted',
            borderRadius: 2,
            boxShadow: 'none',
          }}
        >
          <Text as="p" sx={{ m: 0 }}>
            RGP error ({this.props.name}): {this.state.message}
          </Text>
        </Box>
      )
    }

    return this.props.children
  }
}
