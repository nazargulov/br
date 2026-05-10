// Hosted Google Picker page for EmailMassa.
// Opened by background SW with #picker_key=...&ext_id=... in the URL hash.
// On first load we exchange picker_key for the OAuth token via a one-time
// handshake (chrome.runtime.sendMessage 'pickerReady') — the token itself is
// never put in the URL, because Chrome captures sender.url at page load and
// would leak it into every subsequent onMessageExternal sender.url / SW log.

const DEVELOPER_KEY = 'AIzaSyBcY_bUi5Z2ZEK4DP91NB8xvGUBOzw4WEY';
// Cloud project number for the EmailMassa OAuth client. Required by
// google.picker.PickerBuilder.setAppId() when using the drive.file scope —
// without it, the per-file access grant is NOT associated with our OAuth
// client and Sheets/Drive API calls return 404 NOT_FOUND for the picked file.
const APP_ID = '500989328751';

const stateEl = document.getElementById('state');
const titleEl = document.getElementById('title');
const statusEl = document.getElementById('status');
const spinnerEl = document.getElementById('spinner');
const hintEl = document.getElementById('hint');

let extensionId = null;
let resultSent = false;

function setError(title, msg) {
    stateEl.classList.add('error');
    titleEl.textContent = title;
    statusEl.textContent = msg;
    spinnerEl.style.display = 'none';
    hintEl.textContent = 'Feche esta janela e tente novamente.';
}

function setReady() {
    titleEl.textContent = 'Selecione uma planilha';
    statusEl.textContent = 'Use a janela do Google para escolher.';
    spinnerEl.style.display = 'none';
}

const STORAGE_KEY_PARAMS = 'emailmassa_picker_params';

function readHashParams() {
    // Fresh open from the extension SW: hash carries picker_key + ext_id.
    const params = new URLSearchParams(location.hash.slice(1));
    let pickerKey = params.get('picker_key');
    let extId = params.get('ext_id');

    if (pickerKey && extId) {
        // Persist for the lifetime of this popup so a reload before/after
        // handshake doesn't leave us with empty params and a confusing error.
        try {
            sessionStorage.setItem(STORAGE_KEY_PARAMS, JSON.stringify({ pickerKey, extId }));
        } catch (_) {}
        // Strip the hash from the URL bar for log hygiene.
        history.replaceState(null, '', location.pathname);
    } else {
        // Reload / back-nav: recover from sessionStorage.
        try {
            const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY_PARAMS) || 'null');
            pickerKey = saved?.pickerKey || null;
            extId = saved?.extId || null;
        } catch (_) {}
    }

    return { pickerKey, extId };
}

function sendToExtension(message) {
    return new Promise((resolve) => {
        if (!extensionId || !chrome?.runtime?.sendMessage) {
            resolve(null);
            return;
        }
        try {
            chrome.runtime.sendMessage(extensionId, message, (response) => {
                void chrome.runtime.lastError;
                resolve(response || null);
            });
        } catch (_) {
            resolve(null);
        }
    });
}

function notifyExtension(message, done) {
    if (message.action === 'sheetPickerResult' || message.action === 'sheetPickerCancelled') {
        resultSent = true;
    }
    sendToExtension(message).then(() => done?.());
}

function loadPicker() {
    return new Promise((resolve, reject) => {
        if (typeof gapi === 'undefined') {
            reject(new Error('Google API library não carregou'));
            return;
        }
        gapi.load('picker', {
            callback: resolve,
            onerror: () => reject(new Error('Falha ao carregar Picker')),
        });
    });
}

function buildPicker(token) {
    // DocsView with mimeType filter is the modern path for drive.file —
    // it explicitly grants per-file access via the Picker → Drive grant flow.
    const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
        .setMimeTypes('application/vnd.google-apps.spreadsheet')
        .setSelectFolderEnabled(false)
        .setMode(google.picker.DocsViewMode.LIST);

    const picker = new google.picker.PickerBuilder()
        .setAppId(APP_ID)
        .setOAuthToken(token)
        .setDeveloperKey(DEVELOPER_KEY)
        .addView(view)
        .setTitle('Selecione uma planilha do Google Drive')
        .setCallback((data) => {
            const action = data[google.picker.Response.ACTION];
            if (action === google.picker.Action.PICKED) {
                const doc = data[google.picker.Response.DOCUMENTS]?.[0];
                if (!doc) return;
                titleEl.textContent = 'Importando…';
                statusEl.textContent = `Selecionado: ${doc.name}`;
                notifyExtension({
                    action: 'sheetPickerResult',
                    fileId: doc.id,
                    fileName: doc.name,
                }, () => setTimeout(() => window.close(), 300));
            } else if (action === google.picker.Action.CANCEL) {
                notifyExtension({ action: 'sheetPickerCancelled' }, () => window.close());
            }
        })
        .build();

    picker.setVisible(true);
}

async function init() {
    const { pickerKey, extId } = readHashParams();

    if (!pickerKey || !extId) {
        setError('Sessão expirada', 'Reabra o seletor a partir do EmailMassa.');
        return;
    }

    extensionId = extId;

    // Exchange the one-time key for the OAuth token via SW handshake.
    const handshake = await sendToExtension({ action: 'pickerReady', pickerKey });
    if (!handshake?.success || !handshake.token) {
        const err = handshake?.error || 'Não foi possível obter o token.';
        // 'No token for key' = key was already consumed (typical post-reload
        // case) or expired. Give a clearer message than a generic auth error.
        if (err === 'No token for key') {
            try { sessionStorage.removeItem(STORAGE_KEY_PARAMS); } catch (_) {}
            setError('Sessão expirada', 'Reabra o seletor a partir do EmailMassa.');
        } else {
            setError('Erro de autenticação', err);
        }
        return;
    }

    try {
        await loadPicker();
        buildPicker(handshake.token);
        setReady();
    } catch (err) {
        console.error('Picker init error:', err);
        setError('Erro', err.message || 'Não foi possível abrir o seletor.');
        notifyExtension({ action: 'sheetPickerCancelled' });
    }
}

window.addEventListener('beforeunload', () => {
    if (!resultSent && extensionId) {
        try {
            chrome.runtime.sendMessage(extensionId, { action: 'sheetPickerCancelled' });
        } catch (_) {}
    }
});

init();
