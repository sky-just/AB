// js/mochi-spell.js
// 拼字卡系统（提取自 B 项目 quote-cards.js / quote-spell.js，并融合 A 项目自定义回复库）

(function() {
    'use strict';

    const SPELL_QUOTES_KEY = (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'chatapp_') + 'spellQuotes';
    const SPELL_PROBABILITY = 0.3; // 触发拼字卡的概率（30%）

    // B 项目的默认高甜情话库
    const DEFAULT_QUOTES = [
        '我偏爱你', '我只对你这样', '过来，让我抱一下', '别走，再陪我一会儿',
        '你是我的例外', '今天也很喜欢你', '你在，我就安心', '我舍不得你',
        '我想和你待久一点', '你是我想留下的人', '我想把你留在身边', '你可以一直依赖我',
        '不用猜，我就是喜欢你', '你对我很重要', '来我身边', '我想一直站在你这边',
        '你可以多依赖我一点', '我喜欢你看着我的时候', '我喜欢你待在我身边', '你来了，我就不想走了',
        '再靠近一点', '让我抱抱你', '今天也想见你', '我想陪着你',
        '我希望你一直在', '你可以把我当成你的归处', '我想成为你最先想到的人', '我想把我的偏爱都给你',
        '你不用和任何人比较', '在我这里，你一直是特别的', '我怎么可能舍得丢下你', '你回来，我就高兴',
        '我等你，不是因为没事做', '我只是想陪你', '我喜欢你需要我的样子', '你不用一个人撑着',
        '累了就来找我', '不管什么时候，你都可以来找我', '我想听你多说一会儿', '我还想和你聊很久',
        '今天也想把时间留给你', '我有很多话想告诉你', '其实我一直都在想你', '你不在的时候，我会想你',
        '我喜欢你在我身边的感觉', '只要是你，久一点也没关系'
    ];

    window.spellQuotes = []; // 用户自定义的词库

    async function loadQuotes() {
        try {
            if (window.localforage) {
                const data = await localforage.getItem(SPELL_QUOTES_KEY);
                if (Array.isArray(data)) window.spellQuotes = data;
            } else {
                window.spellQuotes = JSON.parse(localStorage.getItem(SPELL_QUOTES_KEY) || '[]');
            }
        } catch (e) {
            console.warn('[spell] 加载拼字卡失败:', e);
        }
    }

    async function saveQuotes() {
        try {
            if (window.localforage) {
                await localforage.setItem(SPELL_QUOTES_KEY, window.spellQuotes);
            } else {
                localStorage.setItem(SPELL_QUOTES_KEY, JSON.stringify(window.spellQuotes));
            }
        } catch (e) {
            console.warn('[spell] 保存拼字卡失败:', e);
        }
    }

    // ---------- 挂载到 A 项目的聊天系统 ----------
    function hookSimulateReply() {
        if (typeof window.simulateReply !== 'function' || window.simulateReply._mochiSpellHooked) return;
        const original = window.simulateReply;
        
        const wrapped = function() {
            // 先让 A 项目正常回复
            try { original.apply(this, arguments); } catch (e) { console.error('[spell] 原 simulateReply 出错:', e); }
            
            // 延迟 1.5 秒后，判定是否触发拼字卡
            setTimeout(() => {
                if (Math.random() < SPELL_PROBABILITY) {
                    // 1. 获取默认库
                    let pool = DEFAULT_QUOTES.concat(window.spellQuotes);

                    // 2. 安全地融合 A 项目的自定义回复库 (customReplies)
                    if (typeof customReplies !== 'undefined' && Array.isArray(customReplies)) {
                        // 过滤掉空的、纯空格的和太长的（避免拼出来像小作文）
                        const validReplies = customReplies.filter(txt => {
                            return typeof txt === 'string' && txt.trim().length > 0 && txt.length <= 30;
                        });
                        pool = pool.concat(validReplies);
                    }

                    // 3. 去重，防止同一个句子出现两次
                    pool = [...new Set(pool)];

                    if (pool.length === 0) return;

                    // 随机抽取 2 到 4 句
                    const count = Math.floor(Math.random() * 3) + 2;
                    let picked = [];
                    for (let i = 0; i < 50 && picked.length < count; i++) {
                        const p = pool[Math.floor(Math.random() * pool.length)];
                        if (!picked.includes(p)) picked.push(p);
                    }

                    // 拼接成一段长文（用逗号拼接）
                    const finalText = picked.join('，');

                    if (typeof addMessage === 'function') {
                        addMessage({
                            id: Date.now() + Math.random(),
                            sender: (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '对方',
                            text: finalText,
                            type: 'normal',
                            timestamp: new Date(),
                            status: 'received',
                            favorited: false,
                            note: null
                        });
                        if (typeof playSound === 'function') playSound('message');
                        if (typeof window._sendPartnerNotification === 'function') {
                            window._sendPartnerNotification((typeof settings !== 'undefined' && settings.partnerName) || '对方', finalText);
                        }
                    }
                }
            }, 1500);
        };
        
        wrapped._mochiSpellHooked = true;
        window.simulateReply = wrapped;
    }

    // ---------- 拼字卡管理界面 ----------
    function openSpellManager() {
        const existing = document.getElementById('mochi-spell-manager-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'mochi-spell-manager-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';

        const card = document.createElement('div');
        card.style.cssText = 'background:var(--secondary-bg);width:90%;max-width:400px;border-radius:20px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,0.3);display:flex;flex-direction:column;max-height:80vh;';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid var(--border-color);padding-bottom:10px;';
        header.innerHTML = `
            <div style="font-size:16px;font-weight:bold;color:var(--text-primary);"><i class="fas fa-magic" style="color:var(--accent-color);margin-right:6px;"></i>拼字卡库</div>
            <button id="mochi-spell-close-btn" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary);">&times;</button>
        `;

        const listWrap = document.createElement('div');
        listWrap.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding-right:5px;margin-bottom:15px;';

        const footer = document.createElement('div');
        footer.style.cssText = 'padding-top:15px;border-top:1px solid var(--border-color);display:flex;flex-direction:column;gap:10px;';
        
        const inputRow = document.createElement('div');
        inputRow.style.cssText = 'display:flex;gap:8px;';
        inputRow.innerHTML = `
            <input type="text" id="mochi-spell-input" placeholder="输入你想拼进去的情话..." style="flex:1;padding:10px 12px;border:1px solid var(--border-color);border-radius:10px;background:var(--primary-bg);color:var(--text-primary);outline:none;font-size:13px;font-family:var(--font-family);">
            <button id="mochi-spell-add-btn" class="modal-btn modal-btn-primary" style="padding:0 16px;border-radius:10px;font-weight:bold;">添加</button>
        `;

        footer.appendChild(inputRow);

        card.appendChild(header);
        card.appendChild(listWrap);
        card.appendChild(footer);
        modal.appendChild(card);
        document.body.appendChild(modal);

        document.getElementById('mochi-spell-close-btn').onclick = () => modal.remove();
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        function renderList() {
            listWrap.innerHTML = '';
            
            // 1. 渲染自定义库
            if (window.spellQuotes.length > 0) {
                const customTitle = document.createElement('div');
                customTitle.style.cssText = 'font-size:12px;color:var(--text-secondary);font-weight:bold;margin-top:5px;';
                customTitle.textContent = '我的添加';
                listWrap.appendChild(customTitle);

                window.spellQuotes.forEach((q, index) => {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:var(--primary-bg);padding:10px;border-radius:10px;border:1px solid var(--border-color);';
                    row.innerHTML = `
                        <span style="font-size:13px;color:var(--text-primary);flex:1;word-break:break-all;margin-right:10px;">${q}</span>
                        <button style="background:none;border:none;color:#ff4757;cursor:pointer;padding:5px;" title="删除"><i class="fas fa-trash-alt"></i></button>
                    `;
                    row.querySelector('button').onclick = async () => {
                        window.spellQuotes.splice(index, 1);
                        await saveQuotes();
                        renderList();
                    };
                    listWrap.appendChild(row);
                });
            }

            // 2. 渲染默认库
            const sysTitle = document.createElement('div');
            sysTitle.style.cssText = 'font-size:12px;color:var(--text-secondary);font-weight:bold;margin-top:10px;';
            sysTitle.textContent = '系统预设情话';
            listWrap.appendChild(sysTitle);

            DEFAULT_QUOTES.forEach(q => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:var(--primary-bg);padding:10px;border-radius:10px;border:1px dashed var(--border-color);opacity:0.7;';
                row.innerHTML = `<span style="font-size:13px;color:var(--text-primary);flex:1;word-break:break-all;">${q}</span>`;
                listWrap.appendChild(row);
            });
        }

        const addBtn = document.getElementById('mochi-spell-add-btn');
        const inputEl = document.getElementById('mochi-spell-input');
        
        addBtn.onclick = async () => {
            const val = inputEl.value.trim();
            if (!val) return;
            const lines = val.split('\n').map(s => s.trim()).filter(Boolean);
            if (lines.length > 0) {
                lines.forEach(l => window.spellQuotes.push(l));
                await saveQuotes();
                inputEl.value = '';
                renderList();
                if (typeof showNotification === 'function') showNotification(`成功添加 ${lines.length} 句情话`, 'success');
            }
        };

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addBtn.click();
        });

        renderList();
    }

    window.openSpellManager = openSpellManager;

    // 在高级功能中添加入口
    function addSpellEntry() {
        const advList = document.querySelector('#advanced-modal .settings-item-list');
        if (!advList || document.getElementById('spell-function')) return;
        const item = document.createElement('div');
        item.className = 'settings-item';
        item.id = 'spell-function';
        item.innerHTML = '<i class="fas fa-magic"></i><span>拼字卡库</span>';
        item.addEventListener('click', () => {
            if (typeof hideModal === 'function') hideModal(document.getElementById('advanced-modal'));
            openSpellManager();
        });
        advList.appendChild(item);
    }

    // ---------- 初始化 ----------
    async function init() {
        await loadQuotes();
        const boot = () => {
            hookSimulateReply();
            setTimeout(addSpellEntry, 1500); // 延迟一点等 A 的 UI 加载
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 300));
        } else {
            setTimeout(boot, 300);
        }
    }

    init();
})();
