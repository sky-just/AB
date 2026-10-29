// js/mochi-feed.js
// 仿微信朋友圈模块（精简适配 A 项目，绝不破坏原界面）

(function() {
    'use strict';

    const FEED_STORAGE_KEY = (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'chatapp_') + 'mochiFeedPosts';
    let feedPosts = [];
    let isFeedOpen = false;

    // 初始化：注入样式和高级功能入口
    function init() {
        injectStyle();
        const boot = () => {
            setTimeout(addFeedEntry, 1500);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', boot);
        } else {
            boot();
        }
    }

    // 注入专属 CSS（仿微信风格）
    function injectStyle() {
        if (document.getElementById('mochi-feed-style')) return;
        const style = document.createElement('style');
        style.id = 'mochi-feed-style';
        style.textContent = `
            #mochi-feed-container {
                position: fixed; inset: 0; z-index: 99990;
                background: #f7f7f7; color: #333;
                display: none; flex-direction: column;
                font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif;
            }
            html[data-theme="dark"] #mochi-feed-container { background: #111; color: #d3d3d3; }
            #mochi-feed-container.show { display: flex; animation: mfSlideIn 0.3s ease; }
            
            .mf-header {
                height: 220px; position: relative;
                background: linear-gradient(135deg, #2c3e50, #000);
                background-size: cover; background-position: center;
            }
            html[data-theme="dark"] .mf-header { background: linear-gradient(135deg, #1a1a1a, #000); }
            
            .mf-back-btn {
                position: absolute; top: 16px; left: 16px;
                background: rgba(0,0,0,0.4); color: #fff;
                border: none; border-radius: 50%; width: 36px; height: 36px;
                display: flex; align-items: center; justify-content: center;
                font-size: 18px; cursor: pointer; z-index: 10;
            }
            
            .mf-user-info {
                position: absolute; right: 20px; bottom: -20px;
                display: flex; align-items: center; gap: 12px; z-index: 10;
            }
            .mf-user-name { font-size: 16px; font-weight: 600; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.5); margin-bottom: 20px; }
            .mf-user-avatar {
                width: 70px; height: 70px; border-radius: 12px;
                border: 3px solid #fff; background: #eee;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                display: flex; align-items: center; justify-content: center; overflow: hidden;
            }
            html[data-theme="dark"] .mf-user-avatar { border-color: #111; background: #222; }
            .mf-user-avatar img { width: 100%; height: 100%; object-fit: cover; }

            .mf-scroll-area { flex: 1; overflow-y: auto; padding: 40px 0 80px 0; }
            
            .mf-post-item {
                background: #fff; padding: 16px 20px;
                display: flex; gap: 12px; border-bottom: 1px solid #f0f0f0;
            }
            html[data-theme="dark"] .mf-post-item { background: #1a1a1a; border-bottom: 1px solid #222; }
            
            .mf-post-av { width: 42px; height: 42px; border-radius: 6px; overflow: hidden; flex-shrink: 0; background: #eee; }
            .mf-post-av img { width: 100%; height: 100%; object-fit: cover; }
            html[data-theme="dark"] .mf-post-av { background: #333; }
            
            .mf-post-main { flex: 1; min-width: 0; }
            .mf-post-author { font-size: 15px; font-weight: 600; color: #576b95; margin-bottom: 4px; }
            .mf-post-content { font-size: 14.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; margin-bottom: 8px; }
            
            /* 微信九宫格 */
            .mf-imgs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-bottom: 10px; width: 80%; max-width: 240px; }
            .mf-imgs.single { grid-template-columns: 1fr; width: 60%; max-width: 180px; }
            .mf-imgs img { width: 100%; aspect-ratio: 1/1; object-fit: cover; border-radius: 4px; cursor: pointer; }
            .mf-imgs.single img { aspect-ratio: auto; max-height: 240px; object-fit: contain; background: #f0f0f0; }
            
            .mf-post-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
            .mf-post-time { font-size: 12px; color: #999; }
            .mf-action-btn { background: #f7f7f7; border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 12px; color: #576b95; display: flex; gap: 4px; align-items: center; }
            html[data-theme="dark"] .mf-action-btn { background: #2a2a2a; color: #d3d3d3; }
            
            /* 点赞和评论区 */
            .mf-interact-box { background: #f7f7f7; border-radius: 4px; padding: 6px 10px; margin-top: 8px; font-size: 13.5px; line-height: 1.6; }
            html[data-theme="dark"] .mf-interact-box { background: #2a2a2a; }
            .mf-likes { color: #576b95; font-weight: 500; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; margin-bottom: 4px; display: flex; gap: 4px; }
            html[data-theme="dark"] .mf-likes { border-bottom-color: #444; }
            .mf-comment-item { margin-bottom: 2px; }
            .mf-c-name { color: #576b95; font-weight: 500; }
            
            /* 发布栏 */
            .mf-pub-bar {
                position: absolute; bottom: 0; left: 0; right: 0;
                background: #fff; padding: 10px 16px; display: flex; gap: 10px;
                border-top: 1px solid #e5e5e5; align-items: center;
            }
            html[data-theme="dark"] .mf-pub-bar { background: #1a1a1a; border-top-color: #333; }
            .mf-pub-input { flex: 1; border: none; background: #f7f7f7; padding: 10px 14px; border-radius: 20px; outline: none; font-size: 14px; color: inherit; }
            html[data-theme="dark"] .mf-pub-input { background: #2a2a2a; }
            .mf-pub-btn { background: #07c160; color: #fff; border: none; padding: 8px 16px; border-radius: 20px; font-weight: 600; cursor: pointer; }
            .mf-pub-camera { color: #576b95; font-size: 20px; cursor: pointer; padding: 6px; }

            @keyframes mfSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        `;
        document.head.appendChild(style);
    }

    // 在高级功能中添加入口
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

    // 获取 A 项目的头像
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
            } else {
                feedPosts = JSON.parse(localStorage.getItem(FEED_STORAGE_KEY) || '[]');
            }
        } catch (e) { feedPosts = []; }
        
        // 如果是第一次玩，自动让 TA 发一条动态
        if (feedPosts.length === 0) {
            setTimeout(triggerTaAutoPost, 3000);
        }
    }

    async function saveFeed() {
        try {
            if (window.localforage) await localforage.setItem(FEED_STORAGE_KEY, feedPosts);
            else localStorage.setItem(FEED_STORAGE_KEY, JSON.stringify(feedPosts));
        } catch (e) {}
    }

    // 打开朋友圈界面
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

    // 渲染整个页面
    function renderFeedUI() {
        const container = document.getElementById('mochi-feed-container');
        const taName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
        const myName = (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';
        const myAv = getMyAvatar();
        const taAv = getTaAvatar();

        // 按时间倒序
        feedPosts.sort((a, b) => b.ts - a.ts);

        let html = `
            <div class="mf-header">
                <button class="mf-back-btn" id="mf-close-btn"><i class="fas fa-arrow-left"></i></button>
                <div class="mf-user-info">
                    <div class="mf-user-name">${myName}</div>
                    <div class="mf-user-avatar">
                        ${myAv ? `<img src="${myAv}">` : '<i class="fas fa-user" style="color:#aaa;font-size:24px"></i>'}
                    </div>
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
                
                // 图片九宫格处理
                let imgHtml = '';
                if (p.images && p.images.length > 0) {
                    const isSingle = p.images.length === 1;
                    imgHtml = `<div class="mf-imgs ${isSingle ? 'single' : ''}">`;
                    p.images.forEach(img => {
                        imgHtml += `<img src="${img}" onclick="window.viewImage('${img}')">`;
                    });
                    imgHtml += `</div>`;
                }

                // 点赞区
                let likesHtml = '';
                if (p.likes && p.likes.length > 0) {
                    likesHtml = `<div class="mf-likes"><i class="fas fa-heart" style="font-size:12px;margin-top:3px"></i> ${p.likes.join('，')}</div>`;
                }

                // 评论区
                let commentsHtml = '';
                if (p.comments && p.comments.length > 0) {
                    commentsHtml = `<div style="margin-top:4px;">`;
                    p.comments.forEach(c => {
                        commentsHtml += `<div class="mf-comment-item"><span class="mf-c-name">${c.author}</span>：${c.content}</div>`;
                    });
                    commentsHtml += `</div>`;
                }

                const hasInteract = likesHtml || commentsHtml;

                html += `
                    <div class="mf-post-item">
                        <div class="mf-post-av">${av ? `<img src="${av}">` : ''}</div>
                        <div class="mf-post-main">
                            <div class="mf-post-author">${name}</div>
                            <div class="mf-post-content">${p.content || ''}</div>
                            ${imgHtml}
                            <div class="mf-post-footer">
                                <div class="mf-post-time">${formatTime(p.ts)}</div>
                                <button class="mf-action-btn" onclick="window._mfLike('${p.id}')">
                                    <i class="far fa-heart"></i> 赞
                                </button>
                            </div>
                            ${hasInteract ? `<div class="mf-interact-box">${likesHtml}${commentsHtml}</div>` : ''}
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>
            <div class="mf-pub-bar">
                <i class="fas fa-camera mf-pub-camera" id="mf-pick-img" title="添加图片"></i>
                <input type="text" class="mf-pub-input" id="mf-pub-text" placeholder="这一刻的想法...">
                <button class="mf-pub-btn" id="mf-send-btn">发表</button>
            </div>
        `;

        container.innerHTML = html;
        bindEvents();
        
        // 滚动到底部（看最新）
        setTimeout(() => {
            const list = document.getElementById('mf-list');
            if (list) list.scrollTop = 0;
        }, 50);
    }

    // 全局点赞
    window._mfLike = async function(pid) {
        const post = feedPosts.find(x => x.id === pid);
        if (!post) return;
        const myName = (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';
        post.likes = post.likes || [];
        if (!post.likes.includes(myName)) {
            post.likes.push(myName);
            await saveFeed();
            renderFeedUI();
            
            // TA 有一定几率回赞
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

    // 绑定发布和图片选择事件
    function bindEvents() {
        document.getElementById('mf-close-btn').onclick = () => {
            document.getElementById('mochi-feed-container').classList.remove('show');
            isFeedOpen = false;
        };

        let pendingImages = [];
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
            if (typeof showNotification === 'function') showNotification('正在处理图片...', 'info');
            
            for (const file of files) {
                try {
                    // 借用 A 项目的图片压缩
                    if (typeof optimizeImage === 'function') {
                        const b64 = await optimizeImage(file, 600, 0.7);
                        pendingImages.push(b64);
                    } else {
                        // 兜底
                        const b64 = await new Promise(r => { const rd = new FileReader(); rd.onload = ev => r(ev.target.result); rd.readAsDataURL(file); });
                        pendingImages.push(b64);
                    }
                } catch (err) {}
            }
            if (typeof showNotification === 'function') showNotification(`已添加 ${pendingImages.length} 张图片`, 'success');
            e.target.value = '';
        };

        document.getElementById('mf-send-btn').onclick = async () => {
            const text = document.getElementById('mf-pub-text').value.trim();
            if (!text && pendingImages.length === 0) return;

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
            renderFeedUI();

            // 触发 TA 的互动或自己发动态
            triggerTaInteract(newPost);
        };
    }

    // TA 互动逻辑（点赞/评论我的新动态）
    function triggerTaInteract(post) {
        const taName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
        const chance = Math.random();

        // 30% 概率评论
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
        } 
        // 50% 概率点赞
        else if (chance < 0.8) {
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

    // TA 自动发动态
    function triggerTaAutoPost() {
        if (feedPosts.length > 20) return; // 限制
        const taName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
        
        let content = "今天天气真好，适合发呆。";
        if (typeof customReplies !== 'undefined' && customReplies.length > 0) {
            content = customReplies[Math.floor(Math.random() * customReplies.length)];
        }

        const newPost = {
            id: 'p_ta_' + Date.now(),
            author: 'ta',
            content: content,
            images: [],
            ts: Date.now() - 1000 * 60 * Math.random() * 60, // 随机几分钟前
            likes: [],
            comments: []
        };

        feedPosts.unshift(newPost);
        saveFeed();
        
        // 如果当前朋友圈开着，刷新一下
        if (isFeedOpen) renderFeedUI();
    }

    // 时间格式化
    function formatTime(ts) {
        const diff = Date.now() - ts;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
        const d = new Date(ts);
        return `${d.getMonth()+1}月${d.getDate()}日`;
    }

    // 初始化并加载数据
    loadFeed().then(() => {
        init();
        // 后台静默：每隔一段时间 TA 可能自己发个朋友圈
        setInterval(() => {
            if (Math.random() < 0.1) triggerTaAutoPost();
        }, 1000 * 60 * 5);
    });

    window.openMochiFeed = openFeed;

})();
