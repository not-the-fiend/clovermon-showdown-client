/**
 * Client core
 *
 * No dependencies.
 * Does three unrelated things:
 * 1. sets up polyfills where necessary
 * 2. sets up PS's model base classes
 * 3. sets up the model and view for PS's backgrounds
 *
 * The background is mostly here so the new background can be loaded ASAP.
 *
 * @author Guangcong Luo <guancongluo@gmail.com>
 * @license AGPLv3
 */

/**********************************************************************
 * Polyfills
 *********************************************************************/

if (!Array.prototype.indexOf) {
	Array.prototype.indexOf = function (searchElement, fromIndex) {
		for (let i = (fromIndex || 0); i < this.length; i++) {
			if (this[i] === searchElement) return i;
		}
		return -1;
	};
}
if (!Array.prototype.includes) {
	Array.prototype.includes = function (thing) {
		return this.indexOf(thing) !== -1;
	};
}
if (!String.prototype.includes) {
	String.prototype.includes = function (thing) {
		return this.indexOf(thing) !== -1;
	};
}
if (!String.prototype.startsWith) {
	String.prototype.startsWith = function (thing) {
		return this.slice(0, thing.length) === thing;
	};
}
if (!String.prototype.endsWith) {
	String.prototype.endsWith = function (thing) {
		return this.slice(-thing.length) === thing;
	};
}
if (!String.prototype.trim) {
	String.prototype.trim = function () {
		return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
	};
}
if (!Object.assign) {
	Object.assign = function (thing: any, rest: any) {
		for (let i = 1; i < arguments.length; i++) {
			let source = arguments[i];
			for (let k in source) {
				thing[k] = source[k];
			}
		}
		return thing;
	};
}
if (!Object.create) {
	Object.create = function (proto: any) {
		function F() {}
		F.prototype = proto;
		return new (F as any)();
	};
}
if (!window.console) {
	// in IE8, the console object is only defined when devtools is open
	// I don't actually know if this will cause problems when you open devtools,
	// but that's something I can figure out if I ever bother testing in IE8
	(window as any).console = {
		log() {},
	};
}

/**********************************************************************
 * PS Models
 *********************************************************************/
// PS's model classes are defined here

const PSURL = `${document.location!.protocol !== 'http:' ? 'https:' : ''}//${Config.routes.client}/`;

class PSSubscription {
	observable: PSModel | PSStreamModel<any>;
	listener: (value?: any) => void;
	constructor(observable: PSModel | PSStreamModel<any>, listener: (value?: any) => void) {
		this.observable = observable;
		this.listener = listener;
	}
	unsubscribe() {
		const index = this.observable.subscriptions.indexOf(this);
		if (index >= 0) this.observable.subscriptions.splice(index, 1);
	}
}

/**
 * PS Models roughly implement the Observable spec. Not the entire
 * spec - just the parts we use. PSModel just notifies subscribers of
 * updates - a simple model for React.
 */
class PSModel {
	subscriptions = [] as PSSubscription[];
	subscribe(listener: () => void) {
		const subscription = new PSSubscription(this, listener);
		this.subscriptions.push(subscription);
		return subscription;
	}
	subscribeAndRun(listener: () => void) {
		const subscription = this.subscribe(listener);
		subscription.listener();
		return subscription;
	}
	update() {
		for (const subscription of this.subscriptions) {
			subscription.listener();
		}
	}
}

/**
 * PS Models roughly implement the Observable spec. PSStreamModel
 * streams some data out. This is very not-React, which generally
 * expects the DOM to be a pure function of state. Instead PSModels
 * which hold state, PSStreamModels give state directly to views,
 * so that the model doesn't need to hold a redundant copy of state.
 */
class PSStreamModel<T = string> {
	subscriptions = [] as PSSubscription[];
	updates = [] as T[];
	subscribe(listener: (value: T) => void) {
		// TypeScript bug
		const subscription: PSSubscription = new PSSubscription(this, listener);
		this.subscriptions.push(subscription);
		if (this.updates.length) {
			for (const update of this.updates) {
				subscription.listener(update);
			}
			this.updates = [];
		}
		return subscription;
	}
	subscribeAndRun(listener: (value: T) => void) {
		const subscription = this.subscribe(listener);
		subscription.listener(null);
		return subscription;
	}
	update(value: T) {
		if (!this.subscriptions.length) {
			// save updates for later
			this.updates.push(value);
		}
		for (const subscription of this.subscriptions) {
			subscription.listener(value);
		}
	}
}

// type JSONObject = {[k: string]: JSONValue};
// type JSONArray = JSONValue[];
// type JSONValue = number | string | boolean | null | JSONObject | JSONArray;

/**********************************************************************
 * Background Model
 *********************************************************************/

declare const ColorThief: any;

/**
 * PS background model. Separate from PSPrefs because unlike prefs,
 * backgrounds can be set separately per server, instead of being
 * shared among all servers.
 *
 * Streams the current URL
 */
const PSBackground = new class extends PSStreamModel {
	id = '';
	curId = '';
	attrib: {url: string, title: string, artist: string} | null = null;
	changeCount = 0;
	menuColors: string[] | null = null;

	constructor() {
		super();
		try {
			let bg = localStorage.getItem('showdown_bg')!.split('\n');
			if (bg.length === 1) {
				this.set('', bg[0]);
			} else if (bg.length === 2) {
				this.set(bg[0], bg[1]);
			} else if (bg.length >= 7) {
				this.set(bg[0], bg[1], bg.slice(2));
			}
		} catch {}
	}
	save(bgUrl: string) {
		if (this.id !== 'custom') {
			localStorage.setItem('showdown_bg', this.id);
		} else if (this.menuColors) {
			localStorage.setItem('showdown_bg', bgUrl + '\n' + this.id + '\n' + this.menuColors.join('\n'));
		}
	}

	set(bgUrl: string, bgid: string, menuColors: string[] | null = null) {
		// id
		this.id = bgid;

		// curid
		if (!bgid) {
			if (location.host === 'smogtours.psim.us') {
				bgid = 'shaymin';
			} else if (location.host === Config.routes.client) {
				const bgs = ['blobbos-beach', 'team-forest', 'brock-space', 'kymmi-beach', 'creepy-keks', 'dude-weed-lmao', 'demiwaifu', 'aesthetic-marleyzard', 'friday-night'];
				bgid = bgs[Math.floor(Math.random() * bgs.length)];
				if (bgid === this.curId) bgid = bgs[Math.floor(Math.random() * bgs.length)];
			}
		}
		this.curId = bgid;

		if (!bgUrl) {
			bgUrl = (bgid === 'solidblue' ? '#344b6c' : PSURL + 'fx/client-bg-' + bgid + '.jpg');
		}

		// April Fool's 2016 - Digimon theme
		// bgid = 'digimon';
		// bgUrl = PSURL + 'sprites/afd/digimonbg.jpg';

		this.changeCount++;

		// menuColors, attrib
		let attrib = null;
		switch (bgid) {
		case 'horizon':
			menuColors = [
				"318.87640449438203,35.177865612648226%",
				"216,46.2962962962963%",
				"221.25,32.25806451612904%",
				"197.8021978021978,52.60115606936417%",
				"232.00000000000003,19.480519480519483%",
				"228.38709677419354,60.7843137254902%",
			];
			attrib = {
				url: 'https://vtas.deviantart.com/art/Pokemon-Horizon-312267168',
				title: 'Horizon',
				artist: 'Vivian Zou',
			};
			break;
		case 'ocean':
			menuColors = [
				"82.8169014084507,34.63414634146342%",
				"216.16438356164383,29.55465587044534%",
				"212.92682926829266,59.42028985507245%",
				"209.18918918918916,57.51295336787566%",
				"199.2857142857143,48.275862068965495%",
				"213.11999999999998,55.06607929515419%",
			];
			attrib = {
				url: 'https://quanyails.deviantart.com/art/Sunrise-Ocean-402667154',
				title: 'Sunrise Ocean',
				artist: 'Yijing Chen',
			};
			break;
		case 'waterfall':
			menuColors = [
				"119.31034482758622,37.66233766233767%",
				"184.36363636363635,23.012552301255226%",
				"108.92307692307692,37.14285714285714%",
				"70.34482758620689,20.567375886524818%",
				"98.39999999999998,36.76470588235296%",
				"140,38.18181818181818%",
			];
			attrib = {
				url: 'https://yilx.deviantart.com/art/Irie-372292729',
				title: 'Irie',
				artist: 'Samuel Teo',
			};
			break;
		case 'shaymin':
			menuColors = [
				"39.000000000000064,21.7391304347826%",
				"170.00000000000003,2.380952380952378%",
				"157.5,11.88118811881188%",
				"174.78260869565216,12.041884816753928%",
				"185.00000000000003,12.76595744680851%",
				"20,5.660377358490567%",
			];
			attrib = {
				url: 'http://cargocollective.com/bluep',
				title: 'Shaymin',
				artist: 'Daniel Kong',
			};
			break;
		case 'charizards':
			menuColors = [
				"37.159090909090914,74.57627118644066%",
				"10.874999999999998,70.79646017699115%",
				"179.51612903225808,52.10084033613446%",
				"20.833333333333336,36.73469387755102%",
				"192.3076923076923,80.41237113402063%",
				"210,29.629629629629633%",
			];
			attrib = {
				url: 'https://seiryuuden.deviantart.com/art/The-Ultimate-Mega-Showdown-Charizards-414587079',
				title: 'Charizards',
				artist: 'Jessica Valencia',
			};
			break;
		case 'digimon':
			menuColors = [
				"170.45454545454544,27.500000000000004%",
				"84.70588235294119,13.821138211382115%",
				"112.50000000000001,7.8431372549019605%",
				"217.82608695652175,54.761904761904766%",
				"0,1.6949152542372816%",
				"",
			];
		}
		if (!menuColors && bgUrl.charAt(0) === '#') {
			const r = parseInt(bgUrl.slice(1, 3), 16) / 255;
			const g = parseInt(bgUrl.slice(3, 5), 16) / 255;
			const b = parseInt(bgUrl.slice(5, 7), 16) / 255;
			const hs = this.getHueSat(r, g, b);
			menuColors = [hs, hs, hs, hs, hs, hs];
		}
		this.attrib = attrib;
		this.menuColors = menuColors;
		if (!menuColors) {
			this.extractMenuColors(bgUrl);
		} else {
			this.save(bgUrl);
		}
	}
	extractMenuColors(bgUrl: string) {
		const changeCount = this.changeCount;
		// We need the image object to load it on a canvas to detect the main color.
		const img = new Image();
		img.onload = () => {
			if (changeCount === PSBackground.changeCount) return;
			// in case ColorThief throws from canvas,
			// or localStorage throws
			try {
				const colorThief = new ColorThief();
				const colors = colorThief.getPalette(img, 5);

				let menuColors = [];
				if (!colors) {
					menuColors = ['0, 0%', '0, 0%', '0, 0%', '0, 0%', '0, 0%'];
				} else {
					for (let i = 0; i < 5; i++) {
						const color = colors[i];
						const hs = PSBackground.getHueSat(color[0] / 255, color[1] / 255, color[2] / 255);
						menuColors.unshift(hs);
					}
				}
				this.menuColors = menuColors;
				PSBackground.save(bgUrl);
			} catch {}
		};
		img.src = bgUrl;
	}
	getHueSat(r: number, g: number, b: number) {
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		if (max === min) {
			return `0,0%`;
		}
		const l = (max + min) / 2;
		const d = max - min;
		const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		let h = 0;
		switch (max) {
		case r: h = (g - b) / d + (g < b ? 6 : 0); break;
		case g: h = (b - r) / d + 2; break;
		case b: h = (r - g) / d + 4; break;
		}
		h /= 6;
		return `${h * 360},${s * 100}%`;
	}
};

/**********************************************************************
 * Core Views
 *********************************************************************/

PSBackground.subscribe(bgUrl => {
	if (!PSBackground.curId) {
		document.body.style.background = '';
		document.body.style.backgroundSize = '';
		const buttonStyleElem = document.getElementById('mainmenubuttoncolors');
		if (buttonStyleElem) buttonStyleElem.textContent = ``;
		return;
	}

	if (bgUrl !== null) {
		let background;
		if (bgUrl.charAt(0) === '#') {
			background = bgUrl;
		} else if (PSBackground.curId !== 'custom') {
			background = `#546bac url(${bgUrl}) no-repeat left center fixed`;
		} else {
			background = `#546bac url(${bgUrl}) no-repeat center center fixed`;
		}
		document.body.style.background = background;
		document.body.style.backgroundSize = 'cover';
	}

	// main menu button colors
	let cssBuf = ``;
	let n = 0;
	if (PSBackground.menuColors) {
		for (const hs of PSBackground.menuColors) {
			n++;
			cssBuf += `body .button.mainmenu${n} { background: linear-gradient(to bottom,  hsl(${hs},72%),  hsl(${hs},52%)); border-color: hsl(${hs},40%); }\n`;
			cssBuf += `body .button.mainmenu${n}:hover { background: linear-gradient(to bottom,  hsl(${hs},62%),  hsl(${hs},42%)); border-color: hsl(${hs},21%); }\n`;
			cssBuf += `body .button.mainmenu${n}:active { background: linear-gradient(to bottom,  hsl(${hs},42%),  hsl(${hs},58%)); border-color: hsl(${hs},21%); }\n`;
		}
	}
	let buttonStyleElem = document.getElementById('mainmenubuttoncolors');
	if (!buttonStyleElem) {
		if (cssBuf) {
			buttonStyleElem = new HTMLStyleElement();
			buttonStyleElem.id = 'mainmenubuttoncolors';
			buttonStyleElem.textContent = cssBuf;
			document.head!.appendChild(buttonStyleElem);
		}
	} else {
		buttonStyleElem.textContent = cssBuf;
	}
});
// '<a href="https://vtas.deviantart.com/art/Pokemon-Horizon-312267168" target="_blank" class="subtle">"Horizon" <small>background by Vivian Zou</small></a>';
// if (attrib) attrib = '<small style="display:block;padding-bottom:4px">' + attrib + '</small>';
