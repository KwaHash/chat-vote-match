import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import http from 'http'
import { WebSocketServer } from 'ws'
import { createConversationRouter } from './routes.js'
import { createWebSocketHub } from './ws.js'

dotenv.config()

const port = Number(process.env.PORT)
const corsOrigins = (process.env.CORS_ORIGINS!).split(',').map((origin) => origin.trim()).filter(Boolean)

const app = express()
const server = http.createServer(app)
const { handleConnection, broadcastMessage } = createWebSocketHub()
const wss = new WebSocketServer({ server, path: '/ws' })

app.use(cors({
    origin: corsOrigins,
    credentials: true,
  })
)
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/socket', createConversationRouter(broadcastMessage))

wss.on('connection', handleConnection)

server.listen(port, () => {
  console.log(`web socket server on ${port}`)
})
