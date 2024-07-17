/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
"use strict";

const util = require("util");

// 发出警告，Hook.context 已废弃
const deprecateContext = util.deprecate(() => {},
"Hook.context is deprecated and will be removed");

const CALL_DELEGATE = function(...args) {
	this.call = this._createCall("sync");
	return this.call(...args);
};
const CALL_ASYNC_DELEGATE = function(...args) {
	this.callAsync = this._createCall("async");
	return this.callAsync(...args);
};
const PROMISE_DELEGATE = function(...args) {
	this.promise = this._createCall("promise");
	return this.promise(...args);
};

class Hook {
	constructor(args = [], name = undefined) {
		// 实例化时，构造函数参数
		this._args = args;
		this.name = name;
		// tap 注册的函数，里面是 Tap 对象
		this.taps = [];
		// 收集拦截器
		this.interceptors = [];
		// comile 函数动态创建的函数
		this._call = CALL_DELEGATE;
		this.call = CALL_DELEGATE;
		this._callAsync = CALL_ASYNC_DELEGATE;
		this.callAsync = CALL_ASYNC_DELEGATE;
		this._promise = PROMISE_DELEGATE;
		this.promise = PROMISE_DELEGATE;
		this._x = undefined;

		this.compile = this.compile;
		this.tap = this.tap;
		this.tapAsync = this.tapAsync;
		this.tapPromise = this.tapPromise;
	}

	// compile 为抽象方法，必须要被重写
	compile(options) {
		throw new Error("Abstract: should be overridden");
	}

	_createCall(type) {
		// 调用 compile 函数，使用 HookCodeFactory 动态创建函数
		return this.compile({
			taps: this.taps,
			interceptors: this.interceptors,
			args: this._args,
			type: type
		});
	}

	// 插入 tap 到 this.taps 中
	_tap(type, options, fn) {
		// 校验 options.name 属性
		if (typeof options === "string") {
			options = {
				name: options.trim()
			};
		} else if (typeof options !== "object" || options === null) {
			throw new Error("Invalid tap options");
		}
		if (typeof options.name !== "string" || options.name === "") {
			throw new Error("Missing name for tap");
		}
		// 警告：options.context 已废弃
		if (typeof options.context !== "undefined") {
			deprecateContext();
		}
		options = Object.assign({ type, fn }, options);
		// 帮助 拦截器， register 函数修改 options
		options = this._runRegisterInterceptors(options);
		// 把 options 插入到 this.taps 中
		this._insert(options);
	}

	tap(options, fn) {
		this._tap("sync", options, fn);
	}

	tapAsync(options, fn) {
		this._tap("async", options, fn);
	}

	tapPromise(options, fn) {
		this._tap("promise", options, fn);
	}

	// 帮助拦截器， register 函数修改 options
	_runRegisterInterceptors(options) {
		for (const interceptor of this.interceptors) {
			// 这就是 readme 中提到的 register 函数，用于修改 options
			if (interceptor.register) {
				const newOptions = interceptor.register(options);
				if (newOptions !== undefined) {
					options = newOptions;
				}
			}
		}
		return options;
	}

	withOptions(options) {
		const mergeOptions = opt =>
			Object.assign({}, options, typeof opt === "string" ? { name: opt } : opt);

		return {
			name: this.name,
			tap: (opt, fn) => this.tap(mergeOptions(opt), fn),
			tapAsync: (opt, fn) => this.tapAsync(mergeOptions(opt), fn),
			tapPromise: (opt, fn) => this.tapPromise(mergeOptions(opt), fn),
			intercept: interceptor => this.intercept(interceptor),
			isUsed: () => this.isUsed(),
			withOptions: opt => this.withOptions(mergeOptions(opt))
		};
	}

	isUsed() {
		return this.taps.length > 0 || this.interceptors.length > 0;
	}

	intercept(interceptor) {
		// 重置 call callAsync promise 函数
		this._resetCompilation();
		// 收集拦截器
		this.interceptors.push(Object.assign({}, interceptor));
		if (interceptor.register) {
			for (let i = 0; i < this.taps.length; i++) {
				// 触发 register 函数，修改 tap
				this.taps[i] = interceptor.register(this.taps[i]);
			}
		}
	}

	// 重置 call callAsync promise 函数
	_resetCompilation() {
		this.call = this._call;
		this.callAsync = this._callAsync;
		this.promise = this._promise;
	}

	// 按照 before 与 stage 将 item 插入到 this.taps 中
	_insert(item) {
		this._resetCompilation();
		let before;
		// 处理 before 属性，放到 Set 中
		if (typeof item.before === "string") {
			before = new Set([item.before]);
		} else if (Array.isArray(item.before)) {
			before = new Set(item.before);
		}
		let stage = 0;
		if (typeof item.stage === "number") {
			stage = item.stage;
		}
		let i = this.taps.length;
		// 从后向前遍历，将 item 按照 before 与 stage 插入到合适的位置
		while (i > 0) {
			i--;
			const x = this.taps[i];
			// 将当前元素移到后面，方便后续将元素插入到正确位置
			this.taps[i + 1] = x;
			const xStage = x.stage || 0;
			if (before) {
				// before 属性中存在当前元素，则跳过
				if (before.has(x.name)) {
					before.delete(x.name);
					continue;
				}
				// 如果before集合仍有元素，继续遍历。
				if (before.size > 0) {
					continue;
				}
			}
			// 如果`x.stage` 大于 `item.stage`，继续遍历。
			if (xStage > stage) {
				continue;
			}
			i++;
			break;
		}
		this.taps[i] = item;
	}
}

Object.setPrototypeOf(Hook.prototype, null);

module.exports = Hook;
