// js/mochi-video.js
// 视频发送模块（限制 15MB，自动适配 A 项目气泡）

(function() {
    'use strict';

    // 限制视频大小 15MB，防止本地存储撑爆
    const MAX_VIDEO_SIZE = 15 * 1024 * 1024;

    // 1. 注入 UI 按钮
    function initUI() {
        const inputArea = document.querySelector('.input-buttons');
        if (!inputArea || document.getElementById('video-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'video-btn';
        btn.className = 'input-btn collapse-hideable';
        btn.title = '发送视频';
        btn.innerHTML = '<i class="fas fa-video"></i>';
        
        // 插到麦克风旁边，或者放到最前面
        const voiceBtn = document.getElementById('voice-btn');
        if (voiceBtn) {
            inputArea.insertBefore(btn, voiceBtn.nextSibling);
        } else {
            inputArea.insertBefore(btn, inputArea.firstChild);
        }

        // 创建隐藏的文件选择器
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'video/*';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        btn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            handleVideoFile(file);
            fileInput.value = ''; // 清空，允许重复选
        });
    }

    // 2. 处理视频文件
    function handleVideoFile(file) {
        if (file.size > MAX_VIDEO_SIZE) {
            if (typeof showNotification === 'function') {
                showNotification(`视频太大（${(file.size/1024/1024).toFixed(1)}MB），请小于 15MB`, 'warning', 3000);
            }
            return;
        }

        if (typeof showNotification === 'function') {
            showNotification('正在读取视频，请稍候...', 'info', 2000);
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target.result;
            sendVideoMessage(base64);
        };
        reader.onerror = () => {
            if (typeof showNotification === 'function') showNotification('读取视频失败', 'error');
        };
        reader.readAsDataURL(file);
    }

    // 3. 发送视频消息
    function sendVideoMessage(base64Data) {
        try {
            if (typeof addMessage !== 'function') {
                console.error('[video] 找不到 A 项目的 addMessage 函数');
                return;
            }

            // 把视频代码塞进 text 里，A 的 render 会当作 HTML 渲染出来
            const videoHtml = `
                <div style="padding: 2px 0;">
                    <video controls preload="metadata" src="${base64Data}" 
                           style="max-width: 220px; max-height: 300px; border-radius: 12px; display: block; background: #000;">
                    </video>
                </div>
            `;

            addMessage({
                id: Date.now(),
                sender: 'user',
                text: videoHtml,
                type: 'normal',
                timestamp: new Date(),
                status: 'sent',
                favorited: false,
                note: null
            });

            if (typeof playSound === 'function') playSound('send');

            // 触发梦角回复（如果当前没在批量发送模式）
            if (typeof settings !== 'undefined' && settings.replyEnabled && !window.isBatchMode) {
                const delayRange = settings.replyDelayMax - settings.replyDelayMin;
                const randomDelay = settings.replyDelayMin + Math.random() * delayRange;
                if (window._pendingReplyTimer) clearTimeout(window._pendingReplyTimer);
                window._pendingReplyTimer = setTimeout(() => {
                    window._pendingReplyTimer = null;
                    if (typeof window.simulateReply === 'function') window.simulateReply();
                }, randomDelay);
            }
        } catch (err) {
            console.error('[video] 发送视频失败:', err);
        }
    }

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(initUI, 500));
        } else {
            setTimeout(initUI, 500);
        }
    }

    init();
})();
