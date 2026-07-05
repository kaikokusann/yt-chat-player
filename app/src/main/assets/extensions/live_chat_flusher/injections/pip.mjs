import { logger } from '../modules/logging.mjs';

let popupWindow = null;

/**
 * Initializes the PiP-mode menu.
 */
(function initPipMenu() {
	const pipmenuTop = document.getElementById('yt-lcf-pp');
	if (window.documentPictureInPicture) {
		const pipmenu = pipmenuTop || self.documentPictureInPicture?.window?.document.getElementById('yt-lcf-pp') || popupWindow?.document?.getElementById('yt-lcf-pp');
		pipmenu?.addEventListener('click',  async () => {
			const pipWindow = popupWindow && !popupWindow.closed ? popupWindow : self.documentPictureInPicture?.window;
			if (pipWindow) {
				pipWindow.close();
			} else {
				const player = document.getElementById('yt-lcf-layer')?.closest('#player-container');
				const dataset = document.getElementById('yt-lcf-pip-script')?.dataset;
				if (player && dataset) {
					try {
						if (dataset.paramPipWindowMode === '0') {
							await openPip(player, dataset);
						} else {
							await openPopup(player, dataset);
						}
					} catch (err) {
						logger.error('Failed to open PiP/Popup /w chat window.\nCaused by:', err);
						showPopupError(err);
					}
				}
			}
		}, { passive: true });
	} else {
		if (pipmenuTop) pipmenuTop.hidden = true;
	}
})();

/**
 * Creates and opens a normal popup window of the video player container.
 * This is an experimental alternative to Document Picture-in-Picture so the
 * window is not forced to stay above every other app window by the OS.
 * @param {Element} element element of video player container
 * @param {DOMStringMap} dataset dataset of injected `<script>` (self)
 * @returns {Promise<Window>} popup window
 */
async function openPopup(element, dataset) {
	const parent = element.parentElement;
	if (!parent) throw new Error('No parent element.');

	const width = parent.clientWidth || 640;
	const height = parent.clientHeight || 393;
	const left = Math.max((screen.availWidth || screen.width || width) - width, 0);
	const features = [
		'popup=yes',
		`width=${width}`,
		`height=${height}`,
		`left=${left}`,
		'top=40',
		'menubar=no',
		'toolbar=no',
		'location=no',
		'status=no',
		'scrollbars=no',
		'resizable=yes',
	].join(',');
	const pipWindow = window.open('', 'ytlcf-popup-with-chat', features);
	if (!pipWindow) throw new Error('Popup window was blocked.');
	popupWindow = pipWindow;
	top.__ytlcfPopupWindow = pipWindow;

	try {
		void pipWindow.origin;
	} catch (cause) {
		pipWindow.close();
		throw new Error('Access to popup window was denied.', { cause });
	}

	/** @type {Record<string, { key: string, alt: boolean }>} */
	const userDefinedHotkeys = JSON.parse(dataset.paramHotkeys ?? '{}');
	const disableHotkeys = disableKeyboardShortcutOnParentWindow.bind(userDefinedHotkeys);
	const enableHotkeys = enableKeyboardShortcutOnChildWindow.bind(userDefinedHotkeys);
	top?.addEventListener('keydown', disableHotkeys, true);
	pipWindow?.addEventListener('keydown', enableHotkeys, true);
	top?.addEventListener('yt-navigate-finish', onYtNavigateFinishDispatchPip, { passive: true });

	const pipDocument = pipWindow.document;
	pipDocument.head.replaceChildren();
	pipDocument.body.replaceChildren();

	for (const attr of document.documentElement.attributes) {
		pipDocument.documentElement.attributes.setNamedItem(attr.cloneNode());
	}
	const pipMetaCharset = pipDocument.createElement('meta');
	pipMetaCharset.setAttribute('charset', 'utf-8');
	const pipTitle = pipDocument.createElement('title');
	pipTitle.textContent = document.querySelector('h1.ytd-watch-metadata')?.textContent || 'YouTube';
	const pipLink = pipDocument.createElement('link');
	pipLink.rel = 'stylesheet';
	pipLink.type = 'text/css';
	pipLink.href = dataset.paramCssUrl || '';
	const pipStyle = pipDocument.createElement('style');
	pipStyle.appendChild(pipDocument.createTextNode(':root,body{height:100%;overflow:hidden}body{margin:0;background:#000}body>#player-container{height:100%!important;width:100%!important}.ytp-miniplayer-button,.ytp-size-button,.ytp-fullscreen-button{display:none!important}#yt-lcf-pp{display:none!important}'));

	/** @type {(HTMLLinkElement | HTMLStyleElement)[]} */
	const copiedStyles = [];
	for (const sheet of element.ownerDocument.styleSheets) {
		if (sheet.href) {
			const link = pipDocument.createElement('link');
			link.rel = 'stylesheet';
			link.type = sheet.type;
			link.media = Array.from(sheet.media).join();
			link.href = sheet.href;
			copiedStyles.push(link);
		}
	}
	pipDocument.head.append(pipMetaCharset, pipTitle, ...copiedStyles, pipLink, pipStyle);

	const pipMarker = document.createElement('span');
	pipMarker.id = 'yt-lcf-pip-marker';
	pipMarker.textContent = dataset.paramPipMarkerText || '';
	element.before(pipMarker);
	pipDocument.body.appendChild(element);
	pipDocument.body.dataset.browser = document.body.dataset.browser;

	const player = pipWindow.document.querySelector('ytd-player');
	const video = player?.querySelector('video');
	/** @type {?HTMLElement | undefined} */
	const overlay = player?.querySelector('.ytp-iv-video-content');

	video?.addEventListener('loadeddata', dispatchResizePopup, { passive: true });
	if (video) video.style.pointerEvents = 'none';
	if (overlay) overlay.style.pointerEvents = 'none';

	pipWindow.addEventListener('ytlcf-pip-update', () => {
		const pipTitle = pipWindow.document.getElementsByTagName('title')[0];
		if (pipTitle) {
			const title = document.querySelector('h1.ytd-watch-metadata')?.textContent;
			pipTitle.textContent = title || 'YouTube';
		}
	});
	pipWindow.dispatchEvent(new CustomEvent('ytlcf-pip-update'));

	const resizePopup = () => {
		resizePopupPlayer(pipWindow, element);
		pipWindow.requestAnimationFrame(() => resizePopupPlayer(pipWindow, element));
		pipWindow.setTimeout(() => resizePopupPlayer(pipWindow, element), 120);
	};
	pipWindow.addEventListener('resize', resizePopup, { passive: true });

	pipWindow.addEventListener('pagehide', () => {
		const parent = pipMarker.parentElement || top?.document.getElementById('player-container-inner');
		parent?.append(element);
		if (parent && video) {
			video.style.width = `${parent.clientWidth | 0}px`;
			video.style.height = 'auto';
			video.style.top = video.style.left = '0px';
			/** @type {?HTMLElement} */
			const b = parent.querySelector('.ytp-chrome-bottom');
			if (b) {
				const left = Number.parseInt(b.style.left, 10);
				b.style.width = `${video.clientWidth - left * 2}px`;
			}
			video.removeEventListener('loadeddata', dispatchResizePopup);
			video.style.pointerEvents = '';
			if (overlay) overlay.style.pointerEvents = '';
		}
		if (top?.document.contains(pipMarker)) pipMarker.remove();
		top?.removeEventListener('keydown', disableHotkeys, true);
		pipWindow.removeEventListener('keydown', enableHotkeys, true);
		top?.removeEventListener('yt-navigate-finish', onYtNavigateFinishDispatchPip);
		if (popupWindow === pipWindow) popupWindow = null;
		if (top.__ytlcfPopupWindow === pipWindow) top.__ytlcfPopupWindow = null;
	}, { passive: true });

	if (video) {
		resizePopup();
	}

	logger.info('Popup /w chat window is created successfully.');
	return pipWindow;

	function onYtNavigateFinishDispatchPip() {
		pipWindow?.dispatchEvent(new CustomEvent('ytlcf-pip-update'));
	}

	function dispatchResizePopup() {
		resizePopup();
	}
}

/**
 * Shows popup initialization errors in the opened blank window.
 * @param {unknown} err
 */
function showPopupError(err) {
	const win = popupWindow && !popupWindow.closed ? popupWindow : null;
	if (!win) return;
	const doc = win.document;
	doc.head.replaceChildren();
	doc.body.replaceChildren();
	const style = doc.createElement('style');
	style.appendChild(doc.createTextNode('body{margin:0;padding:24px;background:#1f1f1f;color:#fff;font:14px -apple-system,BlinkMacSystemFont,sans-serif;white-space:pre-wrap}strong{display:block;margin-bottom:12px;font-size:16px}'));
	const strong = doc.createElement('strong');
	strong.textContent = 'YouTube LiveChat Flusher Popup Experiment failed';
	const pre = doc.createElement('div');
	pre.textContent = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack || ''}` : String(err);
	doc.head.append(style);
	doc.body.append(strong, pre);
}

/**
 * Resizes the moved YouTube player tree to match the popup viewport.
 * YouTube keeps several inline dimensions on nested player elements; without
 * refreshing them, the video stays at its original size or gets clipped.
 * @param {Window} win popup window
 * @param {Element} container moved #player-container element
 */
function resizePopupPlayer(win, container) {
	const width = Math.max(win.innerWidth | 0, 1);
	const height = Math.max(win.innerHeight | 0, 1);
	const pxWidth = `${width}px`;
	const pxHeight = `${height}px`;
	const doc = win.document;

	const setBox = el => {
		if (!el?.style) return;
		el.style.setProperty('box-sizing', 'border-box', 'important');
		el.style.setProperty('height', pxHeight, 'important');
		el.style.setProperty('left', '0px', 'important');
		el.style.setProperty('max-height', pxHeight, 'important');
		el.style.setProperty('max-width', pxWidth, 'important');
		el.style.setProperty('min-height', '0', 'important');
		el.style.setProperty('min-width', '0', 'important');
		el.style.setProperty('overflow', 'hidden', 'important');
		el.style.setProperty('position', 'relative', 'important');
		el.style.setProperty('top', '0px', 'important');
		el.style.setProperty('width', pxWidth, 'important');
	};

	for (const el of [
		container,
		container.querySelector('#player-container-inner'),
		container.querySelector('#player'),
		container.querySelector('#player-container-id'),
		container.querySelector('ytd-player'),
		container.querySelector('#movie_player'),
		container.querySelector('.html5-video-player'),
		container.querySelector('.html5-video-container'),
		container.querySelector('.ytp-player-content'),
		container.querySelector('.ytp-iv-video-content'),
	]) {
		setBox(el);
	}

	const player = container.querySelector('#movie_player') || container.querySelector('.html5-video-player');
	const video = container.querySelector('video');
	const layer = doc.getElementById('yt-lcf-layer');
	const bottom = container.querySelector('.ytp-chrome-bottom');
	const controls = container.querySelector('.ytp-chrome-controls');
	const progress = container.querySelector('.ytp-progress-bar-container');
	if (bottom?.style) {
		bottom.style.setProperty('bottom', '0px', 'important');
		bottom.style.setProperty('height', '48px', 'important');
		bottom.style.setProperty('left', '12px', 'important');
		bottom.style.setProperty('position', 'absolute', 'important');
		bottom.style.setProperty('width', `${Math.max(width - 24, 1)}px`, 'important');
	}
	if (controls?.style) {
		controls.style.setProperty('height', '48px', 'important');
		controls.style.setProperty('left', '0px', 'important');
		controls.style.setProperty('position', 'absolute', 'important');
		controls.style.setProperty('width', `${Math.max(width - 24, 1)}px`, 'important');
	}
	if (progress?.style) {
		progress.style.setProperty('left', '12px', 'important');
		progress.style.setProperty('right', '12px', 'important');
		progress.style.setProperty('width', `${Math.max(width - 24, 1)}px`, 'important');
	}
	if (layer?.style) {
		layer.style.setProperty('height', pxHeight, 'important');
		layer.style.setProperty('left', '0px', 'important');
		layer.style.setProperty('top', '0px', 'important');
		layer.style.setProperty('width', pxWidth, 'important');
		layer.dispatchEvent(new CustomEvent('resize'));
	}
	if (player?.dispatchEvent) {
		player.dispatchEvent(new CustomEvent('resize'));
	}
	if (video?.style) {
		video.style.setProperty('height', pxHeight, 'important');
		video.style.setProperty('left', '0px', 'important');
		video.style.setProperty('object-fit', 'contain', 'important');
		video.style.setProperty('top', '0px', 'important');
		video.style.setProperty('width', pxWidth, 'important');
		video.dispatchEvent(new CustomEvent('ytlcf-resize', { detail: win }));
		const videoTop = video.style.top || '0px';
		const videoLeft = video.style.left || '0px';
		if (layer?.style) {
			layer.style.maskPosition = `0px 0px, ${videoLeft} ${videoTop}`;
			layer.style.maskSize = `100% 100%, ${video.style.width} ${video.style.height}`;
		}
	}
}

/**
 * Creates and opens document picture-in-picture window of the video player container.
 * @param {Element} element element of video player container
 * @param {DOMStringMap} dataset dataset of injected `<script>` (self)
 * @returns {Promise<Window>} document picture-in-picture window
 */
async function openPip(element, dataset) {
	const parent = element.parentElement;
	if (!parent) throw new Error('No parent element.');
	const pipWindow = await top?.documentPictureInPicture?.requestWindow({
		width: parent.clientWidth,
		height: parent.clientHeight,
	});
	if (!pipWindow) throw new Error('Document Picture-in-Picture API is not implemented.');

	try {
		void pipWindow.origin;
	} catch (cause) {
		pipWindow.close();
		throw new Error('Access to document picture-in-picture window was denied.', { cause });
	}

	/** @type {Record<string, { key: string, alt: boolean }>} */
	const userDefinedHotkeys = JSON.parse(dataset.paramHotkeys ?? '{}');
	const disableHotkeys = disableKeyboardShortcutOnParentWindow.bind(userDefinedHotkeys);
	const enableHotkeys = enableKeyboardShortcutOnChildWindow.bind(userDefinedHotkeys);
	top?.addEventListener('keydown', disableHotkeys, true);
	pipWindow?.addEventListener('keydown', enableHotkeys, true);
	top?.addEventListener('yt-navigate-finish', onYtNavigateFinishDispatchPip, { passive: true });

	for (const attr of document.documentElement.attributes) {
		pipWindow.document.documentElement.attributes.setNamedItem(attr.cloneNode());
	}
	const pipMetaCharset = document.createElement('meta');
	pipMetaCharset.setAttribute('charset', 'utf-8');
	const pipTitle = document.createElement('title');
	pipTitle.textContent = document.querySelector('h1.ytd-watch-metadata')?.textContent || 'YouTube';
	const pipLink = document.createElement('link');
	pipLink.rel = 'stylesheet';
	pipLink.type = 'text/css';
	pipLink.href = dataset.paramCssUrl || '';
	const pipStyle = document.createElement('style');
	pipStyle.textContent = `\
	:root,body,body>*{height:100%;overflow:hidden}\
	.ytp-miniplayer-button,.ytp-size-button,.ytp-fullscreen-button{display:none!important}\
	#yt-lcf-pp{display:none!important}\
	`;

	/** @type {(HTMLLinkElement | HTMLStyleElement)[]} */
	const copiedStyles = [];
	for (const sheet of element.ownerDocument.styleSheets) {
		if (sheet.href) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.type = sheet.type;
			link.media = Array.from(sheet.media).join();
			link.href = sheet.href;
			copiedStyles.push(link);
		} else {
			try {
				const rules = sheet.cssRules;
				const style = document.createElement('style');
				style.textContent = Array.from(rules, rule => rule.cssText).join('');
				copiedStyles.push(style);
			} catch (err) {
				logger.warn(err, sheet.ownerNode);
			}
		}
	}
	pipWindow.document.head.append(pipMetaCharset, pipTitle, ...copiedStyles, pipLink, pipStyle);

	const pipMarker = document.createElement('span');
	pipMarker.id = 'yt-lcf-pip-marker';
	pipMarker.textContent = dataset.paramPipMarkerText || '';
	element.before(pipMarker);
	pipWindow.document.body.appendChild(element);
	pipWindow.document.body.dataset.browser = document.body.dataset.browser;

	const player = pipWindow.document.querySelector('ytd-player');
	const video = player?.querySelector('video');
	/** @type {?HTMLElement | undefined} */
	const overlay = player?.querySelector('.ytp-iv-video-content');

	video?.addEventListener('ytlcf-resize', onResizeVideo);
	video?.addEventListener('loadeddata', dispatchResizeVideo, { passive: true });
	if (video) video.style.pointerEvents = 'none';
	if (overlay) overlay.style.pointerEvents = 'none';

	pipWindow.addEventListener('ytlcf-pip-update', () => {
		const pipTitle = pipWindow.document.getElementsByTagName('title')[0];
		if (pipTitle) {
			const title = document.querySelector('h1.ytd-watch-metadata')?.textContent;
			pipTitle.textContent = title || 'YouTube';
		}
	});
	pipWindow.dispatchEvent(new CustomEvent('ytlcf-pip-update'));

	pipWindow.addEventListener('resize', () => {
		const video = pipWindow.document.querySelector('video');
		video?.dispatchEvent(new CustomEvent('ytlcf-resize', { detail: pipWindow }));
	}, { passive: true });

	pipWindow.addEventListener('pagehide', () => {
		const parent = pipMarker.parentElement || top?.document.getElementById('player-container-inner');
		parent?.append(element);
		if (parent && video) {
			video.style.width = `${parent.clientWidth | 0}px`;
			video.style.height = 'auto';
			video.style.top = video.style.left = '0px';
			/** @type {?HTMLElement} */
			const b = parent.querySelector('.ytp-chrome-bottom');
			if (b) {
				const left = Number.parseInt(b.style.left, 10);
				b.style.width = `${video.clientWidth - left * 2}px`;
			}
			video.removeEventListener('ytlcf-resize', onResizeVideo);
			video.removeEventListener('loadeddata', dispatchResizeVideo);
			video.style.pointerEvents = '';
			if (overlay) overlay.style.pointerEvents = '';
		}
		if (top?.document.contains(pipMarker)) pipMarker.remove();
		top?.removeEventListener('keydown', disableHotkeys, true);
		pipWindow.removeEventListener('keydown', enableHotkeys, true);
		top?.removeEventListener('yt-navigate-finish', onYtNavigateFinishDispatchPip);
	}, { passive: true });

	if (video) {
		const le = document.getElementById('yt-lcf-layer');
		if (le?.style.maskPosition) le.style.maskPosition = `0px 0px, ${video.style.left} ${video.style.top}`;
		if (le?.style.maskSize) le.style.maskSize = `100% 100%, ${video.style.width} ${video.style.height}`;
	}

	logger.info('PiP /w chat window is created successfully.');
	return pipWindow;

	function onYtNavigateFinishDispatchPip() {
		pipWindow?.dispatchEvent(new CustomEvent('ytlcf-pip-update'));
	}

	/** @this {HTMLVideoElement} */
	function dispatchResizeVideo() {
		this.dispatchEvent(new CustomEvent('ytlcf-resize', { detail: pipWindow }));
	}
}

/**
 * Updates size of progress bar in picture-in-picture window.
 * @param {Window} win picture-in-picture window
 */
function updateProgressBarSize(win) {
	/** @type {?HTMLElement} */
	const bottomElem = win.document.querySelector('.ytp-chrome-bottom');
	if (bottomElem) {
		const left = Number.parseInt(bottomElem.style.left, 10);
		const bottomWidth = win.innerWidth - left * 2;
		bottomElem.style.width = `${bottomWidth}px`;

		/** @type {?HTMLElement} */
		const progressBar = bottomElem.querySelector('.ytp-progress-bar');
		if (progressBar) {
			/** @type {?HTMLElement} */
			const hoverContainer = bottomElem.querySelector('.ytp-chapter-hover-container');
			const containerWidth = Number.parseInt(hoverContainer?.style.width || '0', 10);
			if (containerWidth > 0) {
				progressBar.style.transformOrigin = '0 0 0';
				progressBar.style.transform = `scaleX(${bottomWidth / containerWidth})`;
			}
		}
		/** @type {?HTMLElement} */
		const heatMap = bottomElem.querySelector('.ytp-heat-map-chapter');
		if (heatMap) {
			heatMap.style.width = '100%';
		}
	}
}

/**
 * @this {HTMLVideoElement}
 * @param {CustomEvent<Window>} e
 */
function onResizeVideo(e) {
	const { innerWidth: ww, innerHeight: wh } = e.detail;
	const { videoWidth: vw, videoHeight: vh } = this;
	if (!vw || !vh) return;
	const aspect = vw / vh;
	const w = Math.min(ww, (wh * aspect) | 0);
	const h = Math.min(wh, (w / aspect) | 0);
	this.style.height = `${h}px`;
	this.style.width = `${w}px`;
	this.style.left = `${Math.max(ww - w, 0) * .5}px`;
	this.style.top = `${Math.max(wh - h, 0) * .5}px`;
	updateProgressBarSize(e.detail);
}

/**
 * @this {Record<string, { key: string, alt: boolean }>}
 * @param {KeyboardEvent} e
 */
function disableKeyboardShortcutOnParentWindow(e) {
	if (['f', 'i', 't', 'escape'].includes(e.key.toLowerCase())) {
		e.stopPropagation();
	} else if (Object.values(this).some(h => h.key === e.key && h.alt === e.altKey)) {
		// transfer keyboard event to pip window
		top?.documentPictureInPicture?.window?.dispatchEvent(new KeyboardEvent('keydown', e));
	}
}

/**
 * @this {Record<string, { key: string, alt: boolean }>}
 * @param {KeyboardEvent} e
 */
function enableKeyboardShortcutOnChildWindow(e) {
	if (['f', 'i', 't', 'escape', 'k'].includes(e.key.toLowerCase())) return;
	if (!e.ctrlKey && !e.metaKey) {
		const document = popupWindow && !popupWindow.closed ? popupWindow.document : top?.documentPictureInPicture?.window?.document;
		switch (e.key) {
			case this.layer.key:
				if (!e.repeat && e.altKey === this.layer.alt) {
					const checkbox = /** @type {?HTMLElement} */ (document?.querySelector('#yt-lcf-cb'));
					return checkbox?.click();
				}
				break;
			case this.panel.key:
				if (!e.repeat && e.altKey === this.panel.alt) {
					const popupmenu = /** @type {?HTMLElement} */ (document?.querySelector('#yt-lcf-pm'));
					return popupmenu?.click();
				}
				break;
			case this.pip.key:
				if (!e.repeat && e.altKey === this.pip.alt) {
					const pipmenu = /** @type {?HTMLElement} */ (document?.querySelector('#yt-lcf-pp'));
					return pipmenu?.click();
				}
				break;
		}
	}
	// transfer keyboard event to parent window
	top?.document.dispatchEvent(new KeyboardEvent('keydown', e));
}
