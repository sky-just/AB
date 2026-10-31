// js/mochi-checkin.js
// 双向报备模块（查岗、状态库、聊天联动、自定义背景）

(function() {
    'use strict';

    const CHECKIN_BG_KEY = (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'chatapp_') + 'mochiCheckinBg';
    const MY_STATUS_KEY = (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'chatapp_') + 'mochiCheckinMyStatus';
    const MY_STATUS_POOL_KEY = (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'chatapp_') + 'mochiCheckinMyPool';
    const TA_STATUS_POOL_KEY = (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'chatapp_') + 'mochiCheckinTaPool';
    
    let checkinBgImage = '';
    let myCurrentStatus = { text: '还没报备', ts: Date.now() };
    let taCurrentStatus = { text: '还没报备', ts: Date.now() };
    
    // 默认状态库
    let myStatusPool = ['在想你', '在发呆', '在看手机', '在吃饭', '在休息', '在忙'];
    let taStatusPool = ['在工作', '在看书', '在听歌', '在喝咖啡', '在散步', '在想你'];

    function injectStyle() {
        if (document.getElementById('mochi-checkin-style')) return;
        const style = document.createElement('style');
        style.id = 'mochi-checkin-style';
        style.textContent = `
            #mochi-checkin-container { position: fixed; inset: 0; z-index: 99995; background: #f7f7f7; color: #333; display: none; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; }
            html[data-theme="dark"] #mochi-checkin-container { background: #111; color: #d3d3d3; }
            #mochi-checkin-container.show { display: flex; animation: mcSlideIn 0.3s ease; }
            
            /* 顶栏 */
            .mc-header { height: 56px; display: flex; align-items: center; padding: 0 16px; background: rgba(255,255,255,0.8); border-bottom: 1px solid #e0e0e0; flex-shrink: 0; z-index: 10; backdrop-filter: blur(10px); }
            html[data-theme="dark"] .mc-header { background: rgba(30,30,30,0.8); border-bottom-color: #333; }
            .mc-back-btn { background: none; border: none; font-size: 20px; color: inherit; cursor: pointer; padding: 8px; margin-right: 10px; }
            .mc-title { font-size: 17px; font-weight: bold; flex: 1; text-align: center; letter-spacing: 1px; }
            .mc-set-bg { background: none; border: none; font-size: 18px; color: inherit; cursor: pointer; padding: 8px; }

            /* 主体内容区 */
            .mc-main { flex: 1; overflow-y: auto; position: relative; background-size: cover; background-position: center; display: flex; flex-direction: column; padding: 20px 16px; }
            .mc-main.has-bg::before { content: ''; position: absolute; inset: 0; background: rgba(0,0,0,0.1); pointer-events: none; }
            
            /* 左右双卡片 */
            .mc-cards-wrap { display: flex; justify-content: space-between; gap: 12px; position: relative; z-index: 2; margin-top: 10px; }
            
            .mc-card { flex: 1; background: rgba(255,255,255,0.85); border-radius: 16px; padding: 16px 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); display: flex; flex-direction: column; align-items: center; text-align: center; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.5); transition: transform 0.2s; }
            html[data-theme="dark"] .mc-card { background: rgba(42,42,42,0.85); border-color: rgba(255,255,255,0.1); }
            .mc-card:active { transform: scale(0.98); }
            
            .mc-av { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; background: #eee; border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
            html[data-theme="dark"] .mc-av { border-color: #333; background: #222; }
            .mc-av img { width: 100%; height: 100%; object-fit: cover; }
            
            .mc-name { font-size: 15px; font-weight: 600; color: #333; margin-bottom: 4px; }
            html[data-theme="dark"] .mc-name { color: #eee; }
            .mc-time { font-size: 10px; color: #888; margin-bottom: 10px; font-family: monospace; }
            
            .mc-status-box { width: 100%; background: rgba(var(--accent-color-rgb), 0.08); border-radius: 8px; padding: 8px 6px; min-height: 40px; display: flex; align-items: center; justify-content: center; }
            .mc-status-text { font-size: 13px; color: var(--accent-color); font-weight: 500; word-break: break-all; line-height: 1.4; }
            
            /* 查岗按钮 */
            .mc-action-area { margin-top: auto; padding: 30px 0; display: flex; justify-content: center; position: relative; z-index: 2; }
            .mc-check-btn { background: var(--accent-color); color: #fff; border: none; border-radius: 30px; padding: 14px 40px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 6px 20px rgba(var(--accent-color-rgb), 0.4); transition: all 0.2s; display: flex; align-items: center; gap: 8px; }
            .mc-check-btn:active { transform: scale(0.95); }
            
            /* 弹窗通用 */
            .mc-modal { position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
            .mc-modal.show { display: flex; }
            .mc-modal-content { background: #fff; width: 85%; max-width: 340px; border-radius: 20px; padding: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); max-height: 80vh; display: flex; flex-direction: column; }
            html[data-theme="dark"] .mc-modal-content { background: #2a2a2a; }
            .mc-modal-title { font-size: 16px; font-weight: bold; margin-bottom: 16px; text-align: center; }
            .mc-modal-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
            
            .mc-option-btn { padding: 12px; border-radius: 10px; border: 1px solid #ddd; background: #f9f9f9; font-size: 14px; cursor: pointer; text-align: center; transition: background 0.2s; }
            html[data-theme="dark"] .mc-option-btn { background: #333; border-color: #444; }
            .mc-option-btn:hover { background: #eee; }
            html[data-theme="dark"] .mc-option-btn:hover { background: #444; }
            
            .mc-input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 10px; outline: none; margin-bottom: 10px; font-size: 14px; background: #f9f9f9; }
            html[data-theme="dark"] .mc-input { background: #333; border-color: #444; color: #fff; }
            
            .mc-btn-row { display: flex; gap: 10px; }
            .mc-btn { flex: 1; padding: 10px; border-radius: 10px; border: none; font-size: 14px; font-weight: bold; cursor: pointer; }
            .mc-btn-primary { background: var(--accent-color); color: #fff; }
            .mc-btn-sec { background: #eee; color: #333; }
            html[data-theme="dark"] .mc-btn-sec { background: #444; color: #ddd; }
            
            @keyframes mcSlideIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
        `;
        document.head.appendChild(style);
    }

    // 挂载入口
    function addEntry() {
        const advList = document.querySelector('#advanced-modal .settings-item-list');
        if (!advList) return;
        let item = document.getElementById('checkin-function');
        if (!item) {
            item = document.createElement('div');
            item.className = 'settings-item';
            item.id = 'checkin-function';
            item.innerHTML = '<i class="fas fa-map-marker-alt"></i><span>双向报备</span>';
            item.addEventListener('click', () => {
                if (typeof hideModal === 'function') hideModal(document.getElementById('advanced-modal'));
                openCheckin();
            });
            advList.appendChild(item);
        }
    }

    // 获取头像
    function getMyAvatar() { const img = document.querySelector('#my-avatar img'); return img ? img.src : ''; }
    function getTaAvatar() { const img = document.querySelector('#partner-avatar img'); return img ? img.src : ''; }

    // 数据加载与保存
    async function loadData() {
        try {
            if (window.localforage) {
                const bg = await localforage.getItem(CHECKIN_BG_KEY); if (bg) checkinBgImage = bg;
                const ms = await localforage.getItem(MY_STATUS_KEY); if (ms) myCurrentStatus = ms;
                const ts = await localforage.getItem('CHAT_APP_V3_taCheckinStatus'); if (ts) taCurrentStatus = ts;
                
                const mp = await localforage.getItem(MY_STATUS_POOL_KEY); if (mp && Array.isArray(mp)) myStatusPool = mp;
                const tp = await localforage.getItem(TA_STATUS_POOL_KEY); if (tp && Array.isArray(tp)) taStatusPool = tp;
            }
        } catch (e) {}
    }

    async function saveData(key, val) {
        try {
            if (window.localforage) await localforage.setItem(key, val);
            else localStorage.setItem(key, JSON.stringify(val));
        } catch (e) {}
    }

    function formatTime(ts) {
        const d = new Date(ts);
        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }

    // 打开主界面
    function openCheckin() {
        let container = document.getElementById('mochi-checkin-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'mochi-checkin-container';
            document.body.appendChild(container);
        }
        container.classList.add('show');
        renderUI();
    }

    function renderUI() {
        const container = document.getElementById('mochi-checkin-container');
        const taName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
        const myName = (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';
        const myAv = getMyAvatar();
        const taAv = getTaAvatar();

        let html = `
            <div class="mc-header">
                <button class="mc-back-btn" id="mc-close-btn"><i class="fas fa-arrow-left"></i></button>
                <div class="mc-title">双向报备</div>
                <button class="mc-set-bg" id="mc-set-bg-btn" title="更换背景"><i class="fas fa-image"></i></button>
            </div>
            <div class="mc-main ${checkinBgImage ? 'has-bg' : ''}" id="mc-main-bg" style="${checkinBgImage ? `background-image:url(${checkinBgImage})` : ''}">
                <div class="mc-cards-wrap">
                    <div class="mc-card">
                        <div class="mc-av">${taAv ? `<img src="${taAv}">` : '<i class="fas fa-user" style="color:#aaa;font-size:24px"></i>'}</div>
                        <div class="mc-name">${taName}</div>
                        <div class="mc-time">${formatTime(taCurrentStatus.ts)} 报备</div>
                        <div class="mc-status-box"><div class="mc-status-text">${taCurrentStatus.text}</div></div>
                    </div>
                    
                    <div class="mc-card" id="mc-my-card" style="cursor:pointer;" title="点击管理我的状态">
                        <div class="mc-av">${myAv ? `<img src="${myAv}">` : '<i class="fas fa-user" style="color:#aaa;font-size:24px"></i>'}</div>
                        <div class="mc-name">${myName}</div>
                        <div class="mc-time">${formatTime(myCurrentStatus.ts)} 报备</div>
                        <div class="mc-status-box"><div class="mc-status-text">${myCurrentStatus.text}</div></div>
                    </div>
                </div>
                
                <div class="mc-action-area">
                    <button class="mc-check-btn" id="mc-check-btn"><i class="fas fa-search-location"></i> 查岗</button>
                </div>
            </div>
        `;

        // 弹窗层
        html += `
            <div class="mc-modal" id="mc-question-modal">
                <div class="mc-modal-content">
                    <div class="mc-modal-title">你在干嘛呢？</div>
                    <div class="mc-modal-list" id="mc-q-options"></div>
                    <div class="mc-btn-row">
                        <button class="mc-btn mc-btn-sec" id="mc-q-cancel">逃避查岗</button>
                    </div>
                </div>
            </div>
            
            <div class="mc-modal" id="mc-manage-modal">
                <div class="mc-modal-content">
                    <div class="mc-modal-title">管理我的状态库</div>
                    <div style="display:flex; gap:8px; margin-bottom:12px;">
                        <input class="mc-input" id="mc-new-status-input" placeholder="输入新状态..." style="margin-bottom:0;">
                        <button class="mc-btn mc-btn-primary" id="mc-add-status-btn" style="flex:0 0 60px;">添加</button>
                    </div>
                    <div class="mc-modal-list" id="mc-manage-list"></div>
                    <div class="mc-btn-row">
                        <button class="mc-btn mc-btn-sec" id="mc-manage-close">关闭</button>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
        bindEvents();
    }

    function bindEvents() {
        document.getElementById('mc-close-btn').onclick = () => {
            document.getElementById('mochi-checkin-container').classList.remove('show');
        };

        // 换背景
        document.getElementById('mc-set-bg-btn').onclick = () => {
            const picker = document.createElement('input');
            picker.type = 'file'; picker.accept = 'image/*';
            picker.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (typeof showNotification === 'function') showNotification('正在处理背景...', 'info');
                try {
                    if (typeof optimizeImage === 'function') {
                        const b64 = await optimizeImage(file, 800, 0.7);
                        checkinBgImage = b64;
                        await saveData(CHECKIN_BG_KEY, b64);
                        document.getElementById('mc-main-bg').style.backgroundImage = `url(${b64})`;
                        document.getElementById('mc-main-bg').classList.add('has-bg');
                        if (typeof showNotification === 'function') showNotification('背景已更新', 'success');
                    }
                } catch (err) {}
                e.target.value = '';
            };
            picker.click();
        };

        // 查岗 TA
        document.getElementById('mc-check-btn').onclick = async () => {
            const btn = document.getElementById('mc-check-btn');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 查岗中...';
            btn.disabled = true;

            setTimeout(async () => {
                const randomTaStatus = taStatusPool[Math.floor(Math.random() * taStatusPool.length)];
                taCurrentStatus = { text: randomTaStatus, ts: Date.now() };
                await saveData('CHAT_APP_V3_taCheckinStatus', taCurrentStatus);
                
                const taName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
                
                // 发到聊天框
                if (typeof addMessage === 'function') {
                    addMessage({
                        id: Date.now(),
                        sender: taName,
                        text: `[报备] 刚被你查岗了，我现在${randomTaStatus}。`,
                        timestamp: new Date(),
                        type: 'normal',
                        status: 'received',
                        favorited: false
                    });
                }
                
                renderUI();
                if (typeof showNotification === 'function') showNotification('查岗成功', 'success');
            }, 1000);
        };

        // 管理我的状态
        document.getElementById('mc-my-card').onclick = () => {
            openManageModal();
        };
        document.getElementById('mc-manage-close').onclick = () => {
            document.getElementById('mc-manage-modal').classList.remove('show');
        };

        document.getElementById('mc-add-status-btn').onclick = async () => {
            const input = document.getElementById('mc-new-status-input');
            const val = input.value.trim();
            if (!val) return;
            if (!myStatusPool.includes(val)) myStatusPool.push(val);
            await saveData(MY_STATUS_POOL_KEY, myStatusPool);
            input.value = '';
            renderManageList();
            if (typeof showNotification === 'function') showNotification('状态已添加', 'success');
        };

        document.getElementById('mc-q-cancel').onclick = () => {
            document.getElementById('mc-question-modal').classList.remove('show');
        };
    }

    // 渲染我的状态管理列表
    function renderManageList() {
        const list = document.getElementById('mc-manage-list');
        if (!list) return;
        list.innerHTML = '';
        myStatusPool.forEach((status, idx) => {
            const d = document.createElement('div');
            d.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:10px; background:#f5f5f5; border-radius:8px;';
            if (document.documentElement.getAttribute('data-theme') === 'dark') d.style.background = '#333';
            
            d.innerHTML = `
                <span style="font-size:14px;">${status}</span>
                <div>
                    <button style="background:none;border:none;color:#576b95;cursor:pointer;padding:4px;" class="mc-edit" data-idx="${idx}">✏️</button>
                    <button style="background:none;border:none;color:#ff4757;cursor:pointer;padding:4px;" class="mc-del" data-idx="${idx}">🗑️</button>
                </div>
            `;
            list.appendChild(d);
        });

        list.querySelectorAll('.mc-edit').forEach(btn => {
            btn.onclick = async (e) => {
                const idx = Number(e.target.dataset.idx);
                const newText = prompt('修改状态：', myStatusPool[idx]);
                if (newText && newText.trim()) {
                    myStatusPool[idx] = newText.trim();
                    await saveData(MY_STATUS_POOL_KEY, myStatusPool);
                    renderManageList();
                }
            };
        });

        list.querySelectorAll('.mc-del').forEach(btn => {
            btn.onclick = async (e) => {
                const idx = Number(e.target.dataset.idx);
                myStatusPool.splice(idx, 1);
                await saveData(MY_STATUS_POOL_KEY, myStatusPool);
                renderManageList();
            };
        });
    }

    function openManageModal() {
        document.getElementById('mc-manage-modal').classList.add('show');
        renderManageList();
    }

    // 拦截聊天，30% 概率 TA 主动查岗
    function hookSimulateReply() {
        if (typeof window.simulateReply !== 'function' || window.simulateReply._mochiCheckinHooked) return;
        const original = window.simulateReply;
        
        const wrapped = function() {
            try { original.apply(this, arguments); } catch (e) {}
            
            // 30% 概率触发 TA 问你在干嘛
            if (Math.random() < 0.30) {
                setTimeout(() => {
                    // 只有报备面板没打开时才弹问卷
                    if (!document.getElementById('mochi-checkin-container')?.classList.contains('show')) {
                        showAskModal();
                    }
                }, 2000);
            }
        };
        wrapped._mochiCheckinHooked = true;
        window.simulateReply = wrapped;
    }

    function showAskModal() {
        let container = document.getElementById('mochi-checkin-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'mochi-checkin-container';
            document.body.appendChild(container);
        }
        // 这里不显示整个面板，只显示弹窗
        if (!document.getElementById('mc-question-modal')) {
            renderUI();
        }
        
        const qModal = document.getElementById('mc-question-modal');
        const optionsWrap = document.getElementById('mc-q-options');
        
        optionsWrap.innerHTML = '';
        myStatusPool.forEach(status => {
            const btn = document.createElement('button');
            btn.className = 'mc-option-btn';
            btn.textContent = status;
            btn.onclick = () => selectMyStatus(status);
            optionsWrap.appendChild(btn);
        });

        // 添加“其他”选项
        const otherBtn = document.createElement('button');
        otherBtn.className = 'mc-option-btn';
        otherBtn.innerHTML = '<span style="color:#576b95">自定义回答...</span>';
        otherBtn.onclick = () => {
            const customText = prompt('你在干嘛呢？');
            if (customText && customText.trim()) selectMyStatus(customText.trim());
        };
        optionsWrap.appendChild(otherBtn);

        qModal.classList.add('show');
    }

    async function selectMyStatus(text) {
        document.getElementById('mc-question-modal').classList.remove('show');
        myCurrentStatus = { text, ts: Date.now() };
        await saveData(MY_STATUS_KEY, myCurrentStatus);
        
        // 同步到聊天框
        if (typeof addMessage === 'function') {
            addMessage({
                id: Date.now(),
                sender: 'user',
                text: `[报备] 我在${text}。`,
                timestamp: new Date(),
                type: 'normal',
                status: 'sent',
                favorited: false
            });
        }
        
        // 如果当前打开了报备界面，刷新一下
        const container = document.getElementById('mochi-checkin-container');
        if (container && container.classList.contains('show')) {
            renderUI();
        }
    }

    // 初始化
    loadData().then(() => {
        injectStyle();
        hookSimulateReply();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setInterval(addEntry, 2000));
        } else {
            setInterval(addEntry, 2000);
        }
    });

    window.openMochiCheckin = openCheckin;
})();
