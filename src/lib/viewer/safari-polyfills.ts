// pdf.js가 쓰는데 Safari에 없는(또는 늦게 들어온) 웹 표준 API 두 개를 최소 폴리필로 메운다.
// 메인 스레드와 워커는 전역 범위가 따로라서 이 파일을 양쪽(PdfViewer, pdf-worker-entry)에서 불러온다.
// 폴리오 web/src/utils/safari-polyfills.js에서 옮김.

type WithResolvers = <T>() => {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
};

// 1) Promise.withResolvers: iOS 17.4 미만 Safari에 없다.
const promiseCtor = Promise as unknown as { withResolvers?: WithResolvers };
if (typeof promiseCtor.withResolvers !== 'function') {
	promiseCtor.withResolvers = <T>() => {
		let resolve!: (value: T | PromiseLike<T>) => void;
		let reject!: (reason?: unknown) => void;
		const promise = new Promise<T>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		return { promise, resolve, reject };
	};
}

// 2) ReadableStream.prototype[Symbol.asyncIterator]: Safari가 오래 구현하지 않았다(WebKit bug 194379).
// pdf.js는 getTextContent에서 `for await (const value of readableStream)`로 이것을 직접 쓴다.
if (typeof ReadableStream !== 'undefined') {
	const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>;
	if (!proto[Symbol.asyncIterator]) {
		proto[Symbol.asyncIterator] = function (this: ReadableStream<unknown>) {
			const reader = this.getReader();
			return {
				next() {
					return reader.read();
				},
				return(value?: unknown) {
					reader.releaseLock();
					return Promise.resolve({ done: true as const, value });
				},
				[Symbol.asyncIterator]() {
					return this;
				}
			};
		};
	}
}

export {};
