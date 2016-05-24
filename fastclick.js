;(function () {
    'use strict';
    //构造函数
    function FastClick(layer, options) {
        var oldOnClick;

        options = options || {};

        /**
         * Whether a click is currently being tracked.
         *
         * @type boolean
         */
        this.trackingClick = false;


        /**
         * Timestamp for when click tracking started.
         *
         * @type number
         */
        this.trackingClickStart = 0;


        /**
         * The element being tracked for a click.
         *
         * @type EventTarget
         */
        this.targetElement = null;


        /**
         * X-coordinate of touch start event.
         *
         * @type number
         */
        this.touchStartX = 0;


        /**
         * Y-coordinate of touch start event.
         *
         * @type number
         */
        this.touchStartY = 0;


        //主要hack iOS4下的一个怪异问题
        this.lastTouchIdentifier = 0;


        /**
         * 用于区分是click还是Touchmove，若出点移动超过该值则视为touchmove
         */
        this.touchBoundary = options.touchBoundary || 10;


        /**
         * 绑定了FastClick的元素，常规是body
         */
        this.layer = layer;

        /**
         * The minimum time between tap(touchstart and touchend) events
         *
         * @type number
         */
        this.tapDelay = options.tapDelay || 200;

        /**
         * The maximum time for a tap
         *
         * @type number
         */
        this.tapTimeout = options.tapTimeout || 700;

        //如果是属于不需要处理的元素类型，则直接返回
        if (FastClick.notNeeded(layer)) {
            return;
        }

        //语法糖，兼容一些用不了 Function.prototype.bind 的旧安卓
        //所以后面不走 layer.addEventListener('click', this.onClick.bind(this), true);
        function bind(method, context) {
            return function() { return method.apply(context, arguments); };
        }


        var methods = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
        var context = this;
        for (var i = 0, l = methods.length; i < l; i++) {
            context[methods[i]] = bind(context[methods[i]], context);
        }

        //安卓则做额外处理
        if (deviceIsAndroid) {
            layer.addEventListener('mouseover', this.onMouse, true);
            layer.addEventListener('mousedown', this.onMouse, true);
            layer.addEventListener('mouseup', this.onMouse, true);
        }

        layer.addEventListener('click', this.onClick, true);
        layer.addEventListener('touchstart', this.onTouchStart, false);
        layer.addEventListener('touchmove', this.onTouchMove, false);
        layer.addEventListener('touchend', this.onTouchEnd, false);
        layer.addEventListener('touchcancel', this.onTouchCancel, false);

        // 兼容不支持 stopImmediatePropagation 的浏览器(比如 Android 2)
        if (!Event.prototype.stopImmediatePropagation) {
            layer.removeEventListener = function(type, callback, capture) {
                var rmv = Node.prototype.removeEventListener;
                if (type === 'click') {
                    rmv.call(layer, type, callback.hijacked || callback, capture);
                } else {
                    rmv.call(layer, type, callback, capture);
                }
            };

            layer.addEventListener = function(type, callback, capture) {
                var adv = Node.prototype.addEventListener;
                if (type === 'click') {
                    //留意这里 callback.hijacked 中会判断 event.propagationStopped 是否为真来确保（安卓的onMouse事件）只执行一次
                    //在 onMouse 事件里会给 event.propagationStopped 赋值 true
                    adv.call(layer, type, callback.hijacked || (callback.hijacked = function(event) {
                            if (!event.propagationStopped) {
                                callback(event);
                            }
                        }), capture);
                } else {
                    adv.call(layer, type, callback, capture);
                }
            };
        }

        // 如果layer直接在DOM上写了 onclick 方法，那我们需要把它替换为 addEventListener 绑定形式
        if (typeof layer.onclick === 'function') {
            oldOnClick = layer.onclick;
            layer.addEventListener('click', function(event) {
                oldOnClick(event);
            }, false);
            layer.onclick = null;
        }
    }

    /**
     * Windows Phone 8.1 fakes user agent string to look like Android and iPhone.
     *
     * @type boolean
     */
    var deviceIsWindowsPhone = navigator.userAgent.indexOf("Windows Phone") >= 0;

    /**
     * Android requires exceptions.
     *
     * @type boolean
     */
    var deviceIsAndroid = navigator.userAgent.indexOf('Android') > 0 && !deviceIsWindowsPhone;


    /**
     * iOS requires exceptions.
     *
     * @type boolean
     */
    var deviceIsIOS = /iP(ad|hone|od)/.test(navigator.userAgent) && !deviceIsWindowsPhone;


    /**
     * iOS 4 requires an exception for select elements.
     *
     * @type boolean
     */
    var deviceIsIOS4 = deviceIsIOS && (/OS 4_\d(_\d)?/).test(navigator.userAgent);


    /**
     * iOS 6.0-7.* requires the target element to be manually derived
     *
     * @type boolean
     */
    var deviceIsIOSWithBadTarget = deviceIsIOS && (/OS [6-7]_\d/).test(navigator.userAgent);

    /**
     * BlackBerry requires exceptions.
     *
     * @type boolean
     */
    var deviceIsBlackBerry10 = navigator.userAgent.indexOf('BB10') > 0;

    //判断元素是否要保留穿透功能
    FastClick.prototype.needsClick = function(target) {
        switch (target.nodeName.toLowerCase()) {

            // disabled的input
            case 'button':
            case 'select':
            case 'textarea':
                if (target.disabled) {
                    return true;
                }

                break;
            case 'input':

                // file组件必须通过原生click事件点击才有效
                if ((deviceIsIOS && target.type === 'file') || target.disabled) {
                    return true;
                }

                break;
            case 'label':
            case 'iframe':
            case 'video':
                return true;
        }

        //元素带了名为“bneedsclick”的class也返回true
        return (/\bneedsclick\b/).test(target.className);
    };


    //判断给定元素是否需要通过合成click事件来模拟聚焦
    FastClick.prototype.needsFocus = function(target) {
        switch (target.nodeName.toLowerCase()) {
            case 'textarea':
                return true;
            case 'select':
                return !deviceIsAndroid; //iOS下的select得走穿透点击才行
            case 'input':
                switch (target.type) {
                    case 'button':
                    case 'checkbox':
                    case 'file':
                    case 'image':
                    case 'radio':
                    case 'submit':
                        return false;
                }

                return !target.disabled && !target.readOnly;
            default:
                //带有名为“bneedsfocus”的class则返回true
                return (/\bneedsfocus\b/).test(target.className);
        }
    };


    //合成一个click事件并在指定元素上触发
    FastClick.prototype.sendClick = function(targetElement, event) {
        var clickEvent, touch;

        // 在一些安卓机器中，得让页面所存在的 activeElement（聚焦的元素，比如input）失焦，否则合成的click事件将无效
        if (document.activeElement && document.activeElement !== targetElement) {
            document.activeElement.blur();
        }

        touch = event.changedTouches[0];

        // 合成(Synthesise) 一个 click 事件
        // 通过一个额外属性确保它能被追踪（tracked）
        clickEvent = document.createEvent('MouseEvents');
        clickEvent.initMouseEvent(this.determineEventType(targetElement), true, true, window, 1, touch.screenX, touch.screenY, touch.clientX, touch.clientY, false, false, false, false, 0, null);
        clickEvent.forwardedTouchEvent = true; // fastclick的内部变量，用来识别click事件是原生还是合成的
        targetElement.dispatchEvent(clickEvent); //立即触发其click事件
    };

    FastClick.prototype.determineEventType = function(targetElement) {

        //安卓设备下 Select 无法通过合成的 click 事件被展开，得改为 mousedown
        if (deviceIsAndroid && targetElement.tagName.toLowerCase() === 'select') {
            return 'mousedown';
        }

        return 'click';
    };


    //设置元素聚焦事件
    FastClick.prototype.focus = function(targetElement) {
        var length;

        // 组件建议通过setSelectionRange(selectionStart, selectionEnd)来设定光标范围（注意这样还没有聚焦
        // 要等到后面触发 sendClick 事件才会聚焦）
        // 另外 iOS7 下有些input元素(比如 date datetime month) 的 selectionStart 和 selectionEnd 特性是没有整型值的，
        // 导致会抛出一个关于 setSelectionRange 的模糊错误，它们需要改用 focus 事件触发
        if (deviceIsIOS && targetElement.setSelectionRange && targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time' && targetElement.type !== 'month') {
            length = targetElement.value.length;
            targetElement.setSelectionRange(length, length);
        } else {
            //直接触发其focus事件
            targetElement.focus();
        }
    };


    /**
     * 检查target是否一个滚动容器里的子元素，如果是则给它加个标记
     */
    FastClick.prototype.updateScrollParent = function(targetElement) {
        var scrollParent, parentElement;

        scrollParent = targetElement.fastClickScrollParent;

        // Attempt to discover whether the target element is contained within a scrollable layer. Re-check if the
        // target element was moved to another parent.
        if (!scrollParent || !scrollParent.contains(targetElement)) {
            parentElement = targetElement;
            do {
                if (parentElement.scrollHeight > parentElement.offsetHeight) {
                    scrollParent = parentElement;
                    targetElement.fastClickScrollParent = parentElement;
                    break;
                }

                parentElement = parentElement.parentElement;
            } while (parentElement);
        }

        // 给滚动容器加个标志fastClickLastScrollTop，值为其当前垂直滚动偏移
        if (scrollParent) {
            scrollParent.fastClickLastScrollTop = scrollParent.scrollTop;
        }
    };


    /**
     * @param {EventTarget} targetElement
     * @returns {Element|EventTarget}
     */
    FastClick.prototype.getTargetElementFromEventTarget = function(eventTarget) {

        // 一些较老的浏览器，target 可能会是一个文本节点，得返回其DOM节点
        if (eventTarget.nodeType === Node.TEXT_NODE) {
            return eventTarget.parentNode;
        }

        return eventTarget;
    };


    FastClick.prototype.onTouchStart = function(event) {
        var targetElement, touch, selection;

        // 多指触控的手势则忽略
        if (event.targetTouches.length > 1) {
            return true;
        }

        targetElement = this.getTargetElementFromEventTarget(event.target); //一些较老的浏览器，target 可能会是一个文本节点，得返回其DOM节点
        touch = event.targetTouches[0];

        if (deviceIsIOS) { //IOS处理

            // 若用户已经选中了一些内容（比如选中了一段文本打算复制），则忽略
            selection = window.getSelection();
            if (selection.rangeCount && !selection.isCollapsed) {
                return true;
            }

            if (!deviceIsIOS4) { //是否IOS4

                //怪异特性处理——若click事件回调打开了一个alert/confirm，用户下一次tap页面的其它地方时，新的touchstart和touchend
                //事件会拥有同一个touch.identifier（新的 touch event 会跟上一次触发alert点击的 touch event 一样），
                //为避免将新的event当作之前的event导致问题，这里需要禁用默认事件
                //另外chrome的开发工具启用'Emulate touch events'后，iOS UA下的 identifier 会变成0，所以要做容错避免调试过程也被禁用事件了
                if (touch.identifier && touch.identifier === this.lastTouchIdentifier) {
                    event.preventDefault();
                    return false;
                }

                this.lastTouchIdentifier = touch.identifier;

                // 如果target是一个滚动容器里的一个子元素(使用了 -webkit-overflow-scrolling: touch) ，而且满足:
                // 1) 用户非常快速地滚动外层滚动容器
                // 2) 用户通过tap停止住了这个快速滚动
                // 这时候最后的'touchend'的event.target会变成用户最终手指下的那个元素
                // 所以当快速滚动开始的时候，需要做检查target是否滚动容器的子元素，如果是，做个标记
                // 在touchend时检查这个标记的值（滚动容器的scrolltop）是否改变了，如果是则说明页面在滚动中，需要取消fastclick处理
                this.updateScrollParent(targetElement);
            }
        }

        this.trackingClick = true; //做个标志表示开始追踪click事件了
        this.trackingClickStart = event.timeStamp; //标记下touch事件开始的时间戳
        this.targetElement = targetElement;

        //标记touch起始点的页面偏移值
        this.touchStartX = touch.pageX;
        this.touchStartY = touch.pageY;

        // this.lastClickTime 是在 touchend 里标记的事件时间戳
        // this.tapDelay 为常量 200 （ms）
        // 此举用来避免 phantom 的双击（200ms内快速点了两次）触发 click
        // 反正200ms内的第二次点击会禁止触发点击的默认事件
        if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
            event.preventDefault();
        }

        return true;
    };


    //判断是否移动了
    //this.touchBoundary是常量，值为10
    //如果touch已经移动了10个偏移量单位，则应当作为移动事件处理而非click事件
    FastClick.prototype.touchHasMoved = function(event) {
        var touch = event.changedTouches[0], boundary = this.touchBoundary;

        if (Math.abs(touch.pageX - this.touchStartX) > boundary || Math.abs(touch.pageY - this.touchStartY) > boundary) {
            return true;
        }

        return false;
    };


    FastClick.prototype.onTouchMove = function(event) {
        //不是需要被追踪click的事件则忽略
        if (!this.trackingClick) {
            return true;
        }

        // 如果target突然改变了，或者用户其实是在移动手势而非想要click
        // 则应该清掉this.trackingClick和this.targetElement，告诉后面的事件你们也不用处理了
        if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this.touchHasMoved(event)) {
            this.trackingClick = false;
            this.targetElement = null;
        }

        return true;
    };


    //找到label标签所映射的组件，方便让用户点label的时候直接激活该组件
    FastClick.prototype.findControl = function(labelElement) {

        // 有缓存则直接读缓存着的
        if (labelElement.control !== undefined) {
            return labelElement.control;
        }

        // 获取指向的组件
        if (labelElement.htmlFor) {
            return document.getElementById(labelElement.htmlFor);
        }

        // 没有for属性则激活页面第一个组件（labellable 元素）
        return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
    };


    FastClick.prototype.onTouchEnd = function(event) {
        var forElement, trackingClickStart, targetTagName, scrollParent, touch, targetElement = this.targetElement;

        if (!this.trackingClick) {
            return true;
        }

        // 避免 phantom 的双击（200ms内快速点了两次）触发 click
        // 我们在 ontouchstart 里已经做过一次判断了（仅仅禁用默认事件），这里再做一次判断
        if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
            this.cancelNextClick = true; //该属性会在 onMouse 事件中被判断，为true则彻底禁用事件和冒泡
            return true;
        }

        //this.tapTimeout是常量，值为700
        //识别是否为长按事件，如果是（大于700ms）则忽略
        if ((event.timeStamp - this.trackingClickStart) > this.tapTimeout) {
            return true;
        }

        // 得重置为false，避免input事件被意外取消
        // 例子见 https://github.com/ftlabs/fastclick/issues/156
        this.cancelNextClick = false;

        this.lastClickTime = event.timeStamp; //标记touchend时间，方便下一次的touchstart做双击校验

        trackingClickStart = this.trackingClickStart;
        //重置 this.trackingClick 和 this.trackingClickStart
        this.trackingClick = false;
        this.trackingClickStart = 0;

        // iOS 6.0-7.*版本下有个问题 —— 如果layer处于transition或scroll过程，event所提供的target是不正确的
        // 所以咱们得重找 targetElement（这里通过 document.elementFromPoint 接口来寻找）
        if (deviceIsIOSWithBadTarget) { //iOS 6.0-7.*版本
            touch = event.changedTouches[0]; //手指离开前的触点

            // 有些情况下 elementFromPoint 里的参数是预期外/不可用的, 所以还得避免 targetElement 为 null
            targetElement = document.elementFromPoint(touch.pageX - window.pageXOffset, touch.pageY - window.pageYOffset) || targetElement;
            // target可能不正确需要重找，但fastClickScrollParent是不会变的
            targetElement.fastClickScrollParent = this.targetElement.fastClickScrollParent;
        }

        targetTagName = targetElement.tagName.toLowerCase();
        if (targetTagName === 'label') { //是label则激活其指向的组件
            forElement = this.findControl(targetElement);
            if (forElement) {
                this.focus(targetElement);
                //安卓直接返回（无需合成click事件触发，因为点击和激活元素不同，不存在点透）
                if (deviceIsAndroid) {
                    return false;
                }

                targetElement = forElement;
            }
        } else if (this.needsFocus(targetElement)) { //非label则识别是否需要focus的元素

            //手势停留在组件元素时长超过100ms，则置空this.targetElement并返回
            //（而不是通过调用this.focus来触发其聚焦事件，走的原生的click/focus事件触发流程）
            //这也是为何文章开头提到的问题中，稍微久按一点（超过100ms）textarea是可以把光标定位在正确的地方的原因
            //另外iOS下有个意料之外的bug——如果被点击的元素所在文档是在iframe中的，手动调用其focus的话，
            //会发现你往其中输入的text是看不到的（即使value做了更新），so这里也直接返回
            if ((event.timeStamp - trackingClickStart) > 100 || (deviceIsIOS && window.top !== window && targetTagName === 'input')) {
                this.targetElement = null;
                return false;
            }

            this.focus(targetElement);
            this.sendClick(targetElement, event);  //立即触发其click事件，而无须等待300ms

            //iOS4下的 select 元素不能禁用默认事件（要确保它能被穿透），否则不会打开select目录
            //有时候 iOS6/7 下（VoiceOver开启的情况下）也会如此
            if (!deviceIsIOS || targetTagName !== 'select') {
                this.targetElement = null;
                event.preventDefault();
            }

            return false;
        }

        if (deviceIsIOS && !deviceIsIOS4) {

            // 滚动容器的垂直滚动偏移改变了，说明是容器在做滚动而非点击，则忽略
            scrollParent = targetElement.fastClickScrollParent;
            if (scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop) {
                return true;
            }
        }

        // 查看元素是否无需处理的白名单内（比如加了名为“needsclick”的class）
        // 不是白名单的则照旧预防穿透处理，立即触发合成的click事件
        if (!this.needsClick(targetElement)) {
            event.preventDefault();
            this.sendClick(targetElement, event);
        }

        return false;
    };

    FastClick.prototype.onTouchCancel = function() {
        this.trackingClick = false;
        this.targetElement = null;
    };


    //用于决定是否允许穿透事件（触发layer的click默认事件）
    FastClick.prototype.onMouse = function(event) {

        // touch事件一直没触发
        if (!this.targetElement) {
            return true;
        }

        if (event.forwardedTouchEvent) { //触发的click事件是合成的
            return true;
        }

        // 编程派生的事件所对应元素事件可以被允许
        // 确保其没执行过 preventDefault 方法（event.cancelable 不为 true）即可
        if (!event.cancelable) {
            return true;
        }

        // 需要做预防穿透处理的元素，或者做了快速（200ms）双击的情况
        if (!this.needsClick(this.targetElement) || this.cancelNextClick) {
            //停止当前默认事件和冒泡
            if (event.stopImmediatePropagation) {
                event.stopImmediatePropagation();
            } else {

                // 不支持 stopImmediatePropagation 的设备(比如Android 2)做标记，
                // 确保该事件回调不会执行（见126行）
                event.propagationStopped = true;
            }

            // 取消事件和冒泡
            event.stopPropagation();
            event.preventDefault();

            return false;
        }

        //允许穿透
        return true;
    };


    //click事件常规都是touch事件衍生来的，也排在touch后面触发。
    //对于那些我们在touch事件过程没有禁用掉默认事件的event来说，我们还需要在click的捕获阶段进一步
    //做判断决定是否要禁掉点击事件（防穿透）
    FastClick.prototype.onClick = function(event) {
        var permitted;

        // 如果还有 trackingClick 存在，可能是某些UI事件阻塞了touchEnd 的执行
        if (this.trackingClick) {
            this.targetElement = null;
            this.trackingClick = false;
            return true;
        }

        // 依旧是对 iOS 怪异行为的处理 —— 如果用户点击了iOS模拟器里某个表单中的一个submit元素
        // 或者点击了弹出来的键盘里的“Go”按钮，会触发一个“伪”click事件（target是一个submit-type的input元素）
        if (event.target.type === 'submit' && event.detail === 0) {
            return true;
        }

        permitted = this.onMouse(event);

        if (!permitted) { //如果点击是被允许的，将this.targetElement置空可以确保onMouse事件里不会阻止默认事件
            this.targetElement = null;
        }

        //没有多大意义
        return permitted;
    };


    //销毁Fastclick所注册的监听事件。是给外部实例去调用的
    FastClick.prototype.destroy = function() {
        var layer = this.layer;

        if (deviceIsAndroid) {
            layer.removeEventListener('mouseover', this.onMouse, true);
            layer.removeEventListener('mousedown', this.onMouse, true);
            layer.removeEventListener('mouseup', this.onMouse, true);
        }

        layer.removeEventListener('click', this.onClick, true);
        layer.removeEventListener('touchstart', this.onTouchStart, false);
        layer.removeEventListener('touchmove', this.onTouchMove, false);
        layer.removeEventListener('touchend', this.onTouchEnd, false);
        layer.removeEventListener('touchcancel', this.onTouchCancel, false);
    };


    //是否没必要使用到 Fastclick 的检测
    FastClick.notNeeded = function(layer) {
        var metaViewport;
        var chromeVersion;
        var blackberryVersion;
        var firefoxVersion;

        // 不支持触摸的设备
        if (typeof window.ontouchstart === 'undefined') {
            return true;
        }

        // 获取Chrome版本号，若非Chrome则返回0
        chromeVersion = +(/Chrome\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];

        if (chromeVersion) {

            if (deviceIsAndroid) { //安卓
                metaViewport = document.querySelector('meta[name=viewport]');

                if (metaViewport) {
                    // 安卓下，带有 user-scalable="no" 的 meta 标签的 chrome 是会自动禁用 300ms 延迟的，所以无需 Fastclick
                    if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
                        return true;
                    }
                    // 安卓Chrome 32 及以上版本，若带有 width=device-width 的 meta 标签也是无需 FastClick 的
                    if (chromeVersion > 31 && document.documentElement.scrollWidth <= window.outerWidth) {
                        return true;
                    }
                }

                // 其它的就肯定是桌面级的 Chrome 了，更不需要 FastClick 啦
            } else {
                return true;
            }
        }

        if (deviceIsBlackBerry10) { //黑莓，和上面安卓同理，就不写注释了
            blackberryVersion = navigator.userAgent.match(/Version\/([0-9]*)\.([0-9]*)/);

            if (blackberryVersion[1] >= 10 && blackberryVersion[2] >= 3) {
                metaViewport = document.querySelector('meta[name=viewport]');

                if (metaViewport) {
                    if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
                        return true;
                    }

                    if (document.documentElement.scrollWidth <= window.outerWidth) {
                        return true;
                    }
                }
            }
        }

        // 带有 -ms-touch-action: none / manipulation 特性的 IE10 会禁用双击放大，也没有 300ms 时延
        if (layer.style.msTouchAction === 'none' || layer.style.touchAction === 'manipulation') {
            return true;
        }

        // Firefox检测，同上
        firefoxVersion = +(/Firefox\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];

        if (firefoxVersion >= 27) {

            metaViewport = document.querySelector('meta[name=viewport]');
            if (metaViewport && (metaViewport.content.indexOf('user-scalable=no') !== -1 || document.documentElement.scrollWidth <= window.outerWidth)) {
                return true;
            }
        }

        // IE11 推荐使用没有“-ms-”前缀的 touch-action 样式特性名
        if (layer.style.touchAction === 'none' || layer.style.touchAction === 'manipulation') {
            return true;
        }

        return false;
    };


    FastClick.attach = function(layer, options) {
        return new FastClick(layer, options);
    };


    if (typeof define === 'function' && typeof define.amd === 'object' && define.amd) {

        // AMD. Register as an anonymous module.
        define(function() {
            return FastClick;
        });
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = FastClick.attach;
        module.exports.FastClick = FastClick;
    } else {
        window.FastClick = FastClick;
    }
}());