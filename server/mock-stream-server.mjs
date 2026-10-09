// Local WebSocket feed for exercising the real transport path.
//   npm run mock:server            → ws://localhost:8787  (200 events/s)
//   RATE=2000 npm run mock:server
// Then run the app with VITE_STREAM_MODE=websocket VITE_STREAM_URL=ws://localhost:8787
//
// Every ~60 s the server drops each client to exercise reconnect with backoff.
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT ?? 8787)
const RATE = Math.min(20_000, Math.max(1, Number(process.env.RATE ?? 200)))
const SERVICES = ['api-gateway', 'auth', 'payments', 'search', 'inventory', 'checkout']
const pick = (a) => a[Math.floor(Math.random() * a.length)]
let seq = 0

function event() {
  const r = Math.random()
  const severity = r < 0.75 ? 'info' : r < 0.9 ? 'warning' : r < 0.98 ? 'error' : 'critical'
  return JSON.stringify({
    id: `ws_${(++seq).toString(36)}`,
    ts: Date.now(),
    service: pick(SERVICES),
    severity,
    latencyMs: Math.round((60 + Math.random() * 120) * (severity === 'info' ? 1 : 3)),
    message: `${severity} from mock server`,
  })
}

const wss = new WebSocketServer({ port: PORT, maxPayload: 4 * 1024 })

wss.on('connection', (socket) => {
  // Optional auth handshake: the client sends {"type":"auth","token":"..."} as its first frame.
  // A real server would verify the token and close with 4001 when it is invalid.
  socket.once('message', () => {})

  let carry = 0
  const tick = setInterval(() => {
    carry += RATE / 20
    const n = Math.floor(carry)
    carry -= n
    for (let i = 0; i < n; i++) socket.send(event())
  }, 50)
  const drop = setTimeout(() => socket.terminate(), 45_000 + Math.random() * 30_000)

  socket.on('close', () => {
    clearInterval(tick)
    clearTimeout(drop)
  })
})

console.log(`mock stream listening on ws://localhost:${PORT} at ~${RATE} events/s`)
