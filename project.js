export default class ProjectJS {
    constructor(config = {}) {
        this.version = '1.0.0'

        this.el =
            typeof config.el === 'string'
                ? document.querySelector(config.el)
                : config.el

        this.template = config.template || ''
        this.methods = config.methods || {}
        this.components = config.components || {}
        this.watchers = {}
        this.hooks = {
            mounted: config.mounted || null,
            updated: config.updated || null
        }

        this.eventCache = []

        this.state = this.#reactive(
            config.data || {}
        )

        this.computed = config.computed || {}

        this.#initComputed()

        this.#render()

        if (this.hooks.mounted)
            this.hooks.mounted.call(this)
    }

    #reactive(object) {
        const self = this

        return new Proxy(object, {
            get(target, key) {
                return target[key]
            },

            set(target, key, value) {
                target[key] = value

                self.#update()

                if (self.watchers[key]) {
                    self.watchers[key]
                        .forEach(fn => fn(value))
                }

                return true
            }
        })
    }

    #initComputed() {
        Object.keys(this.computed)
            .forEach(key => {
                Object.defineProperty(
                    this.state,
                    key,
                    {
                        get: () => {
                            return this.computed[key]
                                .call(this)
                        }
                    }
                )
            })
    }

    watch(key, callback) {
        if (!this.watchers[key])
            this.watchers[key] = []

        this.watchers[key]
            .push(callback)
    }

    set(key, value) {
        this.state[key] = value
    }

    get(key) {
        return this.state[key]
    }

    component(name, template) {
        this.components[name] = template

        this.#update()
    }

    emit(event, detail = {}) {
        window.dispatchEvent(
            new CustomEvent(event, {
                detail
            })
        )
    }

    on(event, callback) {
        window.addEventListener(
            event,
            callback
        )
    }

    use(plugin) {
        plugin(this)
    }

    destroy() {
        this.eventCache.forEach(event => {
            event.el.removeEventListener(
                event.type,
                event.fn
            )
        })

        this.el.innerHTML = ''
    }

    #evaluate(expression) {
        try {
            return new Function(
                'state',
                `
                with(state){
                    return ${expression}
                }
                `
            )(this.state)
        } catch {
            return ''
        }
    }

    #parseVariables(html) {
        return html.replace(
            /\{\{(.*?)\}\}/g,
            (_, expression) => {
                return this.#evaluate(
                    expression.trim()
                )
            }
        )
    }

    #parseConditions(html) {
        return html.replace(
            /<(.+?)\s+pj-if="(.*?)">(.*?)<\/\1>/gs,
            (_, tag, condition, content) => {

                const result =
                    this.#evaluate(condition)

                return result
                    ? `<${tag}>${content}</${tag}>`
                    : ''
            }
        )
    }

    #parseLoops(html) {
        return html.replace(
            /<(.+?)\s+pj-for="(.*?)\s+in\s+(.*?)">(.*?)<\/\1>/gs,
            (_, tag, item, arrayName, content) => {

                const array =
                    this.#evaluate(arrayName)

                if (!Array.isArray(array))
                    return ''

                return array.map(value => {

                    let result = content

                    result = result.replace(
                        new RegExp(
                            `\\{\\{\\s*${item}\\s*\\}\\}`,
                            'g'
                        ),
                        value
                    )

                    return `<${tag}>${result}</${tag}>`

                }).join('')
            }
        )
    }

    #parseComponents(html) {
        Object.keys(this.components)
            .forEach(component => {

                const regex =
                    new RegExp(
                        `<${component}></${component}>`,
                        'g'
                    )

                html = html.replace(
                    regex,
                    this.components[component]
                )
            })

        return html
    }

    #clearEvents() {
        this.eventCache.forEach(event => {
            event.el.removeEventListener(
                event.type,
                event.fn
            )
        })

        this.eventCache = []
    }

    #bindEvents() {
        const events = [
            'click',
            'input',
            'change',
            'submit',
            'mouseover',
            'keydown'
        ]

        events.forEach(type => {

            this.el.querySelectorAll(
                `[pj-${type}]`
            ).forEach(el => {

                const method =
                    el.getAttribute(
                        `pj-${type}`
                    )

                if (!this.methods[method])
                    return

                const fn = e => {
                    this.methods[method]
                        .call(this, e)
                }

                el.addEventListener(
                    type,
                    fn
                )

                this.eventCache.push({
                    el,
                    type,
                    fn
                })
            })
        })

        this.el.querySelectorAll(
            '[pj-model]'
        ).forEach(el => {

            const model =
                el.getAttribute(
                    'pj-model'
                )

            el.value = this.state[model]

            const fn = e => {
                this.state[model] =
                    e.target.value
            }

            el.addEventListener(
                'input',
                fn
            )

            this.eventCache.push({
                el,
                type: 'input',
                fn
            })
        })
    }

    #render() {
        if (!this.el) return

        this.#clearEvents()

        let html = this.template

        html = this.#parseComponents(html)
        html = this.#parseConditions(html)
        html = this.#parseLoops(html)
        html = this.#parseVariables(html)

        this.el.innerHTML = html

        this.#bindEvents()
    }

    #update() {
        this.#render()

        if (this.hooks.updated)
            this.hooks.updated.call(this)
    }
}