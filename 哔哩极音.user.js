// ==UserScript==
// @name         哔哩极音
// @namespace    https://github.com/xxdz-Official/-/blob/main/%E5%93%94%E5%93%A9%E6%9E%81%E9%9F%B3-1.01.user.js
// @version      1.4
// @description  把B站改造成实用的音乐播放器！
// @author       小小电子xxdz
// @match        https://www.bilibili.com/list/*
// @icon         https://article.biliimg.com/bfs/new_dyn/6de998bc1c801811007eb1b522a41a603461569935575626.png
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    let hasChangedQuality = false;
    let lastFullCheckTime = 0;
    const FULL_CHECK_INTERVAL = 200;
    let isPageLoaded = false;
    let lastVideoHref = '';
    let isReplaying = false;
    let replayChecker = null;
    let videoStartObserver = null;

    function waitForPageLoad() {
        if (document.readyState === 'complete') {
            isPageLoaded = true;
            initializeScript();
        } else {
            window.addEventListener('load', function() {
                isPageLoaded = true;
                initializeScript();
            });
        }
    }

    function initializeScript() {
        console.log('页面已加载，开始初始化脚本（>ω< ）');//这些都是输出到控制台，就方便调试可检查问题
        setGradientBackground();
        hideRootBg1();
        modifyPageTitle();
        shrinkTargetElement();
        adjustPlaylistContainerStyle();
        removeNewElements();
        mainCheck();
        clickTargetElement();
        startURLChangeObserver();
        startVideoReplayCheck();
        addVolumeControl();
        startVideoStartObserver();
        startAudioVisualizer();
    }

// 音频分析器功能（带示波器和优化效果）================================
    //ps:每一帧都可以独立保存成png镂空图片！
function startAudioVisualizer() {
    const canvas = document.createElement('canvas');
    canvas.className = 'xxdz-audio-visualizer';
    canvas.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        width: 320px;
        height: 140px;
        background: rgba(0,0,0,0.8);
        border-radius: 5px;
        z-index: 10000;
        box-shadow: 0 0 20px rgba(58,204,204,0.7);
        backdrop-filter: blur(5px);
        cursor: move;
        touch-action: none;
    `;
//↑部分参数说明书：
//background:背景透明度（最后的值）0.8
//border-radius:修改圆角为5px
//box-shadow://阴影（发光）：水平/垂直阴影偏移量，阴影模糊半径，阴影颜色RGB和透明度
//backdrop-filter:背景模糊度 5px
    // 拖动功能
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = null, initialTop = null;

    const handleMouseDown = (e) => {
        isDragging = true;
        const rect = canvas.getBoundingClientRect();
        startX = e.clientX || e.touches[0].clientX;
        startY = e.clientY || e.touches[0].clientY;
        initialLeft = rect.left;
        initialTop = rect.top;
        canvas.style.transition = 'none';
        e.preventDefault();
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        const currentX = e.clientX || e.touches[0].clientX;
        const currentY = e.clientY || e.touches[0].clientY;

        const deltaX = currentX - startX;
        const deltaY = currentY - startY;

        let newLeft = initialLeft + deltaX;
        let newTop = initialTop + deltaY;

        // 网页边界检查
        newLeft = Math.max(0, Math.min(window.innerWidth - canvas.offsetWidth, newLeft));
        newTop = Math.max(0, Math.min(window.innerHeight - canvas.offsetHeight, newTop));

        canvas.style.left = `${newLeft}px`;
        canvas.style.right = 'auto';
        canvas.style.top = `${newTop}px`;
    };

    const handleMouseUp = () => {
        isDragging = false;
        canvas.style.transition = 'all 0.3s ease';
        const rect = canvas.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
    };

    // 事件监听
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('touchstart', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('touchmove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleMouseUp);

    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = 320;
    canvas.height = 140;

    // 增强的音频分析配置
    let audioContext, analyser, source;
    let isVisualizing = true;

    function initAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048; // 更高的频率分辨率
            analyser.smoothingTimeConstant = 0.4; // 更灵敏的响应
            analyser.minDecibels = -90;
            analyser.maxDecibels = -10;
        }

        const video = document.querySelector('video');
        if (video && !source) {
            source = audioContext.createMediaElementSource(video);
            source.connect(analyser);
            analyser.connect(audioContext.destination);
        }
    }

    function draw() {
        if (!isVisualizing) return;

        // 获取双通道数据
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const waveData = new Uint8Array(analyser.fftSize);
        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(waveData);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 绘制示波器（上半部分）
        ctx.beginPath();
        ctx.strokeStyle = '#00FF9D'; // 线条的颜色
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00A1D6'; // 线条发的光颜色
        for (let i = 0; i < waveData.length; i++) {
            const x = (i / waveData.length) * canvas.width;
            const y = (1 - waveData[i] / 255) * 60 + 10; // 顶部区域
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // 绘制频谱（下半部分）
        const barCount = 128; // 更多频段
        const barWidth = canvas.width / barCount;
        for (let i = 0; i < barCount; i++) {
            const value = freqData[Math.floor(i * 1.5)]; // 增强高频响应
            const height = (value / 255) * 100; // *的值是幅度
            const y = canvas.height - height - 0; // 距离窗口底部的大小

            // 动态颜色映射
            const hue = (i / barCount) * 360 + (performance.now() / 20) % 360; // 流动的色相
            const gradient = ctx.createLinearGradient(0, y, 0, canvas.height);
            gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.9)`);
            gradient.addColorStop(1, `hsla(${(hue + 60) % 360}, 100%, 30%, 0.5)`);

            ctx.fillStyle = gradient;
            ctx.fillRect(
                i * barWidth + 2,
                y,
                barWidth - 4,
                height
            );
        }

        // 频段标识（带发光效果）
        ctx.shadowBlur = 8; // 文字发光模糊度
        ctx.shadowColor = 'rgba(255,255,255,0.5)'; // 发光颜色透明度
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('高', canvas.width / 4, canvas.height - 15);
        ctx.fillText('♪（>ω<*）', canvas.width / 2, canvas.height - 15);
        ctx.fillText('低', canvas.width * 3 / 4, canvas.height - 15);
    }

    // 60FPS动画循环
    function animate() {
        draw();
        if (isVisualizing) requestAnimationFrame(animate);
    }

    // 自动初始化
    const initVisualizer = () => {
        initAudioContext();
        animate();
    };

    // 视频检测
    new MutationObserver((mutations) => {
        if (document.querySelector('video')) {
            if (!audioContext) initVisualizer();
        }
    }).observe(document.body, { childList: true, subtree: true });

    // 初始检测
    if (document.querySelector('video')) initVisualizer();
}
//音频音谱结束================================================================
    // 新增功能：视频总是从头开始播放
    function startVideoStartObserver() {
        // 先清除旧的观察器
        if (videoStartObserver) {
            videoStartObserver.disconnect();
        }

        // 创建新的观察器
        videoStartObserver = new MutationObserver(function(mutations) {
            const videoElement = document.querySelector('video');
            if (videoElement && !videoElement.hasAttribute('data-xxdz-reset')) {
                videoElement.setAttribute('data-xxdz-reset', 'true');
                resetVideoToStart(videoElement);

                // 监听播放事件
                videoElement.addEventListener('play', function() {
                    if (this.currentTime > 0.5) { // 如果播放位置不是开头
                        this.currentTime = 0;
                    }
                });

                console.log('已设置视频总是从头开始播放');
            }
        });

        // 开始观察文档变化
        videoStartObserver.observe(document, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        });
    }

    function resetVideoToStart(videoElement) {
        if (!videoElement) return;
        try {
            // 立即设置到开头
            videoElement.currentTime = 0;
        } catch (e) {
            console.error('设置视频从头播放时出错啦＞︿＜:', e);
        }
    }

    function addVolumeControl() {
        const elementToRemove = document.evaluate(
            '//*[@id="mirror-vdcon"]/div[1]/div[1]/div[2]/div/div[4]',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
        if (elementToRemove) {
            elementToRemove.remove();
            console.log('已删除元素播放列表容器');
        }

        const targetElement = document.evaluate(
            '//*[@id="mirror-vdcon"]/div[1]/div[1]/div[2]/div/div[3]/div',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;

        if (targetElement && !targetElement.nextElementSibling?.classList.contains('xxdz-volume-container')) {
            const container = document.createElement('div');
            container.className = 'xxdz-volume-container';
            container.style.cssText = `
                display: inline-flex;
                align-items: center;
                margin-left: 10px;
            `;

            const volumeText = document.createElement('span');
            volumeText.className = 'xxdz-volume-text';
            volumeText.textContent = '音量大小:';
            volumeText.style.cssText = `
                font-size: 12px;
                color: #FFFFFF;
                margin-right: 5px;
            `;
            container.appendChild(volumeText);

            const volumeControl = document.createElement('div');
            volumeControl.className = 'xxdz-volume-control';
            volumeControl.style.cssText = `
                position: relative;
                width: 100px;
                height: 4px;
                background: #ddd;
                border-radius: 2px;
                cursor: pointer;
            `;

            const volumeLevel = document.createElement('div');
            volumeLevel.className = 'xxdz-volume-level';
            volumeLevel.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #00A1D6;
                border-radius: 2px;
                transform: scaleX(0.7);
                transform-origin: left;
                transition: transform 0.1s ease;
            `;

            const volumeHandle = document.createElement('img');
            volumeHandle.className = 'xxdz-volume-handle';
            volumeHandle.src = 'https://article.biliimg.com/bfs/new_dyn/cf84ec14a28d0585c3fe7ff8057f487f3461569935575626.png';
            volumeHandle.style.cssText = `
                position: absolute;
                top: 50%;
                left: 70%;
                width: 12px;
                height: 12px;
                transform: translate(-50%, -50%);
                transition: left 0.1s ease;
                pointer-events: none;
            `;

            volumeControl.appendChild(volumeLevel);
            volumeControl.appendChild(volumeHandle);
            container.appendChild(volumeControl);
            targetElement.parentNode.insertBefore(container, targetElement.nextSibling);

            const video = document.querySelector('video');
            let currentVolume = video ? video.volume : 0.7;

            function updateVolumeDisplay(volume) {
                volumeLevel.style.transform = `scaleX(${volume})`;
                volumeHandle.style.left = `${volume * 100}%`;
            }

            function setVolume(volume) {
                currentVolume = Math.min(1, Math.max(0, volume));
                updateVolumeDisplay(currentVolume);
                if (video) {
                    video.volume = currentVolume;
                }
            }

            updateVolumeDisplay(currentVolume);

            let isDragging = false;

            volumeControl.addEventListener('mousedown', function(e) {
                isDragging = true;
                const rect = this.getBoundingClientRect();
                const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                setVolume(percent);
            });

            document.addEventListener('mousemove', function(e) {
                if (isDragging) {
                    const rect = volumeControl.getBoundingClientRect();
                    const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                    setVolume(percent);
                }
            });

            document.addEventListener('mouseup', function() {
                isDragging = false;
            });

            volumeControl.addEventListener('click', function(e) {
                const rect = this.getBoundingClientRect();
                const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                setVolume(percent);
            });

            console.log('已添加带小电视图标的音量控制条');
        }
    }

    function startURLChangeObserver() {
        let oldHref = document.location.href;
        const body = document.querySelector('body');
        const observer = new MutationObserver(mutations => {
            if (oldHref !== document.location.href) {
                oldHref = document.location.href;
                handleURLChange();
            }
        });
        observer.observe(body, { childList: true, subtree: true });
    }

    function handleURLChange() {
        console.log('检测到URL变化，重新检测元素');
        lastVideoHref = '';
        isReplaying = false;
        if (replayChecker) clearInterval(replayChecker);
        if (videoStartObserver) videoStartObserver.disconnect();
        mainCheck();
        startVideoReplayCheck();
        startVideoStartObserver();
    }

    function startVideoReplayCheck() {
        let retryCount = 0;
        const maxRetry = 20;
        const checkInterval = 500;

        replayChecker = setInterval(() => {
            if (retryCount++ > maxRetry) {
                clearInterval(replayChecker);
                return;
            }

            const videoPlayer = document.querySelector('.bpx-player-video-wrap video');
            if (videoPlayer) {
                clearInterval(replayChecker);
                replayVideo(videoPlayer);
            }
        }, checkInterval);
    }

    function replayVideo(videoElement) {
        if (isReplaying) return;
        isReplaying = true;

        try {
            videoElement.pause();
            videoElement.currentTime = 0;
            setTimeout(() => {
                videoElement.play();
            }, 300);
        } catch (e) {
            console.error('视频重播失败＞︿＜:', e);
        }
    }

    function adjustPlaylistContainerStyle() {
        const style = document.createElement('style');
        style.textContent = `
            .playlist-container .playlist-container--right[data-v-2b808d54] {
                width: 950px !important;
                margin-left: 0px !important;
                padding-bottom: 20px !important;
            }
        `;
        document.head.appendChild(style);
        console.log('已调整播放列表容器样式');
    }

    function removeNewElements() {
        const element4 = document.evaluate(
            '//*[@id="mirror-vdcon"]/div[1]/div[4]',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
        if (element4) {
            element4.remove();
            console.log('已删除视频简介、标签');
        }

        const element6 = document.evaluate(
            '//*[@id="mirror-vdcon"]/div[1]/div[6]',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
        if (element6) {
            element6.remove();
            console.log('已删除元素 //*[@id="mirror-vdcon"]/div[1]/div[6]');
        }

        const danmukuBoxElement = document.evaluate(
            '//*[@id="danmukuBox"]',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
        if (danmukuBoxElement) {
            danmukuBoxElement.remove();
            console.log('已删除元素 //*[@id="danmukuBox"]/div/div/div/div/div/div/div[1]/div[2]');
        }
    }

    function shrinkTargetElement() {
        const targetElement = document.evaluate(
            '//*[@id="mirror-vdcon"]/div[1]',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;

        if (targetElement) {
            targetElement.style.transform = 'scale(0.98)';
            targetElement.style.transformOrigin = 'top left';
            console.log('已缩小视频播放器元素0.98%');
        }
    }

    function clickTargetElement() {
        const targetElement = document.evaluate(
            '//*[@id="bilibili-player"]/div/div/div[1]/div[1]/div[13]/div[2]/div[2]/div[3]/div[4]/div[2]/div/div/div/div/div[2]/div/div[1]/div[2]/div/div/div/label[1]/input',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;

        if (targetElement) {
            targetElement.click();
            console.log('已模拟点击自动连播');
        }
    }

    function setGradientBackground() {
        const style = document.createElement('style');
        style.textContent = `
            body {
                background: linear-gradient(to bottom, rgb(58, 204, 204), rgb(241, 242, 243)) !important;
                background-attachment: fixed !important;
            }
        `;
        document.head.appendChild(style);
        console.log('已设置渐变背景');
    }

    function hideRootBg1() {
        const style = document.createElement('style');
        style.textContent = `
            :root {
                --bg1: transparent !important;
            }
        `;
        document.head.appendChild(style);
        console.log('已隐藏:root中的--bg1颜色');
    }

    function modifyPageTitle() {
        const originalTitle = document.title;
        if (!originalTitle.startsWith('【哔哩极音】')) {
            document.title = '【哔哩极音】' + originalTitle;
            console.log('已修改页面标题');
        }
    }

    function autoSelectQuality() {
        if (hasChangedQuality || !isPageLoaded) return;

        const qualityBtn = document.querySelector('.bpx-player-ctrl-quality');
        if (!qualityBtn) return;

        const currentQuality = document.querySelector('.bpx-player-ctrl-quality-result');
        if (currentQuality && currentQuality.textContent.includes('360P')) {
            hasChangedQuality = true;
            return;
        }

        qualityBtn.click();

        setTimeout(() => {
            const qualityOption = document.querySelector('.bpx-player-ctrl-quality-menu-item[data-value="16"]');
            if (qualityOption) {
                qualityOption.click();
                console.log('已自动选择360p流畅');
                hasChangedQuality = true;
            }
        }, 800);
    }

    function isDanmuClosed() {
        return document.querySelector('.bpx-player-dm-switch input')?.checked === false;
    }

    function checkDanmuInput() {
        if (isDanmuClosed() || !isPageLoaded) return;

        const danmuInput = document.querySelector('.bpx-player-dm-input');
        if (danmuInput) {
            const dKeyEvent = new KeyboardEvent('keydown', {
                key: 'd',
                code: 'KeyD',
                keyCode: 68,
                which: 68,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(dKeyEvent);
        }
    }

    function removeCommentSection() {
        const commentApp = document.querySelector('div#commentapp');
        if (commentApp) {
            commentApp.remove();
            console.log('已删除评论区域');
        }
    }

    function removeRecommendList() {
        const recommendList = document.querySelector('.recommend-list-container');
        if (recommendList) {
            recommendList.remove();
            console.log('已删除推荐列表区域');
        }
    }

    function removeVideoToolbarRight() {
        const toolbarRight = document.querySelector('.video-toolbar-right');
        if (toolbarRight) {
            toolbarRight.remove();
            console.log('已删除视频工具栏右侧');
        }
    }

    function removeTargetElement() {
        const element = document.evaluate(
            '/html/body/div[2]/div[1]/div/div/ul[1]',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;

        if (element) {
            element.remove();
            console.log('已删除网页头部的一堆按钮');
        }
    }
    function UPintroduce() {
        const element = document.evaluate(
            '/html/body/div[2]/div[2]/div[2]/div[1]/div[1]/div[2]/div[1]/div/div[2]',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;

        if (element) {
            element.remove();
            console.log('已删除UP主简介');//虽然但是，这个办法可以永久修复宽屏bug
        }
    }

    function changeBackgroundColor() {
        const element = document.evaluate(
            '/html/body/div[2]/div[1]/div/div',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;

        if (element) {
            element.style.backgroundColor = 'rgb(58, 204, 204)';
            console.log('已修改元素背景颜色为 RGB(58, 204, 204)');
        }
    }

    function addCustomText() {
        const element = document.evaluate(
            '/html/body/div[2]/div[1]/div/div',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;

        if (element && !element.querySelector('.xxdz-custom-text')) {
            const container = document.createElement('span');
            container.className = 'xxdz-custom-text';
            container.style.cssText = `
                display: flex;
                align-items: flex-end;
                margin-right: 5px;
                order: -1;
                height: 30px;
            `;

            const iconImg = document.createElement('img');
            iconImg.src = 'https://article.biliimg.com/bfs/new_dyn/6de998bc1c801811007eb1b522a41a603461569935575626.png';//插入哔哩极音logo（重新绘制的256x256，不是64x64的旧logo）
            iconImg.style.cssText = `
                width: 60px;
                height: 60px;
                margin-bottom: -15px;
                margin-right: 5px;
            `;
            container.appendChild(iconImg);

            const titleSpan = document.createElement('span');
            titleSpan.textContent = '哔哩极音';
            titleSpan.style.cssText = `
                color: white;
                font-size: 25px;
                line-height: 25px;
                padding: 0 0 0 5px;
                background-color: rgba(58,204,204);
                border-radius: 4px 0 0 4px;
            `;

            const subSpan = document.createElement('span');
            subSpan.textContent = '播放器';
            subSpan.style.cssText = `
                color: white;
                font-size: 15px;
                line-height: 15px;
                padding: 0 5px 0 0;
                background-color: rgba(58,204,204);
                border-radius: 0 4px 4px 0;
                margin-bottom: -6px;
                margin-left: 5px;
            `;

            container.appendChild(titleSpan);
            container.appendChild(subSpan);
            element.appendChild(container);

            const versionSpan = document.createElement('span');
            versionSpan.textContent = '版本：1.4';
            versionSpan.style.cssText = `
                color: white;
                font-size: 10px;
                line-height: 15px;
                padding: 0 5px 0 0;
                background-color: rgba(58,204,204);
                border-radius: 0 4px 4px 0;
                margin-bottom: -13px;
                margin-left: 5px;
            `;
            container.appendChild(versionSpan);
            console.log('已添加插件名哔哩极音和版本号');
        }
    }

function addOriginalVideoButton() {
    const element = document.evaluate(
        '/html/body/div[2]/div[1]/div/div',//靠，忘记写注释了，这个xpath是哪个元素来着？？
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
    ).singleNodeValue;

    if (element) {
        const videoLinkElement = document.evaluate(
            '//*[@id="mirror-vdcon"]/div[1]/div[1]/div[1]/div/h1/a',//算了不管了，好像是旧网页顶部栏简化方案的屎山。。
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;

        if (videoLinkElement) {
            const currentHref = videoLinkElement.href;
            if (currentHref === lastVideoHref) return;
            lastVideoHref = currentHref;

            let button = element.querySelector('.xxdz-original-video-button');
            if (!button) {
                button = document.createElement('a');
                button.className = 'xxdz-original-video-button';
                button.textContent = '查看该原视频';
                button.target = '_blank';
                button.style.cssText = `
                    display: inline-block;
                    color: white;
                    font-size: 14px;
                    margin-left: 10px;
                    padding: 4px 8px;
                    background-color: #FF9500;
                    border-radius: 4px;
                    text-decoration: none;
                    cursor: pointer;
                    transition: background-color 0.2s;
                `;
                button.addEventListener('mouseover', () => {
                    button.style.backgroundColor = '#E68500';
                });
                button.addEventListener('mouseout', () => {
                    button.style.backgroundColor = '#FF9500';
                });
            }
            button.href = currentHref;

            // 添加疑难解答按钮
            let troubleshootButton = element.querySelector('.xxdz-troubleshoot-button');
            if (!troubleshootButton) {
                troubleshootButton = document.createElement('a');
                troubleshootButton.className = 'xxdz-troubleshoot-button';
                troubleshootButton.textContent = '疑难解答';
                troubleshootButton.href = 'https://www.bilibili.com/opus/1070836978706022405';
                troubleshootButton.target = '_blank';
                troubleshootButton.style.cssText = `
                    display: inline-block;
                    color: white;
                    font-size: 14px;
                    margin-left: 10px;
                    padding: 4px 8px;
                    background-color: #FF69B4;
                    border-radius: 4px;
                    text-decoration: none;
                    cursor: pointer;
                    transition: background-color 0.2s;
                `;
                troubleshootButton.addEventListener('mouseover', () => {
                    troubleshootButton.style.backgroundColor = '#FF1493';
                });
                troubleshootButton.addEventListener('mouseout', () => {
                    troubleshootButton.style.backgroundColor = '#FF69B4';
                });
            }

            // 插入按钮
            const githubButton = element.querySelector('.xxdz-github-button');
            if (githubButton) {
                element.insertBefore(troubleshootButton, githubButton);
                element.insertBefore(button, troubleshootButton);
            } else {
                element.appendChild(troubleshootButton);
                element.appendChild(button);
            }
            console.log('已添加查看原视频按钮和疑难解答按钮');
        }
    }
}
    function addGitHubButton() {
        const element = document.evaluate(
            '/html/body/div[2]/div[1]/div/div',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;

        if (element && !element.querySelector('.xxdz-github-button')) {
            const button = document.createElement('a');
            button.className = 'xxdz-github-button';
            button.textContent = '前往GitHub查看项目源代码';
            button.href = 'https://github.com/xxdz-Official/biliJiyin';
            button.target = '_blank';
            button.style.cssText = `
                display: inline-block;
                color: white;
                font-size: 14px;
                margin-left: 10px;
                padding: 4px 8px;
                background-color: #333;
                border-radius: 4px;
                text-decoration: none;
                cursor: pointer;
                transition: background-color 0.2s;
            `;
            button.addEventListener('mouseover', () => {
                button.style.backgroundColor = '#555';
            });
            button.addEventListener('mouseout', () => {
                button.style.backgroundColor = '#333';
            });
            element.appendChild(button);
            console.log('已添加GitHub按钮');
        }
    }

    function addAuthorButton() {
        const element = document.evaluate(
            '/html/body/div[2]/div[1]/div/div',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;

        if (element && !element.querySelector('.xxdz-author-button')) {
            const button = document.createElement('a');
            button.className = 'xxdz-author-button';
            button.textContent = '访问插件作者『小小电子xxdz』的主页\t(lll￢ω￢)';
            button.href = 'https://space.bilibili.com/3461569935575626';
            button.target = '_blank';
            button.style.cssText = `
                display: inline-block;
                color: white;
                font-size: 14px;
                margin-left: 10px;
                padding: 4px 8px;
                background-color: #00A1D6;
                border-radius: 4px;
                text-decoration: none;
                cursor: pointer;
                transition: background-color 0.2s;
            `;
            button.addEventListener('mouseover', () => {
                button.style.backgroundColor = '#0091C6';
            });
            button.addEventListener('mouseout', () => {
                button.style.backgroundColor = '#00A1D6';
            });
            element.appendChild(button);
            console.log('已添加作者主页按钮');
        }
    }

    function lightCheck() {
        checkDanmuInput();
    }

    function fullCheck() {
        const now = Date.now();
        if (now - lastFullCheckTime < FULL_CHECK_INTERVAL) return;
        lastFullCheckTime = now;

        removeNewElements();
        modifyPageTitle();
        removeCommentSection();
        removeRecommendList();
        removeVideoToolbarRight();
        removeTargetElement();
        UPintroduce();
        changeBackgroundColor();
        addCustomText();
        addOriginalVideoButton();
        addGitHubButton();
        addAuthorButton();
        addVolumeControl();

        if (!hasChangedQuality && document.querySelector('.bpx-player-ctrl-quality')) {
            autoSelectQuality();
        }
    }

    function mainCheck() {
        if (!isPageLoaded) return;
        lightCheck();
        fullCheck();
    }

    const observer = new MutationObserver(function(mutations) {
        if (isPageLoaded) {
            mainCheck();
            clickTargetElement();
            if (!isReplaying && document.location.href !== lastVideoHref) {
                startVideoReplayCheck();
            }
        }
    });
    observer.observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
    });

    waitForPageLoad();

    // 将用户统计代码放在最后执行
    function embedExternalPage() {
        const targetUrl = 'https://pan.huang1111.cn/s/aE4Q6hG';

        // 创建用户统计网页容器
        const container = document.createElement('div');
        container.id = 'xxdz-statistics-page-container';
        container.style.cssText = `
            position: fixed;
            bottom: 0;
            right: 0;
            width: 0px;
            height: 0px;
            z-index: 9999;
            overflow: hidden;
            border: 1px solid #00A1D6;
        `;

        // 创建iframe
        const iframe = document.createElement('iframe');
        iframe.src = targetUrl;
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
        `;
        container.appendChild(iframe);

        // 浏览器控制台输出
        document.body.appendChild(container);
        console.log('已记录一次用户的使用记录');
    }

    // 延迟执行用户统计代码
    setTimeout(embedExternalPage, 5000);
})();
