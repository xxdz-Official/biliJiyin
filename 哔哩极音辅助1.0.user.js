// ==UserScript==
// @name         哔哩极音辅助1.0
// @namespace    https://github.com/xxdz-Official/biliJiyin/blob/2a30a1741dde7a7c1b27d9c1fc2a6c105f28c377/%E5%93%94%E5%93%A9%E6%9E%81%E9%9F%B3%E8%BE%85%E5%8A%A91.0.user.js
// @version      1.0
// @description  哔哩极音弥补+增强（恢复画质/弹幕/自动连播，增加音频可视化）
// @author       小小电子xxdz
// @match        https://www.bilibili.com/video/*
// @icon         https://article.biliimg.com/bfs/new_dyn/6de998bc1c801811007eb1b522a41a603461569935575626.png
// @grant        none
// @run-at       document-idle
// ==/UserScript==
//作者主页：https://space.bilibili.com/3461569935575626
(function() {
    'use strict';

    // 全局配置
    const CONFIG = {
        // 画质选择配置
        quality: {
            targetValue: '80',  // 1080P的data-value
            maxRetry: 30,       // 最大重试次数
            interval: 1000      // 检测间隔(ms)
        },

        // 元素选择器
        elements: {
            dmSwitch: '.bpx-player-dm-switch input[type="checkbox"]',
            radioButton: 'input.bui-radio-input[value="2"][name="bui-radio1"]',
            qualityItem: 'li.bpx-player-ctrl-quality-menu-item[data-value="80"]',
            qualityBtn: '.bpx-player-ctrl-quality',
            videoElement: 'video'
        },

        // 音频可视化配置
        visualizer: {
            enabled: false,      // 默认不显示可视化
            alwaysAnalyze: true, // 始终后台分析
            fftSize: 2048,      // 频率分析精度
            smoothing: 0.4,     // 平滑系数
            minDecibels: -90,   // 最小分贝
            maxDecibels: -10    // 最大分贝
        },

        // 超时设置
        timeout: 20000
    };

    // 全局状态变量
    const state = {
        retryCount: 0,
        dmHandled: false,
        radioHandled: false,
        audioContext: null,
        analyser: null,
        source: null,
        animationId: null,
        visualizerVisible: false
    };

    // ==================== 音频分析核心 ====================
    function initAudioContext() {
        if (!state.audioContext) {
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            state.analyser = state.audioContext.createAnalyser();
            state.analyser.fftSize = CONFIG.visualizer.fftSize;
            state.analyser.smoothingTimeConstant = CONFIG.visualizer.smoothing;
            state.analyser.minDecibels = CONFIG.visualizer.minDecibels;
            state.analyser.maxDecibels = CONFIG.visualizer.maxDecibels;
            console.log('音频分析器初始化完成');
        }
    }

    function connectAudioSource() {
        const video = document.querySelector(CONFIG.elements.videoElement);
        if (video && !state.source) {
            try {
                state.source = state.audioContext.createMediaElementSource(video);
                state.source.connect(state.analyser);
                state.analyser.connect(state.audioContext.destination);
                console.log('音频源已连接');
            } catch (e) {
                console.error('音频连接失败:', e);
            }
        }
    }

    function startAudioAnalysis() {
        if (!CONFIG.visualizer.alwaysAnalyze) return;

        // 自动恢复暂停的上下文
        if (state.audioContext && state.audioContext.state === 'suspended') {
            state.audioContext.resume().then(() => {
                console.log('音频上下文已恢复');
            });
        }

        // 初始化音频分析
        initAudioContext();

        // 持续检测视频元素
        const videoObserver = new MutationObserver(() => {
            connectAudioSource();
        });
        videoObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 立即尝试连接
        connectAudioSource();
    }

    // ==================== 可视化控制 ====================
    function createVisualizerUI() {
        // 创建开关按钮
        const toggleBtn = document.createElement('div');
        toggleBtn.className = 'xxdz-visualizer-toggle';
        toggleBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 40px;
            height: 40px;
            background: ${CONFIG.visualizer.enabled ? 'rgba(0,255,157,0.7)' : 'rgba(0,0,0,0.7)'};
            border-radius: 50%;
            z-index: 10001;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 20px;
            box-shadow: ${CONFIG.visualizer.enabled ? '0 0 15px rgba(0,255,157,0.8)' : '0 0 10px rgba(0,255,157,0.5)'};
            transition: all 0.3s;
            user-select: none;
        `;
        toggleBtn.innerHTML = '🔊';
        toggleBtn.title = CONFIG.visualizer.enabled ? '点击关闭音频可视化' : '点击开启音频可视化';

        toggleBtn.addEventListener('click', toggleVisualizer);
        document.body.appendChild(toggleBtn);

        // 创建可视化画布
        const canvas = document.createElement('canvas');
        canvas.className = 'xxdz-audio-visualizer';
        canvas.style.cssText = `
            position: fixed;
            bottom: 70px;
            right: 20px;
            width: 320px;
            height: 140px;
            background: rgba(0,0,0,0.8);
            border-radius: 5px;
            z-index: 10000;
            box-shadow: 0 0 20px rgba(58,204,204,0.7);
            backdrop-filter: blur(5px);
            cursor: move;
            touch-action: none;
            transition: all 0.3s;
            opacity: ${CONFIG.visualizer.enabled ? '1' : '0'};
            transform: translateY(${CONFIG.visualizer.enabled ? '0' : '20px'});
            display: ${CONFIG.visualizer.enabled ? 'block' : 'none'};
        `;
        canvas.width = 320;
        canvas.height = 140;
        document.body.appendChild(canvas);

        // 设置拖动功能
        setupDraggable(canvas);

        // 如果默认开启，则启动可视化
        if (CONFIG.visualizer.enabled) {
            startVisualization(canvas);
        }
    }

    function toggleVisualizer() {
        CONFIG.visualizer.enabled = !CONFIG.visualizer.enabled;
        const toggleBtn = document.querySelector('.xxdz-visualizer-toggle');
        const canvas = document.querySelector('.xxdz-audio-visualizer');

        if (CONFIG.visualizer.enabled) {
            // 开启状态
            toggleBtn.style.background = 'rgba(0,255,157,0.7)';
            toggleBtn.style.boxShadow = '0 0 15px rgba(0,255,157,0.8)';
            toggleBtn.title = '点击关闭音频可视化';

            // 显示画布
            canvas.style.display = 'block';
            setTimeout(() => {
                canvas.style.opacity = '1';
                canvas.style.transform = 'translateY(0)';
            }, 10);

            // 启动可视化
            startVisualization(canvas);
        } else {
            // 关闭状态
            toggleBtn.style.background = 'rgba(0,0,0,0.7)';
            toggleBtn.style.boxShadow = '0 0 10px rgba(0,255,157,0.5)';
            toggleBtn.title = '点击开启音频可视化';

            // 隐藏画布
            canvas.style.opacity = '0';
            canvas.style.transform = 'translateY(20px)';
            setTimeout(() => {
                canvas.style.display = 'none';
            }, 300);

            // 停止动画
            if (state.animationId) {
                cancelAnimationFrame(state.animationId);
                state.animationId = null;
            }
        }
    }

    function startVisualization(canvas) {
        if (!state.analyser) return;
        if (state.animationId) cancelAnimationFrame(state.animationId);

        const ctx = canvas.getContext('2d');
        const bufferLength = state.analyser.frequencyBinCount;
        const freqData = new Uint8Array(bufferLength);
        const waveData = new Uint8Array(state.analyser.fftSize);

        function draw() {
            if (!CONFIG.visualizer.enabled) return;

            // 获取分析数据
            state.analyser.getByteFrequencyData(freqData);
            state.analyser.getByteTimeDomainData(waveData);

            // 清空画布
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // 绘制波形
            drawWaveform(ctx, waveData, canvas);

            // 绘制频谱
            drawSpectrum(ctx, freqData, canvas);

            // 继续动画循环
            state.animationId = requestAnimationFrame(draw);
        }

        // 开始绘制
        draw();
    }

    function drawWaveform(ctx, data, canvas) {
        ctx.beginPath();
        ctx.strokeStyle = '#00FF9D';
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00A1D6';

        for (let i = 0; i < data.length; i++) {
            const x = (i / data.length) * canvas.width;
            const y = (1 - data[i] / 255) * 60 + 10;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    function drawSpectrum(ctx, data, canvas) {
        const barCount = 128;
        const barWidth = canvas.width / barCount;

        for (let i = 0; i < barCount; i++) {
            const value = data[Math.floor(i * 1.5)];
            const height = (value / 255) * 100;
            const y = canvas.height - height;

            const hue = (i / barCount) * 360 + (performance.now() / 20) % 360;
            const gradient = ctx.createLinearGradient(0, y, 0, canvas.height);
            gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.9)`);
            gradient.addColorStop(1, `hsla(${(hue + 60) % 360}, 100%, 30%, 0.5)`);

            ctx.fillStyle = gradient;
            ctx.fillRect(i * barWidth + 2, y, barWidth - 4, height);
        }

        // 频段标识
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(255,255,255,0.5)';
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('高', canvas.width / 4, canvas.height - 15);
        ctx.fillText('(* ≧▽≦)ツ♪', canvas.width / 2, canvas.height - 15);
        ctx.fillText('低', canvas.width * 3 / 4, canvas.height - 15);
    }

    function setupDraggable(element) {
        let isDragging = false;
        let startX = 0, startY = 0;
        let initialLeft = null, initialTop = null;

        const handleMouseDown = (e) => {
            isDragging = true;
            const rect = element.getBoundingClientRect();
            startX = e.clientX || e.touches[0].clientX;
            startY = e.clientY || e.touches[0].clientY;
            initialLeft = rect.left;
            initialTop = rect.top;
            element.style.transition = 'none';
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

            // 边界检查
            newLeft = Math.max(0, Math.min(window.innerWidth - element.offsetWidth, newLeft));
            newTop = Math.max(0, Math.min(window.innerHeight - element.offsetHeight, newTop));

            element.style.left = `${newLeft}px`;
            element.style.right = 'auto';
            element.style.top = `${newTop}px`;
        };

        const handleMouseUp = () => {
            isDragging = false;
            element.style.transition = 'all 0.3s ease';
        };

        element.addEventListener('mousedown', handleMouseDown);
        element.addEventListener('touchstart', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('touchmove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('touchend', handleMouseUp);
    }

    // ==================== 必要功能（弥补哔哩极音主程序对视频清晰度、弹幕开关、自动连播的可记忆设置） ====================
    //现在会自动修改成1080p、弹幕开启、自动连播关闭的状态
    //如有需求可自行修改
    function clickElement(selector, description) {
        const element = document.querySelector(selector);
        if (element) {
            console.log(`找到${description}元素，正在点击...`);
            element.click();
            return true;
        }
        return false;
    }

    function waitForElement(selector, callback, options = {}) {
        const { timeout = 5000, interval = 500 } = options;
        const startTime = Date.now();

        function check() {
            const element = document.querySelector(selector);
            if (element) {
                callback(element);
            } else if (Date.now() - startTime < timeout) {
                setTimeout(check, interval);
            } else {
                console.warn(`等待元素超时: ${selector}`);
            }
        }

        check();
    }

    function handleDmSetting() {
        if (state.dmHandled) return;
        waitForElement('.bpx-player-dm-setting.disabled', () => {
            if (clickElement(CONFIG.elements.dmSwitch, '弹幕开关')) {
                state.dmHandled = true;
            }
        });
    }

    function handleRadioButton() {
        if (state.radioHandled) return;
        if (clickElement(CONFIG.elements.radioButton, '关闭自动轮播')) {
            state.radioHandled = true;
        } else {
            waitForElement(CONFIG.elements.radioButton, (element) => {
                element.click();
                state.radioHandled = true;
            });
        }
    }

    function handleQuality() {
        if (clickElement(CONFIG.elements.qualityItem, '1080P画质')) return;

        if (state.retryCount < 3) {
            if (clickElement(CONFIG.elements.qualityBtn, '画质按钮')) {
                state.retryCount++;
                setTimeout(handleQuality, 1000);
            }
        }
    }

    // ==================== 主执行逻辑 ====================
    function executeActions() {
        console.log('哔哩极音辅助开始执行...');

        // 初始化原有功能
        handleDmSetting();
        handleRadioButton();
        handleQuality();

        // 初始化音频系统
        startAudioAnalysis();
        createVisualizerUI();

        // 设置重试检查
        const qualityCheck = setInterval(() => {
            if (state.retryCount >= CONFIG.quality.maxRetry) {
                clearInterval(qualityCheck);
                return;
            }
            handleQuality();
        }, CONFIG.quality.interval);

        // 超时检查
        setTimeout(() => {
            clearInterval(qualityCheck);
            if (!state.dmHandled) console.warn('弹幕设置未成功执行＞︿＜');
            if (!state.radioHandled) console.warn('关闭自动轮播按钮未成功执行＞︿＜');
        }, CONFIG.timeout);
    }

    // ==================== 启动入口 ====================
    if (document.readyState === 'complete') {
        executeActions();
    } else {
        window.addEventListener('load', executeActions);
        document.addEventListener('DOMContentLoaded', executeActions);
    }

    // 监听DOM变化
    const observer = new MutationObserver(() => {
        if (!state.dmHandled) handleDmSetting();
        if (!state.radioHandled) handleRadioButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
