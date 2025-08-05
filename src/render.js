
export default class Render
{
    static style_loaded = false
    static style__ = null
    static style_promise = null
    static instance_count = 0

    constructor()
    {
        Render.instance_count++

        if (!Render.style_promise) {
            Render.style_promise = this.inject_style()
        }
    }

    async inject_style()
    {
        if(!Render.style_loaded)
        {
            const styles_uri = ['/src/styles/msg_box.css', '/src/styles/alert.css', '/src/styles/spinner.css']
            const style = document.createElement('style');
            style.id = this.__id()
            style.textContent = '/*======= techz-render components css =======*/'

            for(let uri of styles_uri)
            {
                style.textContent += await (await fetch(uri)).text()
            }

            document.head.appendChild(style)

            Render.style_loaded = true
            Render.style__ = style.id
        }
    }


    build(prms)
    {
        switch (prms.type)
        {
            case 'msg_box':
            {
                const id__ = this.__id();

                const theme = prms.props.theme === 'light' ? 'light' : 'dark'

                const ntf = document.createElement('div');
                ntf.id = id__
                ntf.className = theme === 'light' ? 'backdrop-light' : 'backdrop';

                const ntf_content = document.createElement('div');
                ntf_content.className = theme === 'light' ? 'msg-box-light' : 'msg-box';

                const ntf_close_btn = document.createElement('button');
                ntf_close_btn.className = theme === 'light' ? 'close-light close' : 'close';
                ntf_close_btn.innerHTML =  '&times;'
                ntf_close_btn.addEventListener('click', () => {
                    prms.props.action.cancel.callback()
                    this.destroy(ntf.id)
                })

                const ntf_title = document.createElement('h2')
                ntf_title.innerHTML = prms.props.title

                const ntf_msg = document.createElement('p')
                ntf_msg.innerHTML = prms.props.msg;

                const ntf_actions = document.createElement('div')
                ntf_actions.className = 'actions'

                const ntf_cancel_btn = document.createElement('button')
                ntf_cancel_btn.className = theme === 'light' ? 'cancel-light cancel' : 'cancel'
                ntf_cancel_btn.innerHTML = prms.props.action.cancel.text
                ntf_cancel_btn.addEventListener('click', () => {
                    prms.props.action.cancel.callback()
                    this.destroy(ntf.id)
                })

                const ntf_confirm_btn = document.createElement('button')
                ntf_confirm_btn.className = theme === 'light' ? 'confirm-light confirm' : 'confirm'
                ntf_confirm_btn.innerHTML = prms.props.action.confirm.text
                ntf_confirm_btn.addEventListener('click', () => {
                    prms.props.action.confirm.callback()
                    this.destroy(ntf.id)
                })

                ntf_actions.appendChild(ntf_cancel_btn)
                ntf_actions.appendChild(ntf_confirm_btn)

                ntf_content.appendChild(ntf_close_btn)
                ntf_content.appendChild(ntf_title)
                ntf_content.appendChild(ntf_msg)
                ntf_content.appendChild(ntf_actions)

                ntf.appendChild(ntf_content)

                document.body.appendChild(ntf)

                return ntf.id
            }
            case 'alert':
            {
                const id__ = this.__id();

                const useLight = prms.props.theme === 'light';
                const type = ['info', 'success', 'warning', 'error'].includes(prms.props.variant)
                    ? prms.props.variant
                    : 'info';
                const cls = (base) => useLight ? `${base}-light ${base}` : `${base}-dark ${base}`

                const alert = Object.assign(document.createElement('div'), {
                    id: id__,
                    className: `${cls('alert')} ${type}`,
                });

                const alert_msg = Object.assign(document.createElement('span'), {
                    className: 'alert-msg',
                    innerHTML: prms.props.msg,
                });

                const close_btn = Object.assign(document.createElement('button'), {
                    className: cls('close'),
                    innerHTML: '&times;',
                    onclick: () => this.destroy(id__)
                });

                const progress = document.createElement('div');
                progress.className = 'alert-progress';

                alert.append(alert_msg, close_btn, progress);
                document.body.appendChild(alert);

                if (prms.props.timeout) {
                    const timeout = prms.props.timeout;
                    progress.style.width = '100%'

                    const step = 100 / (timeout / 2)
                    let currentWidth = 100

                    const interval = setInterval(() => {
                        if (currentWidth <= 0) {
                            clearInterval(interval)
                            this.destroy(id__)
                            return
                        }
                        currentWidth -= step
                        progress.style.width = `${currentWidth}%`
                    }, step)
                }

                return alert.id
            }
            case 'spinner':
            {
                const id__ = this.__id();

                const { variant = 'simple', theme = 'dark', text = {}, backdrop = true, custom = {} } = prms.props

                const useLight = theme === 'light';
                const cls = (base) => useLight ? `${base}-light ${base}` : `${base}-dark ${base}`;

                const container = document.createElement('div');
                container.id = id__;
                container.className = backdrop ? cls('spinner-backdrop') : cls('spinner-container');

                const spinnerWrapper = document.createElement('div');
                spinnerWrapper.className = `spinner ${variant}`;

                if (variant === 'custom' && custom.url) {
                    const img = document.createElement('img');
                    img.src = custom.url;
                    img.alt = 'spinner';
                    img.className = `custom-spinner ${custom.animation || ''}`;
                    spinnerWrapper.appendChild(img);
                } else {
                    if (variant === 'simple' || variant === 'dual' || variant === 'triple') {
                        if (custom.animation === 'spin') {
                            const loader = document.createElement('div');
                            loader.className = 'spinner-loader';

                            const rings = variant === 'dual' ? 2 : variant === 'triple' ? 3 : 1;

                            for (let i = 0; i < rings; i++) {
                                const ring = document.createElement('div');
                                ring.className = 'spinner-ring';
                                if(custom.color) ring.style.borderColor = `${custom.color} transparent`
                                loader.appendChild(ring);
                            }

                            spinnerWrapper.appendChild(loader);
                        } else {
                            const count = variant === 'dual' ? 2 : variant === 'triple' ? 3 : 1;
                            for (let i = 0; i < count; i++) {
                                const el = document.createElement('div');
                                el.className = `spinner-circle circle-${i + 1} ${custom.animation || ''}`
                                if(custom.color) el.style.backgroundColor = custom.color
                                spinnerWrapper.appendChild(el);
                            }
                        }
                    }
                }

                container.appendChild(spinnerWrapper);

                if (text.content) {
                    const caption = document.createElement('div');
                    caption.className = 'spinner-text';
                    caption.innerText = text.content
                    if(text.color) caption.style.color = text.color

                    if(text.animated)
                    {
                        caption.innerText = ''

                        let i = 0

                        setInterval(()=>{
                            if(i === text.content.length){
                                i = 0
                                caption.innerText = ''
                            }
                            caption.innerText += text.content[i]
                            i++
                        }, 300)
                    }

                    container.appendChild(caption);
                }

                document.body.appendChild(container);

                return {
                    __id: container.id,
                    toggle: (show = true) => {
                        const spinner = document.getElementById(container.id);
                        if (spinner) {
                            spinner.classList.toggle('__hiden__', !show);
                        }
                    },
                    destroy: () => {
                        this.destroy(container.id)
                    }
                }
            }
        }
    }

    msg_box(prms = {theme: 'dark', title: 'Message', msg: 'Something...', action: { cancel: { text: 'Cancel', callback: ()=>{} }, confirm: { text: 'Confirm', callback: ()=>{}} } })
    {
        return this.build({ type: 'msg_box', props: prms })
    }

    alert(prms = {theme: 'dark', variant: 'info', msg: 'Something...', timeout: 3000})
    {
        return this.build({ type: 'alert', props: prms })
    }

    spinner(prms = {variant: 'custom', theme: 'dark', events: { screen_click: { hide: false, destroy: false }, auto__: { timer: null, hide: false, destroy: false } }, text: { content: 'Loading...', animated: true, color: 'lightgray' }, backdrop: true, custom: { url: 'https://www.svgrepo.com/show/54385/target.svg', animation: 'pulse', color: 'skyblue' }})
    {
        return this.build({ type: 'spinner', props: prms })
    }

    async page(url, host = document.body, util = () => {})
    {
        host.innerHTML = await (await fetch(url)).text();
        util()
    }

    __id()
    {
        let id = '';
        let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 10; i++)
        {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        if (document.getElementById(id))
        {
            return this.__id();
        }

        return id;
    }

    destroy(id)
    {
        const el = document.getElementById(id)
        if (el) el.remove()
    }
}