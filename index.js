require('dotenv').config()

const express = require('express')
const http = require('http')
const url = require('url')
const WebSocket = require('ws')
const Axios = require('axios')

const app = express()
const bodyParser = require('body-parser')

app.use(bodyParser.json())

const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

const ssoApiClient = Axios.create({
  baseURL: 'https://sso.runetek.io/api'
})

const BroadcastSecretKey = process.env.WEBHOOK_KEY

if (!BroadcastSecretKey) {
  console.error('Error: WEBHOOK_KEY must be set')
  process.exit(1)
}

const fetchCurrentRev = () => ssoApiClient.get('revision').then(({ data }) => data.revision)

class RevisionBroadcaster {
  constructor (wss, currentRevision) {
    this.wss = wss
    this._revision = currentRevision
  }

  get revision () {
    return +this._revision
  }

  set revision (v) {
    if (+v > this.revision) {
      this.wss.broadcast(v)
      this._revision = v
    }
  }
}

wss.broadcast = function broadcast(data) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  })
}

function clientHeartbeat (ws) {
  try {
    if (ws.isAlive === false) {
      return ws.terminate()
    }

    // fail silently
    ws.ping('', false, true)
    ws.isAlive = false
  } catch (e) {
    console.error(e)
  }
}

const init = async () => {
  const revision = await fetchCurrentRev()

  const broadcaster = new RevisionBroadcaster(wss, revision)

  wss.on('connection', (ws, req) => {
    ws.isAlive = true
    ws.on('pong', () => {
      ws.isAlive = true
    })
    ws.send(broadcaster.revision)
  })

  setInterval(function () {
    wss.clients.forEach(clientHeartbeat)
  }, 30e3)

  app.post('/broadcast', (req, res) => {
    const location = url.parse(req.url, true)

    if (location.query.key !== BroadcastSecretKey) {
      return res.status(403).send('Not authorized')
    }

    broadcaster.revision = +req.body.revision

    res.send('ye')
  })

  server.listen(8080, function listening() {
    console.log('Listening on %d', server.address().port)
  })
}

init()
