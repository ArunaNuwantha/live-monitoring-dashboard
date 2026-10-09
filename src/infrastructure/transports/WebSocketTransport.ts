import type { StreamTransport, TransportCloseReason, TransportConnection, TransportHandlers } from '../../application/ports'

/** Supplies a short-lived token at connect time. The token is never stored beyond the call. */
export type TokenProvider = () => Promise<string | null>

export interface WebSocketTransportOptions {
  readonly url: string
  readonly getToken?: TokenProvider
}

/** Close codes that mean "retrying won't help". */
const AUTH_CODES = new Set([1008, 4001, 4003])
const PROTOCOL_CODES = new Set([1002, 1003, 1007, 1009])

const toReason = (code: number): TransportCloseReason =>
  AUTH_CODES.has(code) ? 'auth' : PROTOCOL_CODES.has(code) ? 'protocol' : 'network'

/**
 * WebSocket adapter.
 *
 * Auth: the token is sent as the first frame after the socket opens. It is
 * never put in the URL, where it would leak into server logs, proxies and
 * history, and it is never logged. The server is expected to close with
 * 4001/4003 if auth fails.
 */
export class WebSocketTransport implements StreamTransport {
  readonly #options: WebSocketTransportOptions

  constructor(options: WebSocketTransportOptions) {
    this.#options = options
  }

  open(handlers: TransportHandlers): TransportConnection {
    let closed = false
    let socket: WebSocket | null = null

    const detach = () => {
      if (!socket) return
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
    }

    const connect = (token: string | null) => {
      if (closed) return
      socket = new WebSocket(this.#options.url)
      // Binary frames arrive as ArrayBuffer and are rejected by validation ("not-text").
      socket.binaryType = 'arraybuffer'

      socket.onopen = () => {
        if (token) socket?.send(JSON.stringify({ type: 'auth', token }))
        handlers.onOpen()
      }
      socket.onmessage = (event: MessageEvent) => handlers.onMessage(event.data)
      socket.onclose = (event: CloseEvent) => {
        detach()
        if (!closed) handlers.onClose(toReason(event.code))
        closed = true
      }
      // onerror is always followed by onclose; the event carries no useful (or safe) detail.
      socket.onerror = () => {}
    }

    if (this.#options.getToken) {
      this.#options.getToken().then(
        (token) => connect(token),
        () => {
          if (!closed) handlers.onClose('auth')
          closed = true
        },
      )
    } else {
      connect(null)
    }

    return {
      close: () => {
        closed = true
        detach()
        if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000)
      },
    }
  }
}
