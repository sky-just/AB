// js/mochi-letter.js
// 他的来信模块（修复长文本遮挡、增加展开收起、支持背景）

(function() {
    'use strict';

    const LETTER_STORAGE_KEY = (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'chatapp_') + 'mochiLetters';
    const LETTER_BG_KEY = (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'chatapp_') + 'mochiLetterBg';
    
    let letters = [];
    let letterBgImage = '';
    let isLetterOpen = false;
    let currentViewingId = null;
    let isExpanded = false; // 是否展开全文

    function injectStyle() {
        if (document.getElementById('mochi-letter-style')) return;
        const style = document.createElement('style');
        style.id = 'mochi-letter-style';
        style.textContent = `
            #mochi-letter-container { position: fixed; inset: 0; z-index: 99995; background: #f4f1ea; color: #333; display: none; flex-direction: column; font-family: "Noto Serif SC", "Georgia", serif; }
            html[data-theme="dark"] #mochi-letter-container { background: #1a1a1a; color: #d3d3d3; }
            #mochi-letter-container.show { display: flex; animation: mlSlideIn 0.3s ease; }
            
            .ml-header { height: 56px; display: flex; align-items: center; padding: 0 16px; background: rgba(255,255,255,0.9); border-bottom: 1px solid #e0dcd3; flex-shrink: 0; z-index: 10; }
            html[data-theme="dark"] .ml-header { background: rgba(30,30,30,0.9); border-bottom-color: #333; }
            .ml-back-btn { background: none; border: none; font-size: 20px; color: inherit; cursor: pointer; padding: 8px; margin-right: 10px; }
            .ml-title { font-size: 17px; font-weight: bold; flex: 1; text-align: center; letter-spacing: 1px; }
            
            .ml-list-area { flex: 1; overflow-y: auto; padding: 20px 16px; display: flex; flex-direction: column; gap: 16px; }
            
            .ml-card { background: #fff; border-radius: 12px; padding: 16px 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); cursor: pointer; position: relative; border: 1px solid #e8e4db; transition: transform 0.2s; }
            html[data-theme="dark"] .ml-card { background: #2a2a2a; border-color: #444; }
            .ml-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
            
            .ml-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px dashed #e8e4db; padding-bottom: 10px; }
            html[data-theme="dark"] .ml-card-header { border-bottom-color: #444; }
            .ml-sender { font-size: 15px; font-weight: bold; color: #8c6b4a; }
            .ml-date { font-size: 12px; color: #999; font-family: monospace; }
            .ml-preview { font-size: 14px; line-height: 1.6; color: #666; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
            html[data-theme="dark"] .ml-preview { color: #aaa; }
            
            .ml-unread-dot { position: absolute; top: 16px; right: 16px; width: 8px; height: 8px; background: #ff4757; border-radius: 50%; }
            
            /* 信纸详情排版大修 */
            .ml-detail { flex: 1; display: none; flex-direction: column; height: 100%; overflow: hidden; }
            
            /* 滚动区域只包住信纸，不包按钮 */
            .ml-scroll-area { flex: 1; overflow-y: auto; padding: 24px 16px 10px 16px; }
            
            .ml-paper { 
                background: #fffcf5; border-radius: 12px; padding: 30px 24px 40px 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); 
                position: relative; background-size: cover; background-position: center; border: 1px solid #f0e6d2; 
            }
            html[data-theme="dark"] .ml-paper { background-color: #1e1c19; border-color: #3a352e; }
            
            .ml-paper.has-bg::before {
                content: ''; position: absolute; inset: 0; background: rgba(0,0,0,0.35); border-radius: inherit; z-index: 0; pointer-events: none;
            }
            .ml-paper.has-bg .ml-greeting, .ml-paper.has-bg .ml-content, .ml-paper.has-bg .ml-sign {
                position: relative; z-index: 1; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,0.8);
            }
            
            .ml-greeting { font-size: 16px; font-weight: bold; margin-bottom: 20px; color: #8c6b4a; }
            
            /* 核心修改：折叠机制 */
            .ml-content { 
                font-size: 15.5px; line-height: 2.2; letter-spacing: 0.5px; word-break: break-word; text-indent: 2em; text-align: justify;
                max-height: 35vh; /* 默认最高只显示屏幕高度的35% */
                overflow: hidden; 
                position: relative;
                transition: max-height 0.3s ease;
            }
            .ml-content.expanded { max-height: none; }
            /* 折叠时底部加渐变遮罩，提示下面还有字 */
            .ml-content:not(.expanded)::after {
                content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 40px;
                background: linear-gradient(transparent, #fffcf5);
            }
            html[data-theme="dark"] .ml-content:not(.expanded)::after { background: linear-gradient(transparent, #1e1c19); }
            .ml-paper.has-bg .ml-content:not(.expanded)::after { background: linear-gradient(transparent, rgba(0,0,0,0.4)); }

            .ml-expand-btn { display: block; width: 100%; text-align: center; font-size: 13px; color: #8c6b4a; cursor: pointer; margin-top: 10px; font-weight: bold; z-index: 2; position: relative; }
            .ml-paper.has-bg .ml-expand-btn { color: #fff; }

            .ml-sign { margin-top: 20px; text-align: right; font-size: 15px; font-style: italic; color: #8c6b4a; padding-right: 10px; }
            
            /* 底部按钮固定区，永远在屏幕最下方 */
            .ml-detail-actions { 
                flex-shrink: 0; 
                background: #f4f1ea; 
                padding: 12px 16px max(20px, env(safe-area-inset-bottom)); 
                display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;
                border-top: 1px solid #e0dcd3;
                z-index: 20;
            }
            html[data-theme="dark"] .ml-detail-actions { background: #1a1a1a; border-top-color: #333; }
            
            .ml-btn { padding: 8px 18px; border-radius: 20px; border: 1px solid #d1c7b7; background: #fff; color: #8c6b4a; cursor: pointer; font-size: 13px; transition: all 0.2s; box-shadow: 0 2px 6px rgba(0,0,0,0.02); }
            .ml-btn:hover { background: #f0e6d2; }
            html[data-theme="dark"] .ml-btn { background: #2a2a2a; border-color: #444; color: #d3d3d3; }
            html[data-theme="dark"] .ml-btn:hover { background: #333; }
            
            @keyframes mlSlideIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
        `;
        document.head.appendChild(style);
    }

    function addLetterEntry() {
        const advList = document.querySelector('#advanced-modal .settings-item-list');
        if (!advList) return;
        let item = document.getElementById('letter-function');
        if (!item) {
            item = document.createElement('div');
            item.className = 'settings-item';
            item.id = 'letter-function';
            item.addEventListener('click', () => {
                if (typeof hideModal === 'function') hideModal(document.getElementById('advanced-modal'));
                openLetterBox();
            });
            advList.appendChild(item);
        }
        const unread = letters.filter(l => !l.read).length;
        item.innerHTML = `<i class="fas fa-envelope-open-text"></i><span>他的来信 ${unread > 0 ? `<span style="background:#ff4757;color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;margin-left:6px;vertical-align:top;">${unread}</span>` : ''}</span>`;
    }

    async function loadLetters() {
        try {
            if (window.localforage) {
                const data = await localforage.getItem(LETTER_STORAGE_KEY);
                if (Array.isArray(data)) letters = data;
                const bg = await localforage.getItem(LETTER_BG_KEY);
                if (bg) letterBgImage = bg;
            } else {
                letters = JSON.parse(localStorage.getItem(LETTER_STORAGE_KEY) || '[]');
                letterBgImage = localStorage.getItem(LETTER_BG_KEY) || '';
            }
        } catch (e) { letters = []; }
    }

    async function saveLetters() {
        try {
            if (window.localforage) await localforage.setItem(LETTER_STORAGE_KEY, letters);
            else localStorage.setItem(LETTER_STORAGE_KEY, JSON.stringify(letters));
            addLetterEntry(); 
        } catch (e) {}
    }

    async function saveLetterBg(bg) {
        letterBgImage = bg;
        try {
            if (window.localforage) await localforage.setItem(LETTER_BG_KEY, bg);
            else localStorage.setItem(LETTER_BG_KEY, bg);
        } catch (e) {}
    }

    function generateLetter() {
        const pool = (typeof customReplies !== 'undefined' && Array.isArray(customReplies)) ? customReplies.filter(t => typeof t === 'string' && t.trim()) : [];
        if (pool.length === 0) return null;

        const count = Math.floor(Math.random() * 41) + 10; 
        let lines = [];
        
        for (let i = 0; i < count; i++) {
            const sentence = pool[Math.floor(Math.random() * pool.length)].trim();
            if (lines.length > 0 && lines[lines.length - 1] === sentence) { i--; continue; }
            lines.push(sentence);
        }

        let content = lines.join('，');
        if (!/[。！？…]$/.test(content)) content += '。';

        return { id: 'l_' + Date.now(), ts: Date.now(), content: content, read: false };
    }

    function hookSimulateReply() {
        if (typeof window.simulateReply !== 'function' || window.simulateReply._mochiLetterHooked) return;
        const original = window.simulateReply;
        const wrapped = function() {
            try { original.apply(this, arguments); } catch (e) {}
            if (Math.random() < 0.10) {
                const newLetter = generateLetter();
                if (newLetter) {
                    setTimeout(async () => {
                        letters.unshift(newLetter);
                        if (letters.length > 30) letters.length = 30;
                        await saveLetters();
                        const taName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
                        if (typeof showNotification === 'function') showNotification(`💌 收到一封来自 ${taName} 的来信，请前往【高级功能-他的来信】查看`, 'info', 5000);
                        if (isLetterOpen) renderLetterUI();
                    }, 2000);
                }
            }
        };
        wrapped._mochiLetterHooked = true;
        window.simulateReply = wrapped;
    }

    function openLetterBox() {
        let container = document.getElementById('mochi-letter-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'mochi-letter-container';
            document.body.appendChild(container);
        }
        container.classList.add('show');
        isLetterOpen = true;
        renderLetterUI();
    }

    function renderLetterUI() {
        const container = document.getElementById('mochi-letter-container');
        const taName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
        const myName = (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';

        letters.sort((a, b) => b.ts - a.ts);

        let html = `
            <div class="ml-header">
                <button class="ml-back-btn" id="ml-close-btn"><i class="fas fa-arrow-left"></i></button>
                <div class="ml-title">他的来信</div>
            </div>
            <div class="ml-list-area" id="ml-list-area">
        `;

        if (letters.length === 0) {
            html += `<div style="text-align:center; margin-top:50px; color:#999; font-family:sans-serif; font-size:14px;">信箱空空如也，和他多聊聊天吧，他可能会悄悄写信给你哦。</div>`;
        } else {
            letters.forEach(l => {
                const dateStr = new Date(l.ts).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
                const preview = l.content.slice(0, 35) + '...';
                html += `
                    <div class="ml-card" onclick="window._mlOpenDetail('${l.id}')">
                        ${!l.read ? `<div class="ml-unread-dot"></div>` : ''}
                        <div class="ml-card-header">
                            <div class="ml-sender">${taName} 的来信</div>
                            <div class="ml-date">${dateStr}</div>
                        </div>
                        <div class="ml-preview">${preview}</div>
                    </div>
                `;
            });
        }

        html += `</div>`;

        // 详情层：使用 scroll-area 包住信纸
        html += `
            <div class="ml-detail" id="ml-detail">
                <div class="ml-scroll-area">
                    <div class="ml-paper" id="ml-paper-bg">
                        <div class="ml-greeting">亲爱的 ${myName}：</div>
                        <div class="ml-content" id="ml-detail-content"></div>
                        <div class="ml-expand-btn" id="ml-expand-btn" style="display:none;" onclick="window._mlToggleExpand()">展开全文 ▼</div>
                        <div class="ml-sign" id="ml-detail-sign"></div>
                    </div>
                </div>
                <div class="ml-detail-actions">
                    <button class="ml-btn" id="ml-change-bg-btn"><i class="fas fa-image"></i> 更换信纸</button>
                    <button class="ml-btn" onclick="window._mlDeleteCurrent()">撕毁信件</button>
                    <button class="ml-btn" onclick="window._mlCloseDetail()">收起</button>
                </div>
            </div>
        `;

        container.innerHTML = html;
        bindEvents();
    }

    window._mlOpenDetail = async function(id) {
        const l = letters.find(x => x.id === id);
        if (!l) return;
        currentViewingId = id;
        isExpanded = false; // 每次打开默认折叠
        
        if (!l.read) {
            l.read = true;
            await saveLetters();
            renderLetterUI(); 
        }

        const taName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
        const dateStr = new Date(l.ts).toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric' });
        
        document.getElementById('ml-list-area').style.display = 'none';
        document.getElementById('ml-detail').style.display = 'flex';
        
        const contentEl = document.getElementById('ml-detail-content');
        contentEl.textContent = l.content;
        contentEl.classList.remove('expanded');

        // 判断是否需要显示“展开全文”按钮
        const expandBtn = document.getElementById('ml-expand-btn');
        if (l.content.length > 150) { // 如果字数超过 150，就显示展开按钮
            expandBtn.style.display = 'block';
            expandBtn.innerHTML = '展开全文 ▼';
        } else {
            expandBtn.style.display = 'none';
        }

        document.getElementById('ml-detail-sign').innerHTML = `${taName}<br><span style="font-size:12px;opacity:0.7;margin-top:8px;display:inline-block;">${dateStr}</span>`;

        const paper = document.getElementById('ml-paper-bg');
        if (letterBgImage) {
            paper.style.backgroundImage = `url(${letterBgImage})`;
            paper.classList.add('has-bg');
        } else {
            paper.style.backgroundImage = '';
            paper.classList.remove('has-bg');
        }
    };

    window._mlToggleExpand = function() {
        const contentEl = document.getElementById('ml-detail-content');
        const btn = document.getElementById('ml-expand-btn');
        isExpanded = !isExpanded;
        if (isExpanded) {
            contentEl.classList.add('expanded');
            btn.innerHTML = '收起内容 ▲';
        } else {
            contentEl.classList.remove('expanded');
            btn.innerHTML = '展开全文 ▼';
            // 收起时滚动到信纸顶部，方便阅读
            document.querySelector('.ml-scroll-area').scrollTop = 0;
        }
    };

    window._mlCloseDetail = function() {
        currentViewingId = null;
        document.getElementById('ml-detail').style.display = 'none';
        document.getElementById('ml-list-area').style.display = 'flex';
    };

    window._mlDeleteCurrent = async function() {
        if (!currentViewingId) return;
        if (!confirm('确定要撕毁这封信吗？撕毁后将无法恢复。')) return;
        letters = letters.filter(x => x.id !== currentViewingId);
        await saveLetters();
        window._mlCloseDetail();
        renderLetterUI();
        if (typeof showNotification === 'function') showNotification('信件已撕毁', 'info');
    };

    function bindEvents() {
        document.getElementById('ml-close-btn').onclick = () => {
            document.getElementById('mochi-letter-container').classList.remove('show');
            isLetterOpen = false;
        };

        const bgBtn = document.getElementById('ml-change-bg-btn');
        if (bgBtn) {
            bgBtn.onclick = () => {
                const picker = document.createElement('input');
                picker.type = 'file';
                picker.accept = 'image/*';
                picker.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (typeof showNotification === 'function') showNotification('正在处理背景...', 'info');
                    try {
                        if (typeof optimizeImage === 'function') {
                            const b64 = await optimizeImage(file, 800, 0.7);
                            await saveLetterBg(b64);
                            const paper = document.getElementById('ml-paper-bg');
                            paper.style.backgroundImage = `url(${b64})`;
                            paper.classList.add('has-bg');
                            if (typeof showNotification === 'function') showNotification('信纸背景已更新', 'success');
                        }
                    } catch (err) {}
                    e.target.value = '';
                };
                picker.click();
            };
        }
    }

    loadLetters().then(() => {
        injectStyle();
        hookSimulateReply();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setInterval(addLetterEntry, 2000));
        } else {
            setInterval(addLetterEntry, 2000);
        }
    });

    window.openMochiLetterBox = openLetterBox;
})();
