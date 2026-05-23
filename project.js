const ProjectJS = (() => {
  'use strict'

  const _version = '2.0.0'

  const Tick = (() => {
    const _tasks = new Map()
    let _running = false

    function _loop(ts) {
      _tasks.forEach((task, id) => {
        task.fn(ts)
        if (task.once) _tasks.delete(id)
      })
      if (_tasks.size > 0) {
        requestAnimationFrame(_loop)
      } else {
        _running = false
      }
    }

    function add(fn, once = false) {
      const id = Symbol()
      _tasks.set(id, { fn, once })
      if (!_running) {
        _running = true
        requestAnimationFrame(_loop)
      }
      return id
    }

    function remove(id) {
      _tasks.delete(id)
    }

    function once(fn) {
      return add(fn, true)
    }

    return { add, remove, once }
  })()

  const Events = (() => {
    const _map = new Map()

    function on(event, fn) {
      if (!_map.has(event)) _map.set(event, new Set())
      _map.get(event).add(fn)
      return () => off(event, fn)
    }

    function off(event, fn) {
      _map.get(event)?.delete(fn)
    }

    function emit(event, ...args) {
      _map.get(event)?.forEach(fn => fn(...args))
    }

    function once(event, fn) {
      const unsub = on(event, (...args) => { fn(...args); unsub() })
      return unsub
    }

    return { on, off, emit, once }
  })()

  const State = (() => {
    function create(initial) {
      let _value = structuredClone(initial)
      const _subs = new Set()

      function get() { return _value }

      function set(next) {
        _value = typeof next === 'function' ? next(_value) : next
        _subs.forEach(fn => fn(_value))
      }

      function patch(partial) {
        set({ ..._value, ...partial })
      }

      function subscribe(fn, immediate = false) {
        _subs.add(fn)
        if (immediate) fn(_value)
        return () => _subs.delete(fn)
      }

      function reset() { set(structuredClone(initial)) }

      return { get, set, patch, subscribe, reset }
    }

    return { create }
  })()

  const Store = (() => {
    function _storage(session) { return session ? sessionStorage : localStorage }

    function set(key, value, session = false) {
      _storage(session).setItem(key, JSON.stringify(value))
    }

    function get(key, fallback = null, session = false) {
      const raw = _storage(session).getItem(key)
      if (raw === null) return fallback
      try { return JSON.parse(raw) } catch { return fallback }
    }

    function remove(key, session = false) {
      _storage(session).removeItem(key)
    }

    function clear(session = false) {
      _storage(session).clear()
    }

    return { set, get, remove, clear }
  })()

  const Net = (() => {
    const _cfg = {
      baseUrl: '',
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    }

    function configure(opts) {
      Object.assign(_cfg, opts)
    }

    async function request(path, opts = {}) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), _cfg.timeout)
      const url = path.startsWith('http') ? path : _cfg.baseUrl + path
      const headers = { ..._cfg.headers, ...opts.headers }
      const res = await fetch(url, { ...opts, headers, signal: ctrl.signal })
        .finally(() => clearTimeout(timer))
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      return res.json()
    }

    function get(path, opts = {}) {
      return request(path, { ...opts, method: 'GET' })
    }

    function post(path, body, opts = {}) {
      return request(path, { ...opts, method: 'POST', body: JSON.stringify(body) })
    }

    function put(path, body, opts = {}) {
      return request(path, { ...opts, method: 'PUT', body: JSON.stringify(body) })
    }

    function del(path, opts = {}) {
      return request(path, { ...opts, method: 'DELETE' })
    }

    function socket(url, handlers = {}) {
      let ws = null
      let _timer = null
      let _delay = 1000
      let _alive = true
      const _queue = []

      function connect() {
        ws = new WebSocket(url)

        ws.onopen = () => {
          _delay = 1000
          Events.emit('net:open', { url })
          handlers.open?.()
          while (_queue.length) ws.send(_queue.shift())
        }

        ws.onmessage = e => {
          let data = e.data
          try { data = JSON.parse(e.data) } catch {}
          Events.emit('net:message', data)
          handlers.message?.(data)
        }

        ws.onerror = e => {
          Events.emit('net:error', e)
          handlers.error?.(e)
        }

        ws.onclose = () => {
          Events.emit('net:close', { url })
          handlers.close?.()
          if (_alive) {
            _timer = setTimeout(connect, _delay)
            _delay = Math.min(_delay * 2, 30000)
          }
        }
      }

      function send(data) {
        const raw = typeof data === 'string' ? data : JSON.stringify(data)
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(raw)
        } else {
          _queue.push(raw)
        }
      }

      function close() {
        _alive = false
        clearTimeout(_timer)
        ws?.close()
      }

      connect()
      return { send, close, get ws() { return ws } }
    }

    return { configure, get, post, put, del, socket }
  })()

  const Dom = (() => {
    function query(sel, ctx = document) {
      return ctx.querySelector(sel)
    }

    function queryAll(sel, ctx = document) {
      return [...ctx.querySelectorAll(sel)]
    }

    function create(tag, attrs = {}, children = []) {
      const el = document.createElement(tag)
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'class') el.className = v
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
        else el.setAttribute(k, v)
      })
      children.forEach(c => el.append(typeof c === 'string' ? document.createTextNode(c) : c))
      return el
    }

    function mount(el, target = document.body) {
      target.append(el)
      return el
    }

    function remove(el) {
      el?.parentNode?.removeChild(el)
    }

    function on(el, event, fn, opts) {
      el.addEventListener(event, fn, opts)
      return () => el.removeEventListener(event, fn)
    }

    function animate(el, keyframes, opts = {}) {
      return el.animate(keyframes, { fill: 'forwards', ...opts })
    }

    function intersect(el, fn, opts = {}) {
      const obs = new IntersectionObserver(entries => entries.forEach(fn), opts)
      obs.observe(el)
      return () => obs.disconnect()
    }

    return { query, queryAll, create, mount, remove, on, animate, intersect }
  })()

  const Router = (() => {
    const _routes = new Map()
    let _current = null

    function on(path, handler) {
      _routes.set(path, handler)
      return Router
    }

    function navigate(path) {
      location.hash = path
    }

    function _resolve() {
      const path = location.hash.slice(1) || '/'
      if (path !== _current) {
        _current = path
        Events.emit('router:change', { path })
        _routes.get(path)?.({ path })
      }
    }

    function init() {
      window.addEventListener('hashchange', _resolve)
      _resolve()
      return Router
    }

    function current() { return _current }

    return { on, navigate, init, current }
  })()

  const Visitor = (() => {
    const _KEY = 'pjs_visitors'
    const _BEAT = 5000
    const _TTL = 15000
    const _subs = new Set()

    let _self = null
    let _channel = null
    let _timer = null
    let _geo = null

    function _uid() {
      return Math.random().toString(36).slice(2, 10).toUpperCase()
    }

    function _now() { return Date.now() }

    function _read() {
      const raw = localStorage.getItem(_KEY)
      try { return raw ? JSON.parse(raw) : {} } catch { return {} }
    }

    function _write(data) {
      localStorage.setItem(_KEY, JSON.stringify(data))
    }

    function _purge(data) {
      const cut = _now() - _TTL
      let dirty = false
      Object.keys(data).forEach(id => {
        if (data[id].ts < cut) { delete data[id]; dirty = true }
      })
      return dirty
    }

    function _active() {
      const data = _read()
      _purge(data)
      return Object.values(data)
    }

    function _notify() {
      const list = _active()
      _subs.forEach(fn => fn(list))
      Events.emit('visitor:update', list)
    }

    function _beat() {
      const data = _read()
      _purge(data)
      data[_self] = {
        id: _self,
        ts: _now(),
        page: location.pathname + location.hash,
        geo: _geo,
        ua: navigator.platform
      }
      _write(data)
      _channel?.postMessage({ type: 'beat', id: _self })
      _notify()
    }

    function _leave() {
      const data = _read()
      delete data[_self]
      _write(data)
      _channel?.postMessage({ type: 'leave', id: _self })
    }

    async function _fetchGeo() {
      try {
        const res = await fetch('https://ipapi.co/json/')
        if (!res.ok) return null
        const d = await res.json()
        return { country: d.country_name, city: d.city, code: d.country_code }
      } catch {
        return null
      }
    }

    function _flag(code) {
      if (!code || code.length !== 2) return '🌐'
      return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65))
    }

    async function init() {
      _self = sessionStorage.getItem('pjs_sid') || _uid()
      sessionStorage.setItem('pjs_sid', _self)

      _geo = await _fetchGeo()

      if (typeof BroadcastChannel !== 'undefined') {
        _channel = new BroadcastChannel(_KEY)
        _channel.onmessage = () => _notify()
      }

      window.addEventListener('storage', e => {
        if (e.key === _KEY) _notify()
      })

      window.addEventListener('beforeunload', _leave)

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          clearInterval(_timer)
        } else {
          _beat()
          _timer = setInterval(_beat, _BEAT)
        }
      })

      _beat()
      _timer = setInterval(_beat, _BEAT)

      return Visitor
    }

    function onUpdate(fn) {
      _subs.add(fn)
      return () => _subs.delete(fn)
    }

    function getActive() { return _active() }

    function getSelf() { return { id: _self, geo: _geo } }

    function count() { return _active().length }

    function flag(code) { return _flag(code) }

    return { init, onUpdate, getActive, getSelf, count, flag }
  })()

  return { version: _version, Tick, Events, State, Store, Net, Dom, Router, Visitor }
})()
