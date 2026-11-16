import colors from './utils/colors.js';
import { createAccordion, createDrawer, createMenu, createProgress, createSkeleton, createTabs, createToast, createTooltip } from './components.js';
import { createCheckboxGroup, createCombobox, createRadioGroup, createRating, createSegmentedControl, createSwitch } from './components/forms.js';
import { createAvatar, createBadge, createCopyButton } from './components/display.js';
import { createBreadcrumb, createPagination, createPopover } from './components/navigation.js';

const SAFE_PAGE_ELEMENTS = new Set(['a','abbr','article','aside','b','blockquote','br','caption','code','dd','del','details','div','dl','dt','em','figcaption','figure','h1','h2','h3','h4','h5','h6','hr','i','img','kbd','li','main','mark','ol','p','pre','q','s','section','small','span','strong','sub','summary','sup','table','tbody','td','th','thead','tr','u','ul']);
const SAFE_PAGE_ATTRIBUTES = new Set(['alt','aria-label','aria-hidden','class','colspan','dir','height','href','id','lang','role','rowspan','src','target','title','width']);

function sanitizePageMarkup(markup) {
    const parsed = new DOMParser().parseFromString(String(markup), 'text/html');
    parsed.querySelectorAll('script,style,iframe,object,embed,base,form,link,meta,svg,math,template').forEach((element) => element.remove());
    [...parsed.body.querySelectorAll('*')].reverse().forEach((element) => {
        if (!SAFE_PAGE_ELEMENTS.has(element.tagName.toLowerCase())) {
            element.replaceWith(...element.childNodes);
            return;
        }
        [...element.attributes].forEach((attribute) => {
            const name = attribute.name.toLowerCase();
            const value = attribute.value.trim();
            if (!SAFE_PAGE_ATTRIBUTES.has(name) || name.startsWith('on')) {
                element.removeAttribute(attribute.name);
                return;
            }
            if (name === 'href' || name === 'src') {
                const compact = value.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
                if (/^(javascript|vbscript|data):/.test(compact)) element.removeAttribute(attribute.name);
                else if (name === 'src') {
                    try { if (new URL(value, document.baseURI).origin !== location.origin) element.removeAttribute(attribute.name); }
                    catch { element.removeAttribute(attribute.name); }
                }
            }
        });
        if (element.tagName === 'A' && element.getAttribute('target') === '_blank') element.setAttribute('rel', 'noopener noreferrer');
    });
    return document.importNode(parsed.body, true);
}

export default class Render
{
    static style_loaded = false
    static style__ = null
    static style_promise = null
    static instance_count = 0

    constructor()
    {
        this.cleanups = new Map()
        this.ids = new Set()
        Render.instance_count++

        if (!Render.style_promise) {
            const stylePromise = this.inject_style()
            Render.style_promise = stylePromise
            stylePromise.catch((error) => {
                if (Render.style_promise === stylePromise) Render.style_promise = null
                console.error('tzrender: could not load component styles.', error)
            })
        }
        this.ready = Render.style_promise
    }

    async inject_style()
    {
        if (Render.style_loaded || document.getElementById('tzrender-styles')) return
        const styleFiles = [
            ['__reset.css', new URL('./styles/__reset.css', import.meta.url)],
            ['msg_box.css', new URL('./styles/msg_box.css', import.meta.url)],
            ['alert.css', new URL('./styles/alert.css', import.meta.url)],
            ['spinner.css', new URL('./styles/spinner.css', import.meta.url)],
            ['block-ui.css', new URL('./styles/block-ui.css', import.meta.url)],
            ['components.css', new URL('./styles/components.css', import.meta.url)],
            ['new-components.css', new URL('./styles/new-components.css', import.meta.url)]
        ]
        const css = await Promise.all(styleFiles.map(async ([file, url]) => {
            const fetchUrl = new URL(url)
            if (import.meta.env?.DEV) fetchUrl.searchParams.set('direct', '')
            const response = await fetch(fetchUrl)
            if (!response.ok) throw new Error(`Could not load ${file} (${response.status})`)
            return response.text()
        }))
        const style = document.createElement('style')
        style.id = 'tzrender-styles'
        style.textContent = `/* tzrender component styles */\n${css.join('\n')}`
        document.head.appendChild(style)
        Render.style_loaded = true
        Render.style__ = style.id
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
                ntf_content.setAttribute('role', 'dialog');
                ntf_content.setAttribute('aria-modal', 'true');

                const ntf_close_btn = document.createElement('button');
                ntf_close_btn.className = theme === 'light' ? 'tchzr-msgb-close-light tchzr-msgb-close' : 'tchzr-msgb-close';
                ntf_close_btn.type = 'button';
                ntf_close_btn.setAttribute('aria-label', prms.props.closeLabel || 'Close dialog');
                ntf_close_btn.textContent = '×';

                const ntf_title = document.createElement('h2')
                ntf_title.id = `${id__}-title`;
                ntf_title.textContent = String(prms.props.title ?? 'Message');

                const ntf_msg = document.createElement('p')
                ntf_msg.id = `${id__}-message`;
                ntf_msg.textContent = String(prms.props.msg ?? '');
                ntf_content.setAttribute('aria-labelledby', ntf_title.id);
                ntf_content.setAttribute('aria-describedby', ntf_msg.id);

                const ntf_actions = document.createElement('div')
                ntf_actions.className = 'tchzr-msgb-actions'

                const ntf_cancel_btn = document.createElement('button')
                ntf_cancel_btn.className = theme === 'light' ? 'tchzr-msgba-cancel-light tchzr-msgba-cancel' : 'tchzr-msgba-cancel'
                ntf_cancel_btn.type = 'button';
                ntf_cancel_btn.textContent = String(prms.props.action?.cancel?.text ?? 'Cancel');

                const ntf_confirm_btn = document.createElement('button')
                ntf_confirm_btn.className = theme === 'light' ? 'tchzr-msgba-confirm-light tchzr-msgba-confirm' : 'tchzr-msgba-confirm'
                ntf_confirm_btn.type = 'button';
                ntf_confirm_btn.textContent = String(prms.props.action?.confirm?.text ?? 'Confirm');
                let settled = false;
                const runAction = (action) => {
                    if (settled) return;
                    settled = true;
                    try { if (typeof action?.callback === 'function') action.callback(); }
                    finally { this.destroy(ntf.id); }
                };
                const cancel = () => runAction(prms.props.action?.cancel);
                const confirm = () => runAction(prms.props.action?.confirm);
                ntf_close_btn.addEventListener('click', cancel);
                ntf_cancel_btn.addEventListener('click', cancel);
                ntf_confirm_btn.addEventListener('click', confirm);
                const previousFocus = document.activeElement;
                const inerted = [...document.body.children].map((element) => [element, Boolean(element.inert)]);
                const restoreInert = () => inerted.forEach(([element, wasInert]) => { if (element.isConnected) element.inert = wasInert; });
                const focusables = () => [...ntf_content.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
                const onKeyDown = (event) => {
                    if (event.key === 'Escape' && prms.props.closeOnEscape !== false) {
                        event.preventDefault();
                        cancel();
                    } else if (event.key === 'Tab') {
                        const focusable = focusables();
                        if (!focusable.length) {
                            event.preventDefault();
                            ntf_content.focus();
                        } else if (event.shiftKey && (document.activeElement === focusable[0] || !ntf_content.contains(document.activeElement))) {
                            event.preventDefault();
                            focusable.at(-1).focus();
                        } else if (!event.shiftKey && (document.activeElement === focusable.at(-1) || !ntf_content.contains(document.activeElement))) {
                            event.preventDefault();
                            focusable[0].focus();
                        }
                    }
                };
                const onFocusIn = (event) => {
                    if (!ntf_content.contains(event.target)) (focusables()[0] || ntf_content).focus();
                };
                const onBackdrop = (event) => {
                    if (event.target === ntf && prms.props.closeOnBackdrop === true) cancel();
                };
                ntf_content.addEventListener('keydown', onKeyDown);
                document.addEventListener('focusin', onFocusIn);
                ntf.addEventListener('click', onBackdrop);

                ntf_actions.appendChild(ntf_cancel_btn)
                ntf_actions.appendChild(ntf_confirm_btn)

                ntf_content.appendChild(ntf_close_btn)
                ntf_content.appendChild(ntf_title)
                ntf_content.appendChild(ntf_msg)
                ntf_content.appendChild(ntf_actions)

                ntf.appendChild(ntf_content)

                inerted.forEach(([element]) => { element.inert = true; });
                document.body.appendChild(ntf)
                this.__registerCleanup(id__, () => {
                    ntf_content.removeEventListener('keydown', onKeyDown);
                    document.removeEventListener('focusin', onFocusIn);
                    ntf.removeEventListener('click', onBackdrop);
                    restoreInert();
                    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
                });
                ntf_confirm_btn.focus();

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
                alert.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
                alert.setAttribute('aria-live', type === 'error' || type === 'warning' ? 'assertive' : 'polite');

                const alert_msg = Object.assign(document.createElement('span'), {
                    className: 'tchzr-alert-msg',
                    textContent: String(prms.props.msg ?? ''),
                });

                const close_btn = Object.assign(document.createElement('button'), {
                    className: cls('close'),
                    type: 'button',
                    textContent: '×',
                    onclick: () => this.destroy(id__)
                });
                close_btn.setAttribute('aria-label', prms.props.closeLabel || 'Dismiss notification');

                const progress = document.createElement('div');
                progress.className = 'tchzr-alert-progress';

                alert.append(alert_msg, close_btn, progress);
                document.body.appendChild(alert);

                const timeout = Number(prms.props.timeout);
                if (Number.isFinite(timeout) && timeout > 0) {
                    progress.style.animationDuration = `${timeout}ms`;
                    progress.style.animationDirection = 'reverse';
                    const timer = window.setTimeout(() => this.destroy(id__), timeout);
                    this.__registerCleanup(id__, () => window.clearTimeout(timer));
                }

                return alert.id
            }
            case 'spinner':
            {
                const id__ = this.__id();

                const rawProps = prms.props || {};
                const variant = ['simple', 'dual', 'triple', 'custom'].includes(rawProps.variant) ? rawProps.variant : 'simple';
                const { theme = 'dark', events = {}, text = {}, backdrop = true, custom = {} } = rawProps;

                const useLight = theme === 'light';
                const cls = (base) => useLight ? `tchzr-${base}-light tchzr-${base}` : `tchzr-${base}-dark tchzr-${base}`;

                const container = document.createElement('div');
                container.id = id__;
                container.className = backdrop ? cls('spinner-backdrop') : cls('spinner-container');
                container.setAttribute('role', 'status');
                container.setAttribute('aria-live', 'polite');
                const timers = new Set();
                let textInterval = null;

                const toggle = (show = true) => {
                    container.hidden = !show;
                }
                const destroy = () => {
                    this.destroy(container.id)
                }
                const onScreenClick = () => {
                    if (events.screen_click?.destroy) destroy();
                    else if (events.screen_click?.hide) toggle(false);
                };

                if (events.screen_click?.hide || events.screen_click?.destroy) container.addEventListener('click', onScreenClick);
                if (events.auto__?.hide) timers.add(window.setTimeout(() => toggle(false), Number(events.auto__.timer) || 3000));
                if (events.auto__?.destroy) timers.add(window.setTimeout(() => destroy(), Number(events.auto__.timer) || 3000));

                const spinnerWrapper = document.createElement('div');
                spinnerWrapper.className = `tchzr-spinner tchzr-spn-${variant}`;
                spinnerWrapper.setAttribute('aria-hidden', 'true');

                if (variant === 'custom' && custom.url) {
                    const img = document.createElement('img');
                    img.src = custom.url;
                    img.alt = '';
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

                        textInterval = window.setInterval(()=>{
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
                this.__registerCleanup(id__, () => {
                    timers.forEach((timer) => window.clearTimeout(timer));
                    if (textInterval !== null) window.clearInterval(textInterval);
                    container.removeEventListener('click', onScreenClick);
                });

                return {
                    __id: container.id,
                    toggle,
                    destroy
                }
            }
            case 'block_ui': 
            {
                const id__ = this.__id()

                const { theme = 'dark', animation = 'particles', message, events = {}, custom: customOptions = {} } = prms.props || {};
                const requestedCount = Number(prms.props?.count ?? 120);
                const count = Math.max(1, Math.min(250, Math.floor(Number.isFinite(requestedCount) ? requestedCount : 120)));
                const requestedSize = customOptions?.__size || {};
                const custom = {
                    ...customOptions,
                    __size: Number(requestedSize.min) > 0 && Number(requestedSize.max) > Number(requestedSize.min)
                        ? { min: Number(requestedSize.min), max: Number(requestedSize.max) }
                        : { min: 7, max: 100 }
                };

                const useLight = theme === 'light';

                const backdrop = document.createElement('div');
                backdrop.id = id__;
                backdrop.className = `block-ui-backdrop block-ui-backdrop-${useLight ? 'light' : 'dark'}`;
                backdrop.setAttribute('role', 'status');
                backdrop.setAttribute('aria-live', 'polite');
                backdrop.setAttribute('aria-label', String(message || 'Content is loading'));
                let destroyed = false;
                let animationFrameId = null;
                let autoDestroyTimer = null;
                const eventCleanups = [];

                const destroy = () => {
                    this.destroy(backdrop.id)
                }
                this.__registerCleanup(id__, () => {
                    destroyed = true;
                    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
                    if (autoDestroyTimer !== null) window.clearTimeout(autoDestroyTimer);
                    eventCleanups.forEach((cleanup) => cleanup());
                });

                backdrop.addEventListener('click', () => {
                    if(events.screen_click && events.screen_click.destroy)
                    {
                        destroy()
                    }
                })

                if(events.auto__ && events.auto__.destroy)
                {
                    autoDestroyTimer = window.setTimeout(() => destroy(), events.auto__.timer || 3000)
                }

                const overlay = document.createElement('div');
                overlay.className = 'block-ui-overlay';
                backdrop.appendChild(overlay);

                const animLayer = document.createElement('div');
                animLayer.className = `block-ui-anim block-ui-${animation}`;
                animLayer.setAttribute('aria-hidden', 'true');
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
                const cursorMove = (e) => {
                    cursor.x = e.clientX;
                    cursor.y = e.clientY;
                };
                window.addEventListener('mousemove', cursorMove);
                eventCleanups.push(() => window.removeEventListener('mousemove', cursorMove));

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
                    el.style.width = '3px';
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
                    const orbMove = (e) => {
                        if (!state[0]) return;
                        state[0].targetX = e.clientX;
                        state[0].targetY = e.clientY;
                    };
                    window.addEventListener('mousemove', orbMove);
                    eventCleanups.push(() => window.removeEventListener('mousemove', orbMove));
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
                    if (destroyed || !backdrop.isConnected) return;
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

                    animationFrameId = requestAnimationFrame(animate);
                }
                animationFrameId = requestAnimationFrame(animate);

                return {
                    __id: backdrop.id,
                    destroy
                }
            }
        }
    }

    block_ui(prms = {})
    {
        const input = prms && typeof prms === 'object' ? prms : {};
        const defaults = { theme: 'dark', animation: 'shapes', count: 120, message: '', events: {}, custom: {} };
        const events = input.events || {};
        return this.build({ type: 'block_ui', props: {
            ...defaults,
            ...input,
            animation: ['particles', 'lines', 'shapes', 'orbs'].includes(input.animation) ? input.animation : (input.animation ? 'shapes' : defaults.animation),
            events: {
                ...events,
                screen_click: { hide: false, destroy: false, ...(events.screen_click || {}) },
                auto__: { timer: 3000, hide: false, destroy: false, ...(events.auto__ || {}) }
            },
            custom: { ...(input.custom || {}), __size: { min: 7, max: 100, ...(input.custom?.__size || {}) } }
        } })
    }

    msg_box(prms = {})
    {
        const input = prms && typeof prms === 'object' ? prms : {};
        const action = input.action || {};
        return this.build({ type: 'msg_box', props: {
            theme: 'dark', title: 'Message', msg: '', closeLabel: 'Close dialog', closeOnEscape: true, closeOnBackdrop: false, ...input,
            action: {
                cancel: { text: 'Cancel', ...(action.cancel || {}) },
                confirm: { text: 'Confirm', ...(action.confirm || {}) }
            }
        } })
    }

    alert(prms = {})
    {
        const input = prms && typeof prms === 'object' ? prms : {};
        return this.build({ type: 'alert', props: { theme: 'dark', variant: 'info', msg: '', timeout: 3000, ...input } })
    }

    spinner(prms = {})
    {
        const input = prms && typeof prms === 'object' ? prms : {};
        const events = input.events || {};
        return this.build({ type: 'spinner', props: {
            variant: 'simple', theme: 'dark', backdrop: true, ...input,
            events: {
                ...events,
                screen_click: { hide: false, destroy: false, ...(events.screen_click || {}) },
                auto__: { timer: 3000, hide: false, destroy: false, ...(events.auto__ || {}) }
            },
            text: { content: 'Loading...', animated: true, color: 'lightgray', ...(input.text || {}) },
            custom: { animation: 'spin', color: 'skyblue', ...(input.custom || {}) }
        } })
    }

    toast(options = {})
    {
        return createToast(this, options)
    }

    tooltip(target, options = {})
    {
        return createTooltip(this, target, options)
    }

    accordion(options = {})
    {
        return createAccordion(this, options)
    }

    tabs(options = {})
    {
        return createTabs(this, options)
    }

    progress(options = {})
    {
        return createProgress(this, options)
    }

    skeleton(options = {})
    {
        return createSkeleton(this, options)
    }

    drawer(options = {})
    {
        return createDrawer(this, options)
    }

    menu(target, options = {})
    {
        return createMenu(this, target, options)
    }

    switch(options = {})
    {
        return createSwitch(this, options)
    }

    checkboxGroup(options = {})
    {
        return createCheckboxGroup(this, options)
    }

    radioGroup(options = {})
    {
        return createRadioGroup(this, options)
    }

    segmentedControl(options = {})
    {
        return createSegmentedControl(this, options)
    }

    combobox(options = {})
    {
        return createCombobox(this, options)
    }

    popover(target, options = {})
    {
        return createPopover(this, target, options)
    }

    pagination(options = {})
    {
        return createPagination(this, options)
    }

    breadcrumb(options = {})
    {
        return createBreadcrumb(this, options)
    }

    rating(options = {})
    {
        return createRating(this, options)
    }

    copyButton(options = {})
    {
        return createCopyButton(this, options)
    }

    avatar(options = {})
    {
        return createAvatar(this, options)
    }

    badge(options = {})
    {
        return createBadge(this, options)
    }

    messageBox(options = {})
    {
        return this.msg_box(options)
    }

    blockUI(options = {})
    {
        return this.block_ui(options)
    }

    loadPage(...args)
    {
        return this.page(...args)
    }

    confirm(options = {})
    {
        const input = options && typeof options === 'object' ? options : {};
        const actions = input.action || {};
        return new Promise((resolve) => {
            let resolved = false;
            const finish = (value) => {
                if (resolved) return;
                resolved = true;
                resolve(value);
            };
            const id = this.msg_box({
                ...input,
                action: {
                    cancel: {
                        text: input.cancelText ?? actions.cancel?.text ?? 'Cancel',
                        callback: () => { try { actions.cancel?.callback?.(); } finally { finish(false); } }
                    },
                    confirm: {
                        text: input.confirmText ?? actions.confirm?.text ?? 'Confirm',
                        callback: () => { try { actions.confirm?.callback?.(); } finally { finish(true); } }
                    }
                }
            });
            this.__registerCleanup(id, () => finish(false));
        });
    }

    async page(url, host = document.body, util = () => {}, options = {})
    {
        if (typeof util !== 'function') {
            options = util && typeof util === 'object' ? util : {};
            util = () => {};
        }
        const target = typeof host === 'string' ? document.querySelector(host) : host;
        if (!(target instanceof Element)) throw new TypeError('tzrender.page: host must be a CSS selector or an Element.');
        const response = await fetch(url, { signal: options?.signal });
        if (!response.ok) throw new Error(`tzrender.page: request failed (${response.status} ${response.statusText || ''})`.trim());
        const markup = await response.text();
        if (options?.trustedHtml === true) {
            target.innerHTML = markup;
        } else {
            const safeBody = sanitizePageMarkup(markup);
            target.replaceChildren(...safeBody.childNodes);
        }
        if (typeof util === 'function') util(target);
        return target;
    }

    __id()
    {
        const token = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        let id = `tzr-${token.replace(/[^a-zA-Z0-9_-]/g, '')}`;
        while (this.ids.has(id) || document.getElementById(id)) id = `tzr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        this.ids.add(id);
        return id;
    }

    __registerCleanup(id, callback)
    {
        if (!this.cleanups.has(id)) this.cleanups.set(id, new Set())
        this.cleanups.get(id).add(callback)
    }

    destroy(id)
    {
        id = typeof id === 'string' ? id : id?.__id;
        if (!id) return;
        const callbacks = this.cleanups.get(id)
        if (callbacks) {
            this.cleanups.delete(id)
            callbacks.forEach((callback) => {
                try { callback() }
                catch (error) { console.error('tzrender: component cleanup failed.', error) }
            })
        }
        const el = document.getElementById(id)
        if (el) el.remove()
        this.ids.delete(id)
    }

    destroyAll()
    {
        [...this.ids].forEach((id) => this.destroy(id))
    }
}
