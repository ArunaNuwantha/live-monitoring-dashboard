/**
 * Ports: the interfaces the application layer depends on.
 * Infrastructure provides implementations (adapters); the core never imports them.
 */

/** Why a transport closed, coarse-grained on purpose: nothing sensitive crosses this boundary. */
export type TransportCloseReason = 'network' | 'auth' | 'protocol'

export interface TransportHandlers {
  onOpen(): void
  /** Raw, untrusted frame. Validation happens in the application layer, never in the adapter. */
  onMessage(data: unknown): void
  onClose(reason: TransportCloseReason): void
}

export interface TransportConnection {
  /** Closes the connection. After this call the adapter must not invoke any handler. */
  close(): void
}

export interface StreamTransport {
  open(handlers: TransportHandlers): TransportConnection
}

/** Diagnostic sink. Accepts fixed event codes only, never payloads, URLs or tokens. */
export interface Logger {
  debug(code: string): void
  warn(code: string): void
}

export const silentLogger: Logger = { debug: () => {}, warn: () => {} }
