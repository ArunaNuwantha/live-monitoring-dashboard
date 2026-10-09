import type { StreamTransport, TransportConnection, TransportHandlers } from '../application/ports'

export interface FakeConnection extends TransportConnection {
  readonly handlers: TransportHandlers
  closed: boolean
}

/** Test double for the transport port: tests drive open/message/close by hand. */
export class FakeTransport implements StreamTransport {
  readonly connections: FakeConnection[] = []

  open(handlers: TransportHandlers): TransportConnection {
    const connection: FakeConnection = {
      handlers,
      closed: false,
      close() {
        this.closed = true
      },
    }
    this.connections.push(connection)
    return connection
  }

  get last(): FakeConnection {
    const connection = this.connections.at(-1)
    if (!connection) throw new Error('no connection opened')
    return connection
  }
}

let counter = 0
export const frame = (patch: Record<string, unknown> = {}): string =>
  JSON.stringify({
    id: `evt_${++counter}`,
    ts: Date.now(),
    service: 'payments',
    severity: 'info',
    latencyMs: 42,
    message: 'Request completed',
    ...patch,
  })
