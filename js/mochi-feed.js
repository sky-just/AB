// js/mochi-feed.js
// 仿微信朋友圈模块（支持换背景、评论、发表提示、选图预览、删除动态）

(function() {
    'use strict';

    const FEED_STORAGE_KEY = (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'chatapp_') + 'mochiFeedPosts';
    const FEED_BG_KEY = (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'chatapp_') + 'mochiFeedBg';
    
    let feedPosts = [];
    let feedBgImage = '';
    let isFeedOpen = false;
    let pendingImages = []; // 待发布的图片
    let replyTarget = null; // 当前正在回复的目标 { pid, name }

    // 注入专属 CSS
    function injectStyle() {
        if (document.getElementById('mochi-feed-style')) return;
        const style = document.createElement('style');
        style.id = 'mochi-feed-style';
        style.textContent = `
            #mochi-feed-container { position: fixed; inset: 0; z-index: 99990; background: #f7f7f7; color: #333; display: none; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, "PingFang SC", "Microsoft YaHei", Arial, sans-serif; }
            html[data-theme="dark"] #mochi-feed-container { background: #111; color: #d3d3d3; }
            #mochi-feed-container.show { display: flex; animation: mfSlideIn 0.3s ease; }
            
            .mf-header { height: 220px; position: relative; background: linear-gradient(135deg, #2c3e50, #000); background-size: cover; background-position: center; cursor: pointer; flex-shrink: 0; }
            .mf-back-btn { position: absolute; top: 16px; left: 16px; background: rgba(0,0,0,0.4); color: #fff; border: none; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; font-size: 18px; cursor: pointer; z-index: 10; }
            .mf-user-info { position: absolute; right: 20px; bottom: -20px; display: flex; align-items: center; gap: 12px; z-index: 10; }
            .mf-user-name { font-size: 16px; font-weight: 600; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.5); margin-bottom: 20px; }
            .mf-user-avatar { width: 70px; height: 70px; border-radius: 12px; border: 3px solid #fff; background: #eee; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; overflow: hidden; }
            html[data-theme="dark"] .mf-user-avatar { border-color: #111; background: #222; }
            .mf-user-avatar img { width: 100%; height: 100%; object-fit: cover; }

            .mf-scroll-area { flex: 1; overflow-y: auto; padding: 40px 0 120px 0; }
            
            .mf-post-item { background: #fff; padding: 16px 20px; display: flex; gap: 12px; border-bottom: 1px solid #f0f0f0; }
            html[data-theme="dark"] .mf-post-item { background: #1a1a1a; border-bottom: 1px solid #222; }
            
            .mf-post-av { width: 42px; height: 42px; border-radius: 6px; overflow: hidden; flex-shrink: 0; background: #eee; }
            .mf-post-av img { width: 100%; height: 100%; object-fit: cover; }
            .mf-post-main { flex: 1; min-width: 0; position: relative; }
            
            .mf-post-author { font-size: 15px; font-weight: 600; color: #576b95; margin-bottom: 4px; }
            .mf-del-btn { position: absolute; top: 0; right: 0; color: #bbb; cursor: pointer; padding: 4px; font-size: 14px; }
            .mf-del-btn:hover { color: #ff4757; }
            
            .mf-post-content { font-size: 14.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; margin-bottom: 8px; }
            
            .mf-imgs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-bottom: 10px; width: 80%; max-width: 240px; }
            .mf-imgs.single { grid-template-columns: 1fr; width: 60%; max-width: 180px; }
            .mf-imgs img { width: 100%; aspect-ratio: 1/1; object-fit: cover; border-radius: 4px; cursor: pointer; }
            .mf-imgs.single img { aspect-ratio: auto; max-height: 240px; object-fit: contain; background: #f0f0f0; }
            
            .mf-post-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
            .mf-post-time { font-size: 12px; color: #999; }
            .mf-actions { display: flex; gap: 8px; }
            .mf-action-btn { background: #f7f7f7; border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 12px; color: #576b95; display: flex; gap: 4px; align-items: center; }
            html[data-theme="dark"] .mf-action-btn { background: #2a2a2a; color: #d3d3d3; }
            
            .mf-interact-box { background: #f7f7f7; border-radius: 4px; padding: 6px 10px; margin-top: 8px; font-size: 13.5px; line-height: 1.6; }
            html[data-theme="dark"] .mf-interact-box { background: #2a2a2a; }
            .mf-likes { color: #576b95; font-weight: 500; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; margin-bottom: 4px; display: flex; gap: 4px; }
            html[data-theme="dark"] .mf-likes { border-bottom-color: #444; }
            .mf-comment-item { margin-bottom: 2px; }
            .mf-c-name { color: #576b95; font-weight: 500; }
            
            .mf-pub-wrap { position: absolute; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #e5e5e5; display: flex; flex-direction: column; z-index: 10; transition: height 0.2s; }
            html[data-theme="dark"] .mf-pub-wrap { background: #1a1a1a; border-top-color: #333; }
            
            .mf-preview-area { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 16px 0; }
            .mf-preview-item { position: relative; width: 60px; height: 60px; border-radius: 4px; overflow: hidden; background: #f0f0f0; }
            .mf-preview-item img { width: 100%; height: 100%; object-fit: cover; }
            .mf-preview-del { position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); color: #fff; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 12px; cursor: pointer; }
            
            .mf-pub-bar { display: flex; gap: 10px; padding: 10px 16px; align-items: center; }
            .mf-pub-input { flex: 1; border: none; background: #f7f7f7; padding: 10px 14px; border-radius: 20px; outline: none; font-size: 14px; color: inherit; }
            html[data-theme="dark"] .mf-pub-input { background: #2a2a2a; }
            .mf-pub-btn { background: #07c160; color: #fff; border: none; padding: 8px 16px; border-radius: 20px; font-weight: 600; cursor: pointer; }
            .mf-pub-camera { color: #576b95; font-size: 20px; cursor: pointer; padding: 6px; }
            
            .mf-toast { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.7); color: #fff; padding: 10px 20px; border-radius: 8px; font-size: 14px; z-index: 99999; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
            .mf-toast.show { opacity: 1; }

            @keyframes mfSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        `;
        document.head.appendChild(style);
    }

    function showToast(msg) {
        let container = document.getElementById('mochi-feed-container');
        let t = document.getElementById('mf-toast-el');
        if (!t) {
            t = document.createElement('div');
            t.id = 'mf-toast-el';
            t.className = 'mf-toast';
            container.appendChild(t);
        }
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.remove('show'), 2000);
    }

    function addFeedEntry() {
        const advList = document.querySelector('#advanced-modal .settings-item-list');
        if (!advList || document.getElementById('feed-function')) return;
        const item = document.createElement('div');
        item.className = 'settings-item';
        item.id = 'feed-function';
        item.innerHTML = '<i class="fas fa-camera-retro"></i><span>朋友圈</span>';
        item.addEventListener('click', () => {
            if (typeof hideModal === 'function') hideModal(document.getElementById('advanced-modal'));
            openFeed();
        });
        advList.appendChild(item);
    }

    function getMyAvatar() {
        const img = document.querySelector('#my-avatar img');
        return img ? img.src : '';
    }
    function getTaAvatar() {
        const img = document.querySelector('#partner-avatar img');
        return img ? img.src : '';
    }

    async function loadFeed() {
        try {
            if (window.localforage) {
                const data = await localforage.getItem(FEED_STORAGE_KEY);
                if (Array.isArray(data)) feedPosts = data;
                const bg = await localforage.getItem(FEED_BG_KEY);
                if (bg) feedBgImage = bg;
            } else {
                feedPosts = JSON.parse(localStorage.getItem(FEED_STORAGE_KEY) || '[]');
                feedBgImage = localStorage.getItem(FEED_BG_KEY) || '';
            }
        } catch (e) { feedPosts = []; }
        if (feedPosts.length === 0) setTimeout(triggerTaAutoPost, 3000);
    }

    async function saveFeed() {
        try {
            if (window.localforage) await localforage.setItem(FEED_STORAGE_KEY, feedPosts);
            else localStorage.setItem(FEED_STORAGE_KEY, JSON.stringify(feedPosts));
        } catch (e) {}
    }

    async function saveBg(bg) {
        feedBgImage = bg;
        try {
            if (window.localforage) await localforage.setItem(FEED_BG_KEY, bg);
            else localStorage.setItem(FEED_BG_KEY, bg);
        } catch (e) {}
    }

    function openFeed() {
        let container = document.getElementById('mochi-feed-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'mochi-feed-container';
            document.body.appendChild(container);
        }
        container.classList.add('show');
        isFeedOpen = true;
        renderFeedUI();
    }

    function renderFeedUI() {
        const container = document.getElementById('mochi-feed-container');
        const taName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
        const myName = (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';
        const myAv = getMyAvatar();
        const taAv = getTaAvatar();

        feedPosts.sort((a, b) => b.ts - a.ts);
        const bgStyle = feedBgImage ? `background-image: url(${feedBgImage}); background-size: cover; background-position: center;` : '';

        let html = `
            <div class="mf-header" id="mf-header-bg" style="${bgStyle}" title="点击更换朋友圈背景">
                <button class="mf-back-btn" id="mf-close-btn"><i class="fas fa-arrow-left"></i></button>
                <div class="mf-user-info">
                    <div class="mf-user-name">${myName}</div>
                    <div class="mf-user-avatar">${myAv ? `<img src="${myAv}">` : '<i class="fas fa-user" style="color:#aaa;font-size:24px"></i>'}</div>
                </div>
            </div>
            <div class="mf-scroll-area" id="mf-list">
        `;

        if (feedPosts.length === 0) {
            html += `<div style="text-align:center; padding: 50px 0; color:#999; font-size:13px;">还没有动态，发一条试试吧~</div>`;
        } else {
            feedPosts.forEach(p => {
                const av = p.author === 'me' ? myAv : taAv;
                const name = p.author === 'me' ? myName : taName;
                const isMe = p.author === 'me';
                
                let imgHtml = '';
                if (p.images && p.images.length > 0) {
                    const isSingle = p.images.length === 1;
                    imgHtml = `<div class="mf-imgs ${isSingle ? 'single' : ''}">`;
                    p.images.forEach(img => { imgHtml += `<img src="${img}" onclick="window.viewImage('${img}')">`; });
                    imgHtml += `</div>`;
                }
                let likesHtml = '';
                if (p.likes && p.likes.length > 0) {
                    likesHtml = `<div class="mf-likes"><i class="fas fa-heart" style="font-size:12px;margin-top:3px"></i> ${p.likes.join('，')}</div>`;
                }
                let commentsHtml = '';
                if (p.comments && p.comments.length > 0) {
                    commentsHtml = `<div style="margin-top:4px;">`;
                    p.comments.forEach(c => { commentsHtml += `<div class="mf-comment-item"><span class="mf-c-name">${c.author}</span>：${c.content}</div>`; });
                    commentsHtml += `</div>`;
                }
                const hasInteract = likesHtml || commentsHtml;

                html += `
                    <div class="mf-post-item">
                        <div class="mf-post-av">${av ? `<img src="${av}">` : ''}</div>
                        <div class="mf-post-main">
                            <div class="mf-post-author">${name}</div>
                            ${isMe ? `<i class="fas fa-trash mf-del-btn" onclick="window._mfDelete('${p.id}')" title="删除动态"></i>` : ''}
                            <div class="mf-post-content">${p.content || ''}</div>
                            ${imgHtml}
                            <div class="mf-post-footer">
                                <div class="mf-post-time">${formatTime(p.ts)}</div>
                                <div class="mf-actions">
                                    <button class="mf-action-btn" onclick="window._mfSetReply('${p.id}', '${name}')"><i class="far fa-comment"></i> 评论</button>
                                    <button class="mf-action-btn" onclick="window._mfLike('${p.id}')"><i class="far fa-heart"></i> 赞</button>
                                </div>
                            </div>
                            ${hasInteract ? `<div class="mf-interact-box">${likesHtml}${commentsHtml}</div>` : ''}
                        </div>
                    </div>
                `;
            });
        }

        // 底部发布/回复区
        html += `
            </div>
            <div class="mf-pub-wrap">
                <div class="mf-preview-area" id="mf-preview-area"></div>
                <div class="mf-pub-bar">
                    <i class="fas fa-camera mf-pub-camera" id="mf-pick-img" title="添加图片"></i>
                    <input type="text" class="mf-pub-input" id="mf-pub-text" placeholder="这一刻的想法...">
                    <button class="mf-pub-btn" id="mf-send-btn">发表</button>
                </div>
            </div>
        `;

        container.innerHTML = html;
        
        // 恢复之前的输入状态
        if (replyTarget) {
            document.getElementById('mf-pub-text').placeholder = `评论 ${replyTarget.name}：`;
        }
        renderPreview(); // 恢复图片预览
        bindEvents();
        
        setTimeout(() => { const list = document.getElementById('mf-list'); if (list) list.scrollTop = 0; }, 50);
    }

    // 渲染待发布图片
    function renderPreview() {
        const area = document.getElementById('mf-preview-area');
        if (!area) return;
        area.innerHTML = '';
        pendingImages.forEach((img, idx) => {
            const d = document.createElement('div');
            d.className = 'mf-preview-item';
            d.innerHTML = `<img src="${img}"><div class="mf-preview-del" onclick="window._mfRemoveImg(${idx})">×</div>`;
            area.appendChild(d);
        });
    }

    window._mfRemoveImg = function(idx) {
        pendingImages.splice(idx, 1);
        renderPreview();
    };

    window._mfDelete = async function(pid) {
        if (!confirm('确定删除这条动态吗？')) return;
        feedPosts = feedPosts.filter(x => x.id !== pid);
        await saveFeed();
        renderFeedUI();
        showToast('已删除');
    };

    window._mfSetReply = function(pid, name) {
        replyTarget = { pid, name };
        const input = document.getElementById('mf-pub-text');
        if (input) {
            input.placeholder = `评论 ${name}：`;
            input.focus();
        }
    };

    window._mfLike = async function(pid) {
        const post = feedPosts.find(x => x.id === pid);
        if (!post) return;
        const myName = (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';
        post.likes = post.likes || [];
        if (!post.likes.includes(myName)) {
            post.likes.push(myName);
            await saveFeed();
            renderFeedUI();
            if (post.author === 'ta' || Math.random() < 0.5) {
                setTimeout(async () => {
                    const taName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
                    if (!post.likes.includes(taName)) {
                        post.likes.push(taName);
                        await saveFeed();
                        if (isFeedOpen) renderFeedUI();
                    }
                }, 2000 + Math.random() * 2000);
            }
        }
    };

    function bindEvents() {
        document.getElementById('mf-close-btn').onclick = (e) => {
            e.stopPropagation();
            document.getElementById('mochi-feed-container').classList.remove('show');
            isFeedOpen = false;
            replyTarget = null;
        };

        const bgPicker = document.createElement('input');
        bgPicker.type = 'file';
        bgPicker.accept = 'image/*';
        bgPicker.style.display = 'none';
        document.body.appendChild(bgPicker);

        document.getElementById('mf-header-bg').onclick = () => bgPicker.click();
        bgPicker.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            showToast('正在处理背景...');
            try {
                if (typeof optimizeImage === 'function') {
                    const b64 = await optimizeImage(file, 800, 0.7);
                    await saveBg(b64);
                    renderFeedUI();
                    showToast('背景已更换');
                }
            } catch (err) {}
            e.target.value = '';
        };

        const imgPicker = document.createElement('input');
        imgPicker.type = 'file';
        imgPicker.accept = 'image/*';
        imgPicker.multiple = true;
        imgPicker.style.display = 'none';
        document.body.appendChild(imgPicker);

        document.getElementById('mf-pick-img').onclick = () => imgPicker.click();
        imgPicker.onchange = async (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;
            showToast('正在处理图片...');
            for (const file of files) {
                try {
                    if (typeof optimizeImage === 'function') {
                        const b64 = await optimizeImage(file, 600, 0.7);
                        pendingImages.push(b64);
                    } else {
                        const b64 = await new Promise(r => { const rd = new FileReader(); rd.onload = ev => r(ev.target.result); rd.readAsDataURL(file); });
                        pendingImages.push(b64);
                    }
                } catch (err) {}
            }
            showToast(`已添加 ${files.length} 张图片`);
            renderPreview();
            e.target.value = '';
        };

        document.getElementById('mf-send-btn').onclick = async () => {
            const input = document.getElementById('mf-pub-text');
            const text = input.value.trim();
            if (!text && pendingImages.length === 0) return;

            // 判断是评论还是发动态
            if (replyTarget) {
                const post = feedPosts.find(x => x.id === replyTarget.pid);
                if (post) {
                    const myName = (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';
                    post.comments = post.comments || [];
                    post.comments.push({ author: myName, content: text });
                    await saveFeed();
                    
                    showToast('评论成功');
                    input.value = '';
           replyTarget = null;
                    renderFeedUI();

                    // 触发 TA 回复评论
                    setTimeout(async () => {
                        const taName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
                        let taReply = "嗯嗯，确实。";
                        if (typeof customReplies !== 'undefined' && customReplies.length > 0) {
                            taReply = customReplies[Math.floor(Math.random() * customReplies.length)];
                        }
                        post.comments.push({ author: taName, content: taReply });
                        await saveFeed();
                        if (isFeedOpen) renderFeedUI();
                    }, 2000 + Math.random() * 3000);
                }
                return;
            }

            // 发新动态
            const newPost = {
                id: 'p_' + Date.now(),
                author: 'me',
                content: text,
                images: pendingImages,
                ts: Date.now(),
                likes: [],
                comments: []
            };
            feedPosts.unshift(newPost);
            await saveFeed();
            pendingImages = [];
            input.value = '';
            
            showToast('发表成功');
            renderFeedUI();
            triggerTaInteract(newPost);
        };
    }

    function triggerTaInteract(post) {
        const taName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
        const chance = Math.random();
        if (chance < 0.3) {
            setTimeout(async () => {
                let taMsg = "真好呀~";
                if (typeof customReplies !== 'undefined' && customReplies.length > 0) {
                    taMsg = customReplies[Math.floor(Math.random() * customReplies.length)];
                }
                post.comments = post.comments || [];
                post.comments.push({ author: taName, content: taMsg });
                await saveFeed();
                if (isFeedOpen) renderFeedUI();
            }, 3000 + Math.random() * 3000);
        } else if (chance < 0.8) {
            setTimeout(async () => {
                post.likes = post.likes || [];
                if (!post.likes.includes(taName)) {
                    post.likes.push(taName);
                    await saveFeed();
                    if (isFeedOpen) renderFeedUI();
                }
            }, 2000 + Math.random() * 2000);
        }
    }

    function triggerTaAutoPost() {
        if (feedPosts.length > 20) return;
        let content = "今天天气真好，适合发呆。";
        if (typeof customReplies !== 'undefined' && customReplies.length > 0) {
            content = customReplies[Math.floor(Math.random() * customReplies.length)];
        }
        const newPost = {
            id: 'p_ta_' + Date.now(),
            author: 'ta',
            content: content,
            images: [],
            ts: Date.now() - 1000 * 60 * Math.random() * 60,
            likes: [],
            comments: []
        };
        feedPosts.unshift(newPost);
        saveFeed();
        if (isFeedOpen) renderFeedUI();
    }

    function formatTime(ts) {
        const diff = Date.now() - ts;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
        const d = new Date(ts);
        return `${d.getMonth()+1}月${d.getDate()}日`;
    }

    loadFeed().then(() => {
        injectStyle();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(addFeedEntry, 1500));
        } else {
            setTimeout(addFeedEntry, 1500);
        }
        setInterval(() => {
            if (Math.random() < 0.1) triggerTaAutoPost();
        }, 1000 * 60 * 5);
    });

    window.openMochiFeed = openFeed;
})();
