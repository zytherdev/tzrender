import colors from '/src/utils/colors.js'

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
            const styles_uri = ['/src/styles/msg_box.css', '/src/styles/alert.css', '/src/styles/spinner.css', '/src/styles/block-ui.css']
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
                ntf.className = theme === 'light' ? 'tchzr-backdrop-light' : 'tchzr-backdrop';

                const ntf_content = document.createElement('div');
                ntf_content.className = theme === 'light' ? 'tchzr-b-msg-box-light' : 'tchzr-b-msg-box';

                const ntf_close_btn = document.createElement('button');
                ntf_close_btn.className = theme === 'light' ? 'tchzr-msgb-close-light tchzr-msgb-close' : 'tchzr-msgb-close';
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
                ntf_actions.className = 'tchzr-msgb-actions'

                const ntf_cancel_btn = document.createElement('button')
                ntf_cancel_btn.className = theme === 'light' ? 'tchzr-msgba-cancel-light tchzr-msgba-cancel' : 'tchzr-msgba-cancel'
                ntf_cancel_btn.innerHTML = prms.props.action.cancel.text
                ntf_cancel_btn.addEventListener('click', () => {
                    prms.props.action.cancel.callback()
                    this.destroy(ntf.id)
                })

                const ntf_confirm_btn = document.createElement('button')
                ntf_confirm_btn.className = theme === 'light' ? 'tchzr-msgba-confirm-light tchzr-msgba-confirm' : 'tchzr-msgba-confirm'
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
                const cls = (base) => useLight ? `tchzr-_-${base}-light tchzr-_-${base}` : `tchzr-_-${base}-dark tchzr-_-${base}`

                const alert = Object.assign(document.createElement('div'), {
                    id: id__,
                    className: `${cls('alert')} tchzr-a-${type}`,
                });

                const alert_msg = Object.assign(document.createElement('span'), {
                    className: 'tchzr-alert-msg',
                    innerHTML: prms.props.msg,
                });

                const close_btn = Object.assign(document.createElement('button'), {
                    className: cls('close'),
                    innerHTML: '&times;',
                    onclick: () => this.destroy(id__)
                });

                const progress = document.createElement('div');
                progress.className = 'tchzr-alert-progress';

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

                const { variant = 'simple', theme = 'dark', events = {}, text = {}, backdrop = true, custom = {} } = prms.props

                const useLight = theme === 'light';
                const cls = (base) => useLight ? `tchzr-${base}-light tchzr-${base}` : `tchzr-${base}-dark tchzr-${base}`;

                const container = document.createElement('div');
                container.id = id__;
                container.className = backdrop ? cls('spinner-backdrop') : cls('spinner-container');

                // events
                const toggle = (show = true) => {
                        const spinner = document.getElementById(container.id);
                        if (spinner) {
                            spinner.classList.toggle('__hiden__', !show);
                        }
                    }
                const destroy = () => {
                    this.destroy(container.id)
                }

                if(events)
                {
                    if(events.screen_click)
                    {
                        if (events.screen_click.hide) {
                            container.addEventListener('click', () => toggle(false))
                        }

                        if (events.screen_click.destroy) {
                            container.addEventListener('click', () => destroy())
                        }
                    }

                    if(events.auto__)
                    {
                        if (events.auto__.hide) {
                            setTimeout(() => toggle(false), events.auto__.timer || 3000)
                        }

                        if (events.auto__.destroy) {
                            setTimeout(() => destroy(), events.auto__.timer || 3000)
                        }
                    }
                }
                //________

                const spinnerWrapper = document.createElement('div');
                spinnerWrapper.className = `tchzr-spinner tchzr-spn-${variant}`;

                if (variant === 'custom' && custom.url) {
                    const img = document.createElement('img');
                    img.src = custom.url;
                    img.alt = 'spinner';
                    img.className = `tchzr-custom-spinner tchzr-spn-${custom.animation || ''}`;
                    spinnerWrapper.appendChild(img);
                } else {
                    if (variant === 'simple' || variant === 'dual' || variant === 'triple') {
                        if (custom.animation === 'spin') {
                            const loader = document.createElement('div');
                            loader.className = 'tchzr-spinner-loader';

                            const rings = variant === 'dual' ? 2 : variant === 'triple' ? 3 : 1;

                            for (let i = 0; i < rings; i++) {
                                const ring = document.createElement('div');
                                ring.className = 'tchzr-spinner-ring';
                                if(custom.color) ring.style.borderColor = `${custom.color} transparent`
                                loader.appendChild(ring);
                            }

                            spinnerWrapper.appendChild(loader);
                        } else {
                            const count = variant === 'dual' ? 2 : variant === 'triple' ? 3 : 1;
                            for (let i = 0; i < count; i++) {
                                const el = document.createElement('div');
                                el.className = `tchzr-spinner-circle tchzr-spnc-circle-${i + 1} tchzr-spn-${custom.animation || ''}`
                                if(custom.color) el.style.backgroundColor = custom.color
                                spinnerWrapper.appendChild(el);
                            }
                        }
                    }
                }

                container.appendChild(spinnerWrapper);

                if (text.content) {
                    const caption = document.createElement('div');
                    caption.className = 'tchzr-spinner-text';
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
                    toggle,
                    destroy
                }
            }
            case 'block_ui': 
            {
                const id__ = this.__id()

                const { theme = 'dark', animation = 'particles', message, count = 40, events = {}, custom = { __size: { min: 7, max: 100 } } } = prms.props;

                if(custom.__size.min <= 0 || custom.__size.max <= 0 || custom.__size.min >= custom.__size.max) custom.__size = { min: 7, max: 100 }

                const useLight = theme === 'light';

                const backdrop = document.createElement('div');
                backdrop.id = id__;
                backdrop.className = `block-ui-backdrop block-ui-backdrop-${useLight ? 'light' : 'dark'}`;

                const destroy = () => {
                    this.destroy(backdrop.id)
                }

                backdrop.addEventListener('click', () => {
                    if(events.screen_click && events.screen_click.destroy)
                    {
                        destroy()
                    }
                })

                if(events.auto__ && events.auto__.destroy)
                {
                    setTimeout(() => destroy(), events.auto__.timer || 3000)
                }

                const overlay = document.createElement('div');
                overlay.className = 'block-ui-overlay';
                backdrop.appendChild(overlay);

                const animLayer = document.createElement('div');
                animLayer.className = `block-ui-anim block-ui-${animation}`;
                backdrop.appendChild(animLayer);

                const elements = [];
                for(let i=0; i<count; i++) {
                    const el = document.createElement('span');
                    animLayer.appendChild(el);
                    elements.push(el);
                }

                if(message) {
                    const msg = document.createElement('div');
                    msg.className = 'block-ui-message';
                    msg.innerText = message;
                    backdrop.appendChild(msg);
                }

                document.body.appendChild(backdrop);

                // Estado dos elementos
                const state = [];

                // Armazena posição do cursor
                const cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

                // Distância para efeito repulsivo
                const repelRadius = 150;

                // Atualiza posição do cursor ao mover mouse
                window.addEventListener('mousemove', (e) => {
                    cursor.x = e.clientX;
                    cursor.y = e.clientY;
                });

                // Função lerp para suavização
                function lerp(start, end, t) {
                    return start + (end - start) * t;
                }

                // Checa distância entre dois pontos
                function dist(x1, y1, x2, y2) {
                    return Math.hypot(x2 - x1, y2 - y1);
                }

                // Inicialização dos elementos e estados por animação
                if(animation === 'particles') {
                    for(let i=0; i<count; i++) {
                        state[i] = {
                            x: Math.random() * window.innerWidth,
                            y: window.innerHeight + Math.random() * 200,
                            size: custom.__size.min + Math.random() * (custom.__size.max - custom.__size.min),
                            speed: 0.3 + Math.random() * 0.7,
                            opacity: 0,
                            vx: 0,
                            vy: - (0.3 + Math.random() * 0.7) // só sobe
                        }
                        
                        const el = elements[i];
                        el.style.width = el.style.height = state[i].size + 'px';
                        el.style.borderRadius = '50%';
                        el.style.backgroundColor = useLight ? colors.light[Math.floor(Math.random() * colors.light.length)] : colors.dark[Math.floor(Math.random() * colors.dark.length)];
                        el.style.position = 'fixed';
                        el.style.pointerEvents = 'none';
                        el.style.willChange = 'transform, opacity';
                    }
                } else if(animation === 'lines') {
                    for(let i=0; i<count; i++) {
                    const angle = Math.random() * 2 * Math.PI
                    const speed = 1.5 + Math.random() * 0.7
                    const length = custom.__size.min + Math.random() * (custom.__size.max - custom.__size.min)
                    state[i] = {
                        x: Math.random() * window.innerWidth,
                        y: Math.random() * window.innerHeight,
                        length,
                        speed,
                        angle,
                        opacity: 0,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed
                    };
                    const el = elements[i];
                    el.style.width = '5px';
                    el.style.height = length + 'px';
                    el.style.backgroundColor = useLight ? colors.light[Math.floor(Math.random() * colors.light.length)] : colors.dark[Math.floor(Math.random() * colors.dark.length)];
                    el.style.position = 'fixed';
                    el.style.pointerEvents = 'none';
                    el.style.willChange = 'transform, opacity';
                    el.style.transformOrigin = 'top center';
                    }
                } else if(animation === 'shapes') {
                    const shapes = ['circle', 'square', 'triangle']
                    const colorsLight = colors.light
                    const colorsDark = colors.dark

                    for(let i=0; i<count; i++) {
                        const shapeType = shapes[Math.floor(Math.random() * shapes.length)];
                        const color = useLight ? colorsLight[Math.floor(Math.random() * colorsLight.length)] : colorsDark[Math.floor(Math.random() * colorsDark.length)];
                        const size = custom.__size.min + Math.random() * (custom.__size.max - custom.__size.min)
                        
                        state[i] = {
                            x: Math.random() * window.innerWidth,
                            y: window.innerHeight + Math.random() * 200,
                            size,
                            speed: 0.2 + Math.random() * 0.5,
                            rotation: 0,
                            rotationSpeed: (Math.random() - 0.5) * 1.5,
                            opacity: 0,
                            shapeType,
                            color
                        }

                        const el = elements[i];
                        el.style.position = 'fixed';
                        el.style.width = size + 'px';
                        el.style.height = size + 'px';
                        el.style.pointerEvents = 'none';
                        el.style.willChange = 'transform, opacity';

                        // Desenhar shape diferente via CSS classes e styles
                        el.style.background = 'transparent';
                        el.style.border = 'none';

                        if(shapeType === 'circle') {
                            el.style.borderRadius = '50%';
                            el.style.backgroundColor = color;
                        } else if(shapeType === 'square') {
                            el.style.borderRadius = '0';
                            el.style.backgroundColor = color;
                        } else if(shapeType === 'triangle') {
                            el.style.width = '0';
                            el.style.height = '0';
                            el.style.borderLeft = (size/2) + 'px solid transparent';
                            el.style.borderRight = (size/2) + 'px solid transparent';
                            el.style.borderBottom = size + 'px solid ' + color;
                            el.style.backgroundColor = 'transparent';
                        }
                    }
                } else if(animation === 'orbs') {
                    for(let i=0; i<count; i++) {
                        state[i] = {
                            x: window.innerWidth/2,
                            y: window.innerHeight/2,
                            targetX: window.innerWidth/2,
                            targetY: window.innerHeight/2,
                            size: custom.__size.min + Math.random() * (custom.__size.max - custom.__size.min),
                        }

                        const el = elements[i];
                        el.style.width = el.style.height = state[i].size + 'px';
                        el.style.borderRadius = '50%';
                        el.style.backgroundColor = useLight ? colors.light[Math.floor(Math.random() * colors.light.length)] : colors.dark[Math.floor(Math.random() * colors.dark.length)];
                        el.style.position = 'fixed';
                        el.style.pointerEvents = 'none';
                        el.style.transition = 'transform 0.15s ease-out';
                        el.style.willChange = 'transform';
                    }
                    // Armazena posição do cursor
                    window.addEventListener('mousemove', e => {
                    state[0].targetX = e.clientX;
                    state[0].targetY = e.clientY;
                    });
                }

                // Função de repelência suave
                function applyRepel(obj) {
                    const dx = obj.x - cursor.x;
                    const dy = obj.y - cursor.y;
                    const distance = Math.sqrt(dx*dx + dy*dy);
                    if(distance < repelRadius) {
                    // Repel force: afastar com força proporcional ao inverso da distância
                    const force = (repelRadius - distance) / repelRadius * 5;
                    const angle = Math.atan2(dy, dx);
                    obj.vx += Math.cos(angle) * force;
                    obj.vy += Math.sin(angle) * force;
                    }
                }

                // Loop de animação
                function animate() {
                    if(animation === 'particles') {
                        state.forEach((obj, i) => {
                            applyRepel(obj);

                            // Atualiza posição com velocidade
                            obj.x += obj.vx;
                            obj.y += obj.vy;

                            // Aplica fricção para desacelerar repel
                            obj.vx *= 0.995;
                            obj.vy *= 0.995;

                            if(obj.y < -20) obj.y = window.innerHeight + 20;
                            if(obj.x < -20) obj.x = window.innerWidth + 20;
                            if(obj.x > window.innerWidth + 20) obj.x = -20;
                            if(obj.y > window.innerHeight + 20) obj.y = -20;

                            obj.opacity = obj.y > window.innerHeight * 0.5
                            ? lerp(0,1,(window.innerHeight + 20 - obj.y) / (window.innerHeight * 0.5))
                            : lerp(1,0,obj.y / (window.innerHeight * 0.5));

                            elements[i].style.transform = `translate(${obj.x}px, ${obj.y}px) scale(${0.5 + (1-obj.opacity)*0.5})`;
                            elements[i].style.opacity = obj.opacity;
                        });
                    } else if(animation === 'lines') {
                        state.forEach((obj, i) => {
                            applyRepel(obj);

                            obj.x += obj.vx;
                            obj.y += obj.vy;

                            obj.vx *= 0.999;
                            obj.vy *= 0.999;

                            // Loop pela tela nas bordas
                            if(obj.y < -obj.length) obj.y = window.innerHeight + obj.length;
                            if(obj.x < -10) obj.x = window.innerWidth + 10;
                            if(obj.x > window.innerWidth + 10) obj.x = -10;

                            obj.opacity = obj.y > window.innerHeight * 0.5
                            ? lerp(0,1,(window.innerHeight + obj.length - obj.y) / (window.innerHeight * 0.5))
                            : lerp(1,0,obj.y / (window.innerHeight * 0.5));

                            elements[i].style.transform = `translate(${obj.x}px, ${obj.y}px) rotate(${obj.angle * 180 / Math.PI}deg)`;
                            elements[i].style.opacity = obj.opacity;
                        });
                    } else if(animation === 'shapes') {
                        state.forEach((obj, i) => {
                            applyRepel(obj);

                            obj.x += obj.vx || 0;
                            obj.y -= obj.speed; // constante para cima
                            obj.rotation += obj.rotationSpeed;

                            if(obj.y < -obj.size*2) obj.y = window.innerHeight + obj.size*2;

                            obj.opacity = obj.y > window.innerHeight * 0.5
                            ? lerp(0,1,(window.innerHeight + obj.size*2 - obj.y) / (window.innerHeight * 0.5))
                            : lerp(1,0,obj.y / (window.innerHeight * 0.5));

                            elements[i].style.transform = `translate(${obj.x}px, ${obj.y}px) rotate(${obj.rotation}deg) scale(${0.6 + 0.6 * obj.opacity})`;
                            elements[i].style.opacity = obj.opacity;
                        });
                    } else if(animation === 'orbs') {
                        // Orb 0 segue cursor com lerp suave
                        state[0].x = lerp(state[0].x, state[0].targetX, 0.2);
                        state[0].y = lerp(state[0].y, state[0].targetY, 0.2);
                        elements[0].style.transform = `translate(${state[0].x}px, ${state[0].y}px)`;

                        // Outras orbs seguem a anterior com delay e suavização
                        for(let i=1; i<count; i++) {
                            state[i].x = lerp(state[i].x, state[i-1].x, 0.15);
                            state[i].y = lerp(state[i].y, state[i-1].y, 0.15);
                            elements[i].style.transform = `translate(${state[i].x}px, ${state[i].y}px)`;
                        }
                    }

                    requestAnimationFrame(animate);
                }
                requestAnimationFrame(animate);

                return {
                    __id: backdrop.id,
                    destroy
                }
            }
        }
    }

    block_ui(prms = {theme: 'dark', animation: 'shapes', count: 120, message: '', events: { screen_click: { hide: false, destroy: false }, auto__: { timer: 3000, hide: false, destroy: false } }, custom: { __size: { min: 7, max: 100 } }})
    {
        return this.build({ type: 'block_ui', props: prms })
    }

    msg_box(prms = {theme: 'dark', title: 'Message', msg: 'Something...', action: { cancel: { text: 'Cancel', callback: ()=>{} }, confirm: { text: 'Confirm', callback: ()=>{}} } })
    {
        return this.build({ type: 'msg_box', props: prms })
    }

    alert(prms = {theme: 'dark', variant: 'info', msg: 'Something...', timeout: 3000})
    {
        return this.build({ type: 'alert', props: prms })
    }

    spinner(prms = {variant: 'custom', theme: 'dark', events: { screen_click: { hide: false, destroy: false }, auto__: { timer: 3000, hide: false, destroy: false } }, text: { content: 'Loading...', animated: true, color: 'lightgray' }, backdrop: true, custom: { url: 'https://www.svgrepo.com/show/54385/target.svg', animation: 'pulse', color: 'skyblue' }})
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