class ProjectJS {
    constructor(options = {}) {
        this.$el =
            typeof options.el === 'string'
                ? document.querySelector(options.el)
                : options.el

        this.$template = options.template || ''
        this.$methods = options.methods || {}
        this.$watchers = {}
        this.$mounted = false
        this.$events = []
        this.$computed = options.computed || {}

        this.data = this.#reactive(options.data || {})

        this.#initComputed()
        this.#render()

        if (options.mounted)
            options.mounted.call(this)

        this.$mounted = true
    }

    #reactive(obj) {
        const self = this

        return new Proxy(obj, {
            get(target, key) {
                return target[key]
            },

            set(target, key, value) {
                target[key] = value

                self.#updateComputed()
                self.#render()

                if (self.$watchers[key]) {
                    self.$watchers[key].forEach(fn => fn(value))
                }

                return true
            }
        })
    }

    #initComputed() {
        for (const key in this.$computed) {
            Object.defineProperty(this.data, key, {
                get: () => {
                    return this.$computed[key].call(this)
                }
            })
        }
    }

    #updateComputed() {
        for (const key in this.$computed) {
            this.data[key]
        }
    }

    watch(key, callback) {
        if (!this.$watchers[key])
            this.$watchers[key] = []

        this.$watchers[key].push(callback)
    }

    set(key, value) {
        this.data[key] = value
    }

    get(key) {
        return this.data[key]
    }

    #parse(html) {
        html = html.replace(/\{\{(.*?)\}\}/g, (_, expr) => {
            try {
                return new Function(
                    'data',
                    `with(data){ return ${expr} }`
                )(this.data)
            } catch {
                return ''
            }
        })

        return html
    }

    #clearEvents() {
        this.$events.forEach(event => {
            event.el.removeEventListener(
                event.type,
                event.fn
            )
        })

        this.$events = []
    }

    #bindEvents() {
        const events = [
            'click',
            'input',
            'change',
            'submit'
        ]

        events.forEach(type => {
            this.$el.querySelectorAll(`[pj-${type}]`)
                .forEach(el => {
                    const method =
                        el.getAttribute(`pj-${type}`)

                    if (!this.$methods[method]) return

                    const fn = e => {
                        this.$methods[method].call(
                            this,
                            e
                        )
                    }

                    el.addEventListener(type, fn)

                    this.$events.push({
                        el,
                        type,
                        fn
                    })
                })
        })

        this.$el.querySelectorAll('[pj-model]')
            .forEach(el => {
                const key =
                    el.getAttribute('pj-model')

                el.value = this.data[key]

                const fn = e => {
                    this.data[key] = e.target.value
                }

                el.addEventListener('input', fn)

                this.$events.push({
                    el,
                    type: 'input',
                    fn
                })
            })
    }

    #renderLoops(html) {
        return html.replace(
            /<(.+?)\s+pj-for="(.*?)\s+in\s+(.*?)">(.*?)<\/\1>/gs,
            (_, tag, item, list, content) => {
                const arr =
                    this.data[list.trim()] || []

                return arr.map(value => {
                    return `<${tag}>${content.replace(
                        new RegExp(`\\{\\{\\s*${item}\\s*\\}\\}`, 'g'),
                        value
                    )}</${tag}>`
                }).join('')
            }
        )
    }

    #renderConditions(html) {
        return html.replace(
            /<(.+?)\s+pj-if="(.*?)">(.*?)<\/\1>/gs,
            (_, tag, condition, content) => {
                let result = false

                try {
                    result = new Function(
                        'data',
                        `with(data){ return ${condition} }`
                    )(this.data)
                } catch {}

                return result
                    ? `<${tag}>${content}</${tag}>`
                    : ''
            }
        )
    }

    #render() {
        if (!this.$el) return

        this.#clearEvents()

        let html = this.$template

        html = this.#renderLoops(html)
        html = this.#renderConditions(html)
        html = this.#parse(html)

        this.$el.innerHTML = html

        this.#bindEvents()
    }
}

window.ProjectJS = ProjectJS
