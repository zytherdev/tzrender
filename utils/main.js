import Render from "https://cdn.skypack.dev/techz-render"
import { translations } from "/utils/translations.js";
        
const render = new Render();

// temas
const themeToggleBtn = document.getElementById('themeToggle');
const iconToggle = document.getElementById('iconToggle');

themeToggleBtn.addEventListener('click', () => {
const current = document.documentElement.getAttribute('data-theme');
const newTheme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    iconToggle.innerHTML = newTheme === 'dark'
        ? '<path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z"></path>'
        : '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
});

// supporte multi-idiomas
i18next.init({
    lng: localStorage.getItem("lang") || "pt",
    debug: false,
    resources: translations
}, function(err, t) {
    updateTexts();
});

function updateTexts() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n")
        const translated = i18next.t(key)
        if (translated) el.innerHTML = translated
    });
}

document.getElementById("langSelect").addEventListener("change", (e) => {
    const lang = e.target.value
    i18next.changeLanguage(lang, updateTexts)
    localStorage.setItem("lang", lang)
});

document.getElementById("langSelect").value = i18next.language


// tabs
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabContainer = tab.closest('.tab-container');
        const tabId = tab.getAttribute('data-tab');
        
        tabContainer.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        tabContainer.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabId).classList.add('active');
    });
});

// Message Box
document.getElementById('showMsgBox').addEventListener('click', () => {
    const params = {
        theme: document.getElementById('msgBoxTheme').value,
        title: document.getElementById('msgBoxTitle').value,
        msg: document.getElementById('msgBoxMessage').value,
        action: {
            cancel: {
                text: document.getElementById('msgBoxCancelText').value,
                callback: () => console.log('Message box cancelled')
            },
            confirm: {
                text: document.getElementById('msgBoxConfirmText').value,
                callback: () => console.log('Message box confirmed')
            }
        }
    };
    
    render.msg_box(params)
    document.getElementById('msgBoxCode').textContent = 
    `const render = new Render();
    render.msg_box(${JSON.stringify(params, null, 2)});`
});

// Alert
document.getElementById('showAlert').addEventListener('click', () => {
    const params = {
        theme: document.getElementById('alertTheme').value,
        variant: document.getElementById('alertVariant').value,
        msg: document.getElementById('alertMessage').value,
        timeout: parseInt(document.getElementById('alertTimeout').value) || 0
    };
    
    render.alert(params);
    
    document.getElementById('alertCode').textContent = 
    `const render = new Render();
    render.alert(${JSON.stringify(params, null, 2)});`;
});

// Spinner
let currentSpinner = null;

document.getElementById('showSpinner').addEventListener('click', () => {
    const params = {
        variant: document.getElementById('spinnerVariant').value,
        theme: document.getElementById('spinnerTheme').value,
        text: {
            content: document.getElementById('spinnerText').value,
            animated: document.getElementById('spinnerAnimated').value === 'true',
            color: document.getElementById('spinnerColor').value
        },
        backdrop: document.getElementById('spinnerBackdrop').value === 'true',
        custom: {
            url: document.getElementById('spinnerCustomUrl').value,
            animation: document.getElementById('spinnerAnimation').value,
            color: document.getElementById('spinnerColor').value
        }
    };
    
    currentSpinner = render.spinner(params);
    
    document.getElementById('showSpinner').classList.add('hidden');
    document.getElementById('hideSpinner').classList.remove('hidden');
    document.getElementById('destroySpinner').classList.remove('hidden');
    
    document.getElementById('spinnerCode').textContent = 
    `const render = new Render();
    const spinner = render.spinner(${JSON.stringify(params, null, 2)});

    // To hide:
    // spinner.toggle(false);

    // To destroy:
    // spinner.destroy();`;
});

document.getElementById('hideSpinner').addEventListener('click', () => {
    if (currentSpinner) {
        currentSpinner.toggle(false);
        document.getElementById('hideSpinner').classList.add('hidden');
        document.getElementById('showSpinner').classList.remove('hidden');
    }
});

document.getElementById('destroySpinner').addEventListener('click', () => {
    if (currentSpinner) {
        currentSpinner.destroy();
        currentSpinner = null;
        document.getElementById('hideSpinner').classList.add('hidden');
        document.getElementById('destroySpinner').classList.add('hidden');
        document.getElementById('showSpinner').classList.remove('hidden');
    }
});

// Block UI
document.getElementById('showBlockUI').addEventListener('click', () => {
    const autoDestroy = parseInt(document.getElementById('blockAutoDestroy').value) || 0;
    
    const params = {
        theme: document.getElementById('blockTheme').value,
        animation: document.getElementById('blockAnimation').value,
        message: document.getElementById('blockMessage').value,
        count: parseInt(document.getElementById('blockCount').value) || 120,
        events: {
            screen_click: {
                destroy: document.getElementById('blockClickDestroy').value === 'true'
            },
            auto__: {
                destroy: autoDestroy > 0,
                timer: autoDestroy
            }
        },
        custom: {
            __size: {
                min: parseInt(document.getElementById('blockMinSize').value) || 7,
                max: parseInt(document.getElementById('blockMaxSize').value) || 100
            }
        }
    };
    
    const block = render.block_ui(params);
    
    document.getElementById('blockCode').textContent = 
    `const render = new Render();
    const block = render.block_ui(${JSON.stringify(params, null, 2)});

    // To destroy:
    // block.destroy();`;
});