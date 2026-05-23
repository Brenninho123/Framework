import http from 'http'
import fs from 'fs'
import path from 'path'
import url from 'url'

export default class ProjectServer {

    constructor(config = {}) {

        this.port = config.port || 3000
        this.host = config.host || '0.0.0.0'
        this.public = config.public || 'public'

        this.routes = {}

        this.mime = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        }

        this.server = http.createServer(
            this.#handle.bind(this)
        )
    }

    get(route, callback) {
        this.routes[`GET:${route}`] =
            callback
    }

    post(route, callback) {
        this.routes[`POST:${route}`] =
            callback
    }

    listen(callback) {
        this.server.listen(
            this.port,
            this.host,
            () => {

                console.log(`
ProjectJS Server Running

Local:
http://localhost:${this.port}

Network:
http://${this.host}:${this.port}
                `)

                if (callback)
                    callback()
            }
        )
    }

    json(res, data) {
        res.writeHead(200, {
            'Content-Type':
                'application/json'
        })

        res.end(
            JSON.stringify(data)
        )
    }

    send(res, data, type = 'text/html') {
        res.writeHead(200, {
            'Content-Type': type
        })

        res.end(data)
    }

    #handle(req, res) {

        const parsed =
            url.parse(req.url, true)

        const route =
            `${req.method}:${parsed.pathname}`

        if (this.routes[route]) {

            let body = ''

            req.on('data', chunk => {
                body += chunk.toString()
            })

            req.on('end', () => {

                try {
                    req.body =
                        JSON.parse(body)
                } catch {
                    req.body = body
                }

                req.query = parsed.query

                this.routes[route](
                    req,
                    res
                )
            })

            return
        }

        this.#serveStatic(
            parsed.pathname,
            res
        )
    }

    #serveStatic(requestPath, res) {

        let filePath = path.join(
            process.cwd(),
            this.public,
            requestPath === '/'
                ? 'index.html'
                : requestPath
        )

        const ext =
            path.extname(filePath)

        const type =
            this.mime[ext] ||
            'text/plain'

        fs.readFile(
            filePath,
            (error, content) => {

                if (error) {

                    res.writeHead(404)

                    res.end(`
<h1>404</h1>
<p>File not found.</p>
                    `)

                    return
                }

                res.writeHead(200, {
                    'Content-Type': type
                })

                res.end(content)
            }
        )
    }
}
