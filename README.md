# Tapable

tapable 对外暴露了许多 Hook 类，以便为插件创建 hook.

``` javascript
const {
	SyncHook,
	SyncBailHook,
	SyncWaterfallHook,
	SyncLoopHook,
	AsyncParallelHook,
	AsyncParallelBailHook,
	AsyncSeriesHook,
	AsyncSeriesBailHook,
	AsyncSeriesWaterfallHook
 } = require("tapable");
```

## 安装

``` shell
npm install --save tapable
```

## 用法

所有 Hook 构造函数都接受一个可选参数，参数类型为字符串数组.

``` js
const hook = new SyncHook(["arg1", "arg2", "arg3"]);
```

最佳实践是在 `hooks` 属性中暴露所有的 hook:

``` js
class Car {
	constructor() {
		this.hooks = {
			accelerate: new SyncHook(["newSpeed"]),
			brake: new SyncHook(),
			calculateRoutes: new AsyncParallelHook(["source", "target", "routesList"])
		};
	}

	/* ... */
}
```

其他人现在就可以使用上面那些 hook：

``` js
const myCar = new Car();

// 使用 tap() 方法添加一个插件
myCar.hooks.brake.tap("WarningLampPlugin", () => warningLamp.on());
```

使用 `tap` 时必须给插件/原因(原因是指拦截器)命名.

第二个回调函数参数，可以接收参数:

``` js
myCar.hooks.accelerate.tap("LoggerPlugin", newSpeed => console.log(`Accelerating to ${newSpeed}`));
```

对于同步 hook，  `tap` 是添加插件唯一有效的方法。异步 hook，可以使用 `tapPromise` `tapAsync` 方法， 也支持异步插件：

``` js
myCar.hooks.calculateRoutes.tapPromise("GoogleMapsPlugin", (source, target, routesList) => {
	// 返回一个 promise
	return google.maps.findRoute(source, target).then(route => {
		routesList.add(route);
	});
});
myCar.hooks.calculateRoutes.tapAsync("BingMapsPlugin", (source, target, routesList, callback) => {
	bing.findRoute(source, target, (err, route) => {
		if(err) return callback(err);
		routesList.add(route);
		// 调用 callback
		callback();
	});
});

// 异步 hook，你仍然可以使用 tap 创建同步插件
myCar.hooks.calculateRoutes.tap("CachedRoutesPlugin", (source, target, routesList) => {
	const cachedRoute = cache.get(source, target);
	if(cachedRoute)
		routesList.add(cachedRoute);
})
```
类声明了这些 hook，如何调用他们：

``` js
class Car {
	/**
		* SyncHook 和 AsyncParallelHook 不会返回值，
		* 要获取返回值，使用 SyncWaterfallHook 和 AsyncSeriesWaterfallHook 
	 **/

	setSpeed(newSpeed) {
		// 即使返回值，下面的调用也会返回 undefined
		this.hooks.accelerate.call(newSpeed);
	}

	useNavigationSystemPromise(source, target) {
		const routesList = new List();
		return this.hooks.calculateRoutes.promise(source, target, routesList).then((res) => {
			// AsyncParallelHook 的 res 是 undefined
			return routesList.getRoutes();
		});
	}

	useNavigationSystemAsync(source, target, callback) {
		const routesList = new List();
		this.hooks.calculateRoutes.callAsync(source, target, routesList, err => {
			if(err) return callback(err);
			callback(null, routesList.getRoutes());
		});
	}
}
```

Hook 将会编译一个方法，使用最有效的方式运行你的插件。根据以下条件生成代码：
* 注册的插件数量（无，一个，多个）
* 注册的插件类型（同步，异步，promise）
* 调用方法（同步，异步，promise）
* 参数数量
* 是否使用了拦截器

确保尽快执行

## Hook 类型

每个 hook 可以被一个或多个函数调用。如何执行取决于 hook 类型：

* 基础 hook（值名字中没有 “Waterfall”，“Bail”，“Loop”）。这种 hook 按照 `tap` 注册顺序依次调用所有函数。

* __Waterfall__. waterfall hook 虽然也会按照 `tap` 注册顺序依次调用函数，但与 base hook 不同的是，每次调用函数会返回一个值，该值作为下一个函数的参数。

* __Bail__. bail hook 允许提现退出运行。当执行任意被 `tap` 注册的函数返回任何值时，bail hook 就停止执行剩余的函数。

* __Loop__. 当任何一个插件返回一个非 `undefined` 值时，loop hook 就重新重头开始执行，直至所有插件都返回 `undefined`。

此外，hook 可以是同步的，也可以是异步的。通过 “Sync”, “AsyncSeries” 和 “AsyncParallel” 区分 hook 类型：

* __Sync__. 同步 hook 只能用同步的 `tap` 来注册 (using `myHook.tap()`).

* __AsyncSeries__. 异步串行 hook，不仅可以使用同步 `tap` 也可以使用异步 `tapAsync` `tapPromise` 注册 (using `myHook.tap()`, `myHook.tapAsync()` and `myHook.tapPromise()`). 按顺序执行每一个异步函数

* __AsyncParallel__. 异步并行 hook，不仅可以使用同步 `tap` 也可以使用异步 `tapAsync` `tapPromise` 注册 (using `myHook.tap()`, `myHook.tapAsync()` and `myHook.tapPromise()`). 但是，每一个异步函数是并行的.

hook 的类型都通过 hook 类名反映出来。例如 `AsyncSeriesWaterfallHook` 允许异步函数，并且以串行方式运行它们，将每个函数的返回值传递给下一个函数。


## 拦截器

所有 hook 都额外提供拦截 API:

``` js
myCar.hooks.calculateRoutes.intercept({
	call: (source, target, routesList) => {
		console.log("Starting to calculate routes");
	},
	register: (tapInfo) => {
		// tapInfo = { type: "promise", name: "GoogleMapsPlugin", fn: ... }
		console.log(`${tapInfo.name} is doing its job`);
		return tapInfo; //可能返回一个新的 tapInfo 对象
	}
})
```

**call**: `(...args) => void` 在拦截器中添加 `call` ，当 hook 触发时，拦截器的 `call` 就会被触发，可以访问 hook 参数

**tap**: `(tap: Tap) => void` 在拦截器中添加 `tap`，当插件添加通过 `tap` 添加 hook 时触发。提供一个 `Tap` 对象，但是不可以修改。 

**loop**: `(...args) => void` 在拦截器中添加 `loop`，每一次循环 循环hook 时触发。

**register**: `(tap: Tap) => Tap | undefined` 在拦截器中添加 `register`，每次通过 `tap` 添加 hook 时触发。提供一个 `Tap` 对象，可以修改。

## 上下文对象 Context

插件和拦截器可以选择访问可选 context 对象，该对象可用于将任意值传递给后续插件和拦截器。

``` js
myCar.hooks.accelerate.intercept({
	context: true,
	tap: (context, tapInfo) => {
		// tapInfo = { type: "sync", name: "NoisePlugin", fn: ... }
		console.log(`${tapInfo.name} is doing it's job`);

		// 如果至少有个一插件使用 `context: true`，那么 `context` 对象是{}。否则就是 undefined。
		if (context) {
			// 任意属性可以被添加到 `context`对象，插件可以访问这些属性。
			context.hasMuffler = true;
		}
	}
});

myCar.hooks.accelerate.tap({
	name: "NoisePlugin",
	context: true
}, (context, newSpeed) => {
	if (context && context.hasMuffler) {
		console.log("Silence...");
	} else {
		console.log("Vroom!");
	}
});
```

## HookMap

HookMap 一个辅助类，帮助管理多个 hook.

``` js
const keyedHook = new HookMap(key => new SyncHook(["arg"]))
```

``` js
keyedHook.for("some-key").tap("MyPlugin", (arg) => { /* ... */ });
keyedHook.for("some-key").tapAsync("MyPlugin", (arg, callback) => { /* ... */ });
keyedHook.for("some-key").tapPromise("MyPlugin", (arg) => { /* ... */ });
```

``` js
const hook = keyedHook.get("some-key");
if(hook !== undefined) {
	hook.callAsync("arg", err => { /* ... */ });
}
```

## Hook/HookMap interface

Public:

``` ts
interface Hook {
	tap: (name: string | Tap, fn: (context?, ...args) => Result) => void,
	tapAsync: (name: string | Tap, fn: (context?, ...args, callback: (err, result: Result) => void) => void) => void,
	tapPromise: (name: string | Tap, fn: (context?, ...args) => Promise<Result>) => void,
	intercept: (interceptor: HookInterceptor) => void
}

interface HookInterceptor {
	call: (context?, ...args) => void,
	loop: (context?, ...args) => void,
	tap: (context?, tap: Tap) => void,
	register: (tap: Tap) => Tap,
	context: boolean
}

interface HookMap {
	for: (key: any) => Hook,
	intercept: (interceptor: HookMapInterceptor) => void
}

interface HookMapInterceptor {
	factory: (key: any, hook: Hook) => Hook
}

interface Tap {
	name: string,
	type: string
	fn: Function,
	stage: number,
	context: boolean,
	before?: string | Array
}
```

受保护（仅适用于包含 hook 的类）:

``` ts
interface Hook {
	isUsed: () => boolean,
	call: (...args) => Result,
	promise: (...args) => Promise<Result>,
	callAsync: (...args, callback: (err, result: Result) => void) => void,
}

interface HookMap {
	get: (key: any) => Hook | undefined,
	for: (key: any) => Hook
}
```

## MultiHook

类 hook 辅助类，将 tap 重定向到多个其他 hook:

``` js
const { MultiHook } = require("tapable");

this.hooks.allHooks = new MultiHook([this.hooks.hookA, this.hooks.hookB]);
```
