const express = require('express')
const http = require('http')
const url = require('url')
const WebSocket = require('ws')
const Axios = require('axios')

const app = express()

const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

const ssoApiClient = Axios.create({
  baseURL: 'https://sso.runetek.io/api'
})

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

const init = async () => {
  const revision = await fetchCurrentRev()

  const broadcaster = new RevisionBroadcaster(wss, revision)

  wss.on('connection', function connection(ws, req) {
    ws.send(broadcaster.revision)
  })

  app.get('/broadcast', (req, res) => {
    const location = url.parse(req.url, true)

    broadcaster.revision = +location.query.rev

    res.send('ye')
  })

  server.listen(8080, function listening() {
    console.log('Listening on %d', server.address().port)
  })
}

init()
