// js/mochi-voice.js
// 语音录制 & 梦角语音回复（兼容 A 传讯项目，不修改 A 任何源码）

(function() {
    'use strict';

    const VOICE_LIB_KEY = (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'chatapp_') + 'voiceLibrary';
    const PARTNER_VOICE_PROBABILITY = 0.15; // 梦角发语音的概率
    const PARTNER_VOICE_DELAY_MIN = 2000;
    const PARTNER_VOICE_DELAY_MAX = 5000;

    window.voiceLibrary = window.voiceLibrary || [];

    // ---------- 注入必要 CSS ----------
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
            'audio/mp4',
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

    // ---------- 语音库管理（带重命名与自定义播放器） ----------
    function readFileAsDataURL(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }

    function openVoiceLibraryManager() {
        const existing = document.getElementById('mochi-voice-manager-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'mochi-voice-manager-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';

        const card = document.createElement('div');
        card.style.cssText = 'background:var(--secondary-bg);width:90%;max-width:400px;border-radius:20px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,0.3);display:flex;flex-direction:column;max-height:80vh;';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid var(--border-color);padding-bottom:10px;';
        header.innerHTML = `
            <div style="font-size:16px;font-weight:bold;color:var(--text-primary);"><i class="fas fa-microphone-alt" style="color:var(--accent-color);margin-right:6px;"></i>语音库管理</div>
            <button id="mochi-voice-close-btn" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary);">&times;</button>
        `;

        const listWrap = document.createElement('div');
        listWrap.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding-right:5px;';

        const footer = document.createElement('div');
        footer.style.cssText = 'margin-top:15px;padding-top:15px;border-top:1px solid var(--border-color);';
        const addBtn = document.createElement('button');
        addBtn.className = 'modal-btn modal-btn-primary';
        addBtn.style.cssText = 'width:100%;padding:12px;border-radius:12px;font-weight:bold;';
        addBtn.innerHTML = '<i class="fas fa-plus"></i> 上传新语音';
        footer.appendChild(addBtn);

        card.appendChild(header);
        card.appendChild(listWrap);
        card.appendChild(footer);
        modal.appendChild(card);
        document.body.appendChild(modal);

        document.getElementById('mochi-voice-close-btn').onclick = () => modal.remove();
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        function renderList() {
            listWrap.innerHTML = '';
            if (!window.voiceLibrary || window.voiceLibrary.length === 0) {
                listWrap.innerHTML = '<div style="text-align:center;padding:30px 0;color:var(--text-secondary);font-size:13px;">语音库空空如也，快去上传一条吧~</div>';
                return;
            }

            window.voiceLibrary.forEach((item, index) => {
                const itemRow = document.createElement('div');
                itemRow.style.cssText = 'display:flex;align-items:center;gap:8px;background:var(--primary-bg);padding:10px;border-radius:12px;border:1px solid var(--border-color);';
                
                const playBtn = document.createElement('button');
                playBtn.style.cssText = 'width:32px;height:32px;border-radius:50%;background:var(--accent-color);color:#fff;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;';
                playBtn.innerHTML = '<i class="fas fa-play" style="margin-left:2px;"></i>';
                
                const audio = new Audio(item.dataUrl);
                
                const nameSpan = document.createElement('span');
                nameSpan.textContent = item.name || '未命名';
                nameSpan.style.cssText = 'font-size:13px;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;';
                nameSpan.title = '点击可重命名';
                
                const progressWrap = document.createElement('div');
                progressWrap.style.cssText = 'flex:1;height:4px;background:var(--border-color);border-radius:2px;margin:0 5px;position:relative;overflow:hidden;';
                const progressBar = document.createElement('div');
                progressBar.style.cssText = 'width:0%;height:100%;background:var(--accent-color);transition:width 0.1s;';
                progressWrap.appendChild(progressBar);

                playBtn.onclick = () => {
                    if (audio.paused) {
                        document.querySelectorAll('audio').forEach(a => a.pause());
                        audio.play();
                        playBtn.innerHTML = '<i class="fas fa-pause" style="margin-left:0;"></i>';
                    } else {
                        audio.pause();
                        playBtn.innerHTML = '<i class="fas fa-play" style="margin-left:2px;"></i>';
                    }
                };

                audio.ontimeupdate = () => {
                    if (audio.duration) {
                        progressBar.style.width = (audio.currentTime / audio.duration) * 100 + '%';
                    }
                };
                audio.onended = () => {
                    playBtn.innerHTML = '<i class="fas fa-play" style="margin-left:2px;"></i>';
                    progressBar.style.width = '0%';
                };

                const editBtn = document.createElement('button');
                editBtn.style.cssText = 'background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:5px;font-size:14px;flex-shrink:0;';
                editBtn.innerHTML = '<i class="fas fa-edit"></i>';
                editBtn.title = '重命名';
                
                const doRename = async () => {
                    const newName = prompt('请输入新的语音名称：', item.name || '未命名');
                    if (newName && newName.trim()) {
                        item.name = newName.trim();
                        await saveVoiceLibrary();
                        renderList();
                    }
                };
                
                editBtn.onclick = doRename;
                nameSpan.onclick = doRename;

                const delBtn = document.createElement('button');
                delBtn.style.cssText = 'background:none;border:none;color:#ff4757;cursor:pointer;padding:5px;font-size:14px;flex-shrink:0;';
                delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                delBtn.onclick = async () => {
                    if (confirm(`确定要删除语音「${item.name}」吗？`)) {
                        audio.pause();
                        window.voiceLibrary.splice(index, 1);
                        await saveVoiceLibrary();
                        renderList();
                    }
                };

                itemRow.appendChild(playBtn);
                itemRow.appendChild(nameSpan);
                itemRow.appendChild(progressWrap);
                itemRow.appendChild(editBtn);
                itemRow.appendChild(delBtn);
                listWrap.appendChild(itemRow);
            });
        }

        addBtn.onclick = () => {
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
                if (added > 0) {
                    if (typeof showNotification === 'function') showNotification(`成功添加 ${added} 条语音`, 'success');
                    renderList();
                }
            };
            input.click();
        };

        renderList();
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

    // ---------- 初始化 ----------
    function init() {
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

        loadVoiceLibrary().catch(e => console.warn('[voice] 后台加载语音库失败', e));
    }

    init();
})();
