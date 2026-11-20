(() => {
  const mediaPrototype = HTMLMediaElement.prototype;
  const descriptors = Object.fromEntries(["playbackRate", "defaultPlaybackRate"].map((key) => [key, Object.getOwnPropertyDescriptor(mediaPrototype, key)]));
  let policy = { enabled: false, speed: 1 };
  const media = new Set();
  const tracked = new WeakSet();
  const roots = new Map();
  const shadowRoots = new WeakMap();
  const events = ["play", "playing", "loadedmetadata", "durationchange", "emptied", "ratechange"];

  function apply(element, reset = false) {
    if (!(element instanceof HTMLMediaElement) || (!policy.enabled && !reset)) return;
    const speed = reset ? 1 : policy.speed;
    for (const [key, descriptor] of Object.entries(descriptors)) {
      try {
        if (Math.abs(descriptor.get.call(element) - speed) > 0.001) descriptor.set.call(element, speed);
      } catch {
        // 个别媒体管线不接受倍速，继续处理页面上的其他视频。
      }
    }
  }

  function track(element) {
    if (tracked.has(element)) return;
    tracked.add(element);
    // 弱引用避免单页应用连续换集后长期持有已被移除的视频元素。
    media.add(new WeakRef(element));
    for (const event of events) element.addEventListener(event, () => apply(element), { passive: true });
    apply(element);
  }

  function scan(node) {
    if (node instanceof HTMLMediaElement) track(node);
    if (node instanceof Element) {
      const root = node.shadowRoot || shadowRoots.get(node);
      if (root) observe(root);
    }
    if (!node.querySelectorAll) return;
    for (const element of node.querySelectorAll("*")) {
      if (element instanceof HTMLMediaElement) track(element);
      const root = element.shadowRoot || shadowRoots.get(element);
      if (root) observe(root);
    }
  }

  function prune() {
    for (const ref of media) if (!ref.deref()) media.delete(ref);
    for (const [root, observer] of roots) {
      if (root.host && !root.host.isConnected) {
        observer.disconnect();
        roots.delete(root);
      }
    }
  }

  function observe(root) {
    if (roots.has(root)) return;
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) scan(node);
      prune();
    });
    roots.set(root, observer);
    observer.observe(root, { childList: true, subtree: true });
    scan(root);
  }

  // 在网页主世界拦截播放器主动重置倍速，避免 ratechange 监听与网站反复互相改写。
  for (const [key, descriptor] of Object.entries(descriptors)) {
    Object.defineProperty(mediaPrototype, key, {
      ...descriptor,
      set(value) {
        if (!policy.enabled) return descriptor.set.call(this, value);
        if (descriptor.get.call(this) !== policy.speed) descriptor.set.call(this, policy.speed);
      },
    });
  }
  const originalPlay = mediaPrototype.play;
  mediaPrototype.play = function (...args) {
    track(this);
    apply(this);
    return Reflect.apply(originalPlay, this, args);
  };
  const originalAttachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (...args) {
    const root = Reflect.apply(originalAttachShadow, this, args);
    // 保留关闭根的弱映射，组件移出后重新挂载时仍能恢复观察，不长期持有宿主。
    shadowRoots.set(this, root);
    observe(root);
    return root;
  };

  document.addEventListener("sanrenjz-speed:policy", (event) => {
    try {
      const next = JSON.parse(event.detail);
      if (typeof next.enabled !== "boolean" || typeof next.speed !== "number" || !Number.isFinite(next.speed) || next.speed < 0.25 || next.speed > 4) return;
      const reset = policy.enabled && !next.enabled;
      policy = next;
      prune();
      for (const ref of media) {
        const element = ref.deref();
        if (element) apply(element, reset);
      }
    } catch { /* 忽略来自网页的无效策略事件。 */ }
  });
  observe(document);
  document.dispatchEvent(new Event("sanrenjz-speed:ready"));
})();
