import { VNode as OVNode, h } from '@cycle/dom';
import { adapt, setAdapt } from '@cycle/run/lib/adapt'
import { FantasyObservable, Driver, Sinks } from '@cycle/run';
import { default as xstream, Stream } from 'xstream';
import * as uuid from 'uuid/v4';
import * as most from 'most';

export interface VNode {
	t: string,
	o: Object,
	c: VNodeCildren
}
export type VNodeCildren = Array<VNode | string>;

export enum DOMAction {
	UPDATE,
	EVENT,
	ATTACH,
	DETACH
}

export type DOMListenerOptions = {
	preventDefault?: boolean,
	stopPropagation?: boolean,
	stopImmediatePropagation?: boolean,
	useCapture?: boolean
}

export type DOMAttachment = {
	selector: string,
	events: string,
	listener: string,
	options: DOMListenerOptions
}

export type DOMDetachment = {
	listener: string
}

export type DOMEvent = {
	type: string,
	listener: string
}

export type DOMMessage = {
	action: DOMAction,
	message: VNode | DOMAttachment | DOMDetachment | DOMEvent
}

// TSX React nameSpace for TypeScript
export const Crux = {
	createElement(tagName: string, options: Object, children: VNodeCildren): VNode {
		return {
			t: tagName,
			o: options || {},
			c: children || []
		}
	}
}

// Transpose data VNode to VNode_ for snabbdom
export function transpose(node: VNode): OVNode {
	return h(node.t, node.o, node.c.map(n => typeof n === 'string' ? n : transpose(n)));
};

export function makeDOMDriver(rx: MessagePort, tx: MessagePort) {
	
	return (source$: FantasyObservable, ...rest) => {
		// send VNODE updates to main thread
		source$.subscribe(({
			next: (msg: VNode) => tx.postMessage({
				action: DOMAction.UPDATE,
				message: msg
			} as DOMMessage),
			error: e => console.error(e),
			complete: _ => null
		}));

		rx.start();

		// create the listener in the worker thread
		// and notify the parent thread to attach and detach the listener
		function listener(selector: string, events: string, options: DOMListenerOptions, listener: string): Stream<DOMEvent> {

			return xstream.create<DOMEvent>({
				// setup
				start: (observer) => {
					tx.postMessage({
						action: DOMAction.ATTACH,
						message: {
							listener,
							selector,
							events,
							options
						}
					} as DOMMessage)
					let callback = (e: MessageEvent) => {
						const event = e.data.message as DOMEvent;
						// if it is a DOMAction EVENT and the id matches
						if (
								e.data.action === DOMAction.EVENT &&
								e.data.message.listener === listener
							) {
							observer.next(event);
						}
					}
					rx.addEventListener('message', callback);
				},
				// cleanup
				stop: () => {
					tx.postMessage({
						action: DOMAction.DETACH,
						message: {
							listener
						}
					} as DOMMessage)
					rx.removeEventListener('message', callback);
				}
			});
		}

		// select method
		function select(selector: string) {
			return {
				select: (sel) => select(`${selector} ${sel}`),
				events: (events: string, options = {} as DOMListenerOptions) => {
						return adapt(listener(
							selector,
							events,
							options,
							uuid()
						));
					}
			};
		}

		return {
			select,
			// optimistic isolate
			isolateSource (source: any, scope: string) {
				
				return {
					select: (sel) => source.select(`x-thread[x-scope="${scope}"] ${sel} `)
				}
			},
			// optimistic isoloate
			isolateSink (sink: Stream<VNode>, scope: string) {
				
				return sink.map((vnode: VNode): VNode => ({
					t: 'x-thread',
					o: {
						attrs : {
							'x-scope' : scope
						}
					},
					c: [vnode]
				}))
			}
		}
	}
};