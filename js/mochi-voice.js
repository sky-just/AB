// js/mochi-voice.js
// 语音录制 & 梦角语音回复（兼容 A 传讯项目，不修改 A 任何源码）
// 加载顺序：必须在 core.js、utils.js、config.js 之后

(function() {
    'use strict';

    const VOICE_LIB_KEY = (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'chatapp_') + 'voiceLibrary';
    const PARTNER_VOICE_PROBABILITY = 0.15; // 梦角发语音的概率
    const PARTNER_VOICE_DELAY_MIN = 2000;
    const PARTNER_VOICE_DELAY_MAX = 5000;

    window.voiceLibrary = window.voiceLibrary || [];

    // ---------- 注入必要 CSS（避免撑破气泡）----------
    (function injectVoiceStyle() {
        if (document.getElementById('mochi-voice-style')) return;
        const style = document.createElement('style');
        style.id = 'mochi-voice-style';
        style.textContent = `
            .message audio { max-width: 220px; height: 34px; display: block; outline: none; }
            #voice-btn.recording { background: #ff4757 !important; color: #fff !important; }
            @keyframes recPulse { 0%,100%{opacity:1;} 50%{opacity:0.3;} }
        `;
        document.head.appendChild(style);
    })();

    async function loadVoiceLibrary() {
        try {
            if (window.localforage) {
                const data = await localforage.getItem(VOICE_LIB_KEY);
                if (Array.isArray(data)) window.voiceLibrary = data;
            } else {
                window.voiceLibrary = JSON.parse(localStorage.getItem(VOICE_LIB_KEY) || '[]');
            }
        } catch (e) {
            console.warn('[voice] 加载语音库失败:', e);
        }
    }

    async function saveVoiceLibrary() {
        try {
            if (window.localforage) {
                await localforage.setItem(VOICE_LIB_KEY, window.voiceLibrary);
            } else {
                localStorage.setItem(VOICE_LIB_KEY, JSON.stringify(window.voiceLibrary));
            }
        } catch (e) {
            console.warn('[voice] 保存语音库失败:', e);
        }
    }

    // ---------- 用户录音 ----------
    let mediaRecorder = null;
    let audioChunks = [];
    let recordStream = null;
    let recordTimer = null;
    let recordStartTime = 0;
    let isRecording = false;
    let recordBtn = null;
    let recordStatusBar = null;
    let recordTimeDisplay = null;

    function pickMimeType() {
        if (typeof MediaRecorder === 'undefined') return '';
        const candidates = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',        // Safari
            'audio/ogg;codecs=opus'
        ];
        for (const m of candidates) {
            if (MediaRecorder.isTypeSupported(m)) return m;
        }
        return '';
    }

    function initVoiceUI() {
        const inputArea = document.querySelector('.input-buttons');
        if (!inputArea || document.getElementById('voice-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'voice-btn';
        btn.className = 'input-btn collapse-hideable';
        btn.title = '点击开始录音，再次点击停止';
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
        inputArea.insertBefore(btn, inputArea.firstChild);

        const wrapper = document.querySelector('.input-area-wrapper');
        if (wrapper) {
            const bar = document.createElement('div');
            bar.id = 'voice-record-bar';
            bar.style.cssText = 'display:none;padding:8px 15px;background:rgba(var(--accent-color-rgb),0.1);border-top:1px solid var(--border-color);align-items:center;gap:12px;';
            bar.innerHTML = `
                <span style="color:#ff4757;animation:recPulse 1s infinite;">●</span>
                <span id="voice-timer" style="font-size:14px;font-weight:600;color:var(--text-primary);">00:00</span>
                <span style="flex:1;font-size:12px;color:var(--text-secondary);">录音中，点击麦克风停止</span>
                <button id="voice-cancel-btn" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:16px;">✕</button>
            `;
            wrapper.insertBefore(bar, wrapper.firstChild);
            recordStatusBar = bar;
            recordTimeDisplay = document.getElementById('voice-timer');
            document.getElementById('voice-cancel-btn').addEventListener('click', cancelRecording);
        }

        btn.addEventListener('click', toggleRecording);
        recordBtn = btn;
    }

    async function startRecording() {
        if (isRecording) return;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (typeof showNotification === 'function') showNotification('浏览器不支持录音', 'error');
            return;
        }
        try {
            recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            const mimeType = pickMimeType();
            const opts = mimeType ? { mimeType } : {};
            mediaRecorder = new MediaRecorder(recordStream, opts);

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) audioChunks.push(e.data);
            };
            mediaRecorder.onstop = () => {
                if (recordStream) {
                    recordStream.getTracks().forEach(t => t.stop());
                    recordStream = null;
                }
                if (!audioChunks.length) return;
                const blob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
                sendVoiceMessage(blob);
            };

            mediaRecorder.start(100);
            isRecording = true;
            recordStartTime = Date.now();
            updateRecordBtnState(true);
            if (recordStatusBar) recordStatusBar.style.display = 'flex';
            startTimer();

            setTimeout(() => { if (isRecording) stopRecording(); }, 60000);
        } catch (err) {
            console.error('[voice] 无法访问麦克风', err);
            if (typeof showNotification === 'function') showNotification('无法访问麦克风，请检查权限', 'error');
        }
    }

    function stopRecording() {
        if (!isRecording || !mediaRecorder) return;
        try { mediaRecorder.stop(); } catch (e) {}
        isRecording = false;
        updateRecordBtnState(false);
        if (recordStatusBar) recordStatusBar.style.display = 'none';
        stopTimer();
    }

    function cancelRecording() {
        if (!isRecording) return;
        audioChunks = [];
        try { mediaRecorder.stop(); } catch (e) {}
        isRecording = false;
        updateRecordBtnState(false);
        if (recordStatusBar) recordStatusBar.style.display = 'none';
        stopTimer();
    }

    function toggleRecording() {
        if (isRecording) stopRecording(); else startRecording();
    }

    function updateRecordBtnState(recording) {
        if (!recordBtn) return;
        const icon = recordBtn.querySelector('i');
        if (recording) {
            recordBtn.classList.add('recording');
            if (icon) icon.className = 'fas fa-stop';
        } else {
            recordBtn.classList.remove('recording');
            if (icon) icon.className = 'fas fa-microphone';
        }
    }

    function startTimer() {
        updateTimer();
        recordTimer = setInterval(updateTimer, 200);
    }
    function stopTimer() { clearInterval(recordTimer); recordTimer = null; }
    function updateTimer() {
        if (!recordTimeDisplay) return;
        const elapsed = Date.now() - recordStartTime;
        const secs = Math.floor(elapsed / 1000);
        const mins = Math.floor(secs / 60);
        recordTimeDisplay.textContent = `${String(mins).padStart(2,'0')}:${String(secs % 60).padStart(2,'0')}`;
    }

    // ⚠️ 关键改造：A 不认识 type:'voice'，改用 text 装 <audio> HTML
    function sendVoiceMessage(blob) {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result;
            const duration = Math.max(1, Math.floor((Date.now() - recordStartTime) / 1000));
            const audioHtml = `<div style="display:flex;align-items:center;gap:8px;padding:2px 0;">
                <i class="fas fa-microphone" style="color:inherit;opacity:0.75;"></i>
                <audio controls preload="metadata" src="${base64}"></audio>
                <span style="font-size:11px;opacity:0.6;">${duration}s</span>
            </div>`;

            try {
                if (typeof addMessage === 'function') {
                    addMessage({
                        id: Date.now(),
                        sender: 'user',
                        text: audioHtml,
                        type: 'normal',
                        timestamp: new Date(),
                        status: 'sent',
                        favorited: false,
                        note: null
                    });
                } else {
                    console.warn('[voice] addMessage 不可用，无法发送语音消息');
                }
                if (typeof playSound === 'function') playSound('send');
            } catch (e) {
                console.error('[voice] 发送语音消息失败:', e);
            }
        };
        reader.readAsDataURL(blob);
    }

    // ---------- 梦角语音回复 ----------
    function getRandomVoiceReply() {
        if (!window.voiceLibrary || window.voiceLibrary.length === 0) return null;
        return window.voiceLibrary[Math.floor(Math.random() * window.voiceLibrary.length)].dataUrl;
    }

    window.tryPartnerVoiceReply = function() {
        if (!window.voiceLibrary || window.voiceLibrary.length === 0) return false;
        return getRandomVoiceReply();
    };

    function sendPartnerVoiceMessage() {
        const voiceData = getRandomVoiceReply();
        if (!voiceData) return;
        const audioHtml = `<div style="display:flex;align-items:center;gap:8px;padding:2px 0;">
            <i class="fas fa-microphone" style="color:inherit;opacity:0.75;"></i>
            <audio controls preload="metadata" src="${voiceData}"></audio>
        </div>`;
        try {
            if (typeof addMessage === 'function') {
                addMessage({
                    id: Date.now() + Math.random(),
                    sender: (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '对方',
                    text: audioHtml,
                    type: 'normal',
                    timestamp: new Date(),
                    status: 'received',
                    favorited: false,
                    note: null
                });
                if (typeof playSound === 'function') playSound('message');
                if (typeof window._sendPartnerNotification === 'function') {
                    window._sendPartnerNotification((typeof settings !== 'undefined' && settings.partnerName) || '对方', '[语音]');
                }
            }
        } catch (e) {
            console.error('[voice] 梦角语音发送失败:', e);
        }
    }

    // ⚠️ 关键改造：B 包一层 window.simulateReply，A 原逻辑不覆盖
    function hookSimulateReply() {
        if (typeof window.simulateReply !== 'function' || window.simulateReply._mochiHooked) return;
        const original = window.simulateReply;
        const wrapped = function() {
            try { original.apply(this, arguments); } catch (e) { console.error('[voice] 原 simulateReply 出错:', e); }
            if (window.voiceLibrary && window.voiceLibrary.length > 0 && Math.random() < PARTNER_VOICE_PROBABILITY) {
                const delay = PARTNER_VOICE_DELAY_MIN + Math.random() * (PARTNER_VOICE_DELAY_MAX - PARTNER_VOICE_DELAY_MIN);
                setTimeout(sendPartnerVoiceMessage, delay);
            }
        };
        wrapped._mochiHooked = true;
        window.simulateReply = wrapped;
    }

    // ---------- 语音库管理 ----------
    function readFileAsDataURL(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }

    function openVoiceLibraryManager() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.multiple = true;
        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            let added = 0;
            for (const file of files) {
                if (file.size > 5 * 1024 * 1024) {
                    if (typeof showNotification === 'function') showNotification(`${file.name} 超过5MB，已跳过`, 'warning');
                    continue;
                }
                try {
                    const dataUrl = await readFileAsDataURL(file);
                    window.voiceLibrary.push({
                        id: Date.now() + Math.random(),
                        name: file.name.replace(/\.[^/.]+$/, ""),
                        dataUrl: dataUrl
                    });
                    added++;
                } catch (err) {
                    console.warn('[voice] 读取失败:', file.name, err);
                }
            }
            await saveVoiceLibrary();
            if (typeof showNotification === 'function') showNotification(`已添加 ${added} 条语音到库`, 'success');
        };
        input.click();
    }
    window.openVoiceLibraryManager = openVoiceLibraryManager;

    function addVoiceLibraryEntry() {
        const advList = document.querySelector('#advanced-modal .settings-item-list');
        if (!advList || document.getElementById('voice-library-function')) return;
        const item = document.createElement('div');
        item.className = 'settings-item';
        item.id = 'voice-library-function';
        item.innerHTML = '<i class="fas fa-microphone-alt"></i><span>语音库</span>';
        item.addEventListener('click', () => {
            if (typeof hideModal === 'function') hideModal(document.getElementById('advanced-modal'));
            openVoiceLibraryManager();
        });
        advList.appendChild(item);
    }

    // ---------- 初始化（延迟，避免加载顺序问题）----------
   // ---------- 初始化（防止浏览器拦截存储导致按钮不显示）----------
    function init() {
        // 1. 不管三七二十一，先把 UI 渲染出来
        const boot = () => {
            try {
                initVoiceUI();
                hookSimulateReply();
                setTimeout(addVoiceLibraryEntry, 1200);
            } catch (e) {
                console.error('[voice] 初始化失败:', e);
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 300));
        } else {
            setTimeout(boot, 300);
        }

        // 2. 再去后台慢慢加载语音库（即使报错卡住，也不影响上面按钮的显示）
        loadVoiceLibrary().catch(e => console.warn('[voice] 后台加载语音库失败', e));
    }

    init();
})();
