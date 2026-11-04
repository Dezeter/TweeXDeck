function createModal(html, className, onclose, canclose) {
    let modal = document.createElement('div');
    modal.classList.add('otd-modal');
    let modal_content = document.createElement('div');
    modal_content.classList.add('otd-modal-content');
    if(className) modal_content.classList.add(className);
    modal_content.innerHTML = html;
    modal.appendChild(modal_content);
    let close = document.createElement('span');
    close.classList.add('otd-modal-close');
    close.title = "ESC";
    close.innerHTML = '&times;';
    document.body.style.overflowY = 'hidden';
    function removeModal() {
        modal.remove();
        let event = new Event('findActiveTweet');
        document.dispatchEvent(event);
        document.removeEventListener('keydown', escapeEvent);
        if(onclose) onclose();
        let modals = document.getElementsByClassName('modal');
        if(modals.length === 0) {
            document.body.style.overflowY = 'auto';
        }
    }
    modal.removeModal = removeModal;
    function escapeEvent(e) {
        if(e.key === 'Escape' || (e.altKey && e.keyCode === 78)) {
            if(!canclose || canclose()) removeModal();
        }
    }
    close.addEventListener('click', removeModal);
    modal.addEventListener('click', e => {
        if(e.target === modal) {
            if(!canclose || canclose()) removeModal();
        }
    });
    document.addEventListener('keydown', escapeEvent);
    modal_content.appendChild(close);
    document.body.appendChild(modal);
    return modal;
}

// ver is at least minVer ("5.0.1" vs "5.0.0"), missing parts count as 0
function minVersionCheck(ver, minVer) {
    let verArr = ver.split('.');
    let minVerArr = minVer.split('.');
    for(let i = 0; i < Math.max(verArr.length, minVerArr.length); i++) {
        let a = parseInt(verArr[i] || 0), b = parseInt(minVerArr[i] || 0);
        if(a < b) return false;
        if(a > b) return true;
    }
    return true;
}

const RELEASES_API = 'https://api.github.com/repos/Dezeter/TweeXDeck/releases/latest';

// Tells about a new release of this fork, once per version.
async function checkForUpdate() {
    let release = await fetch(RELEASES_API).then(r => r.ok ? r.json() : null).catch(() => null);
    let latest = String(release?.tag_name || '').replace(/^v/, '');
    if(!/^\d+(\.\d+)*$/.test(latest)) return;
    let manifest = await fetch(chrome.runtime.getURL('/manifest.json')).then(r => r.json());
    if(minVersionCheck(manifest.version, latest)) return;
    if(localStorage.OTDupdateNotified === latest || document.querySelector('.otd-notification-modal')) return;

    // the language picked in TweeXDeck's settings (OTDuiLang), the browser's without it
    let ru = (['ru', 'en'].includes(localStorage.OTDuiLang) ? localStorage.OTDuiLang : navigator.language || '').startsWith('ru');
    let modal = createModal(`<div class="otd-notification otd-notification-info"><div class="otd-notification-content"></div></div>`, 'otd-notification-modal', () => {
        localStorage.OTDupdateNotified = latest;
    });
    let content = modal.querySelector('.otd-notification-content');
    let link = document.createElement('a');
    link.href = `https://github.com/Dezeter/TweeXDeck/releases/tag/${encodeURIComponent(release.tag_name)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = ru ? 'что нового и скачать' : 'release notes and download';
    content.append(ru ? `Вышла новая версия TweeXDeck ${latest} (у вас ${manifest.version}): ` : `TweeXDeck ${latest} is out (you have ${manifest.version}): `, link);
}

let style = document.createElement('style');
style.innerHTML = /*css*/`
.otd-modal {
    position: fixed;
    z-index: 200;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: rgb(0, 0, 0);
    background-color: rgba(0, 0, 0, 0.4);
}

.otd-modal-content {
    width: fit-content;
    min-width: 500px;
    margin: auto;
    border-radius: 5px;
    padding: 20px;
    background-color: white;
    color: black;
    top: 20%;
    position: relative;
    max-height: 60%;
    overflow-y: inherit;
    animation: opac 0.2s ease-in-out;
}
html.dark .otd-modal-content {
    background-color: var(--otd-panel, #15202b);
    color: var(--otd-text, white);
}
.otd-notification-warning > .otd-notification-content::before {
    content: "⚠️";
    margin-right: 5px;
}
.otd-notification-error > .otd-notification-content::before {
    content: "❌";
    margin-right: 5px;
}
.otd-notification-info > .otd-notification-content::before {
    content: "ℹ️";
    margin-right: 5px;
}
@keyframes opac {
    0% {
        opacity: 0
    }
    100% {
        opacity: 1
    }
}

.otd-modal-close {
    color: #aaaaaa;
    float: right;
    font-size: 20px;
    font-weight: bold;
    top: 0;
    right: 5px;
    position: absolute;
}

.otd-modal-close:hover,
.otd-modal-close:focus {
    color: black;
    text-decoration: none;
    cursor: pointer;
}
`;

setTimeout(() => {
    document.head.appendChild(style);
}, 1000);
setTimeout(checkForUpdate, 5000);
setInterval(checkForUpdate, 60000 * 60 * 6);