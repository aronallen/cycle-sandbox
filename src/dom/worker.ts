import { WorkerConnector } from '../types';
import { default as xs, Stream, Subscription} from 'xstream';
import { VNode, h } from '@cycle/dom';
import { default as uuid} from 'uuid/v4';

import fromEvent from 'xstream/extra/fromevent';

import {
  adapt
} from '@cycle/run/lib/adapt';

import {
  WorkerDOMMessage,
  WorkerDOMMessageCommand,
  WorkerDOMListenerOptions,
  EventSynthesis,
  WorkerDOMEvent
} from './main';

export const DOMWorkerConnector: WorkerConnector = (rx, tx) => {
  rx.start();
  tx.start();
  return (sink$: Stream<VNode>): any => {
    
    sink$.subscribe({
      next (vnode) {
        const message: WorkerDOMMessage = {
          cmd: WorkerDOMMessageCommand.vnode,
          payload: vnode
        }
        tx.postMessage(message);
      },
      error (error) {
        console.error(error);
      },
      complete () {
        rx.close();
        tx.close();
      }
    })
    
    function select (selector: string) {
      return {
        select: (suffix: string) => select(`${selector} ${suffix} `),
        events: (events: string, options?: WorkerDOMListenerOptions): Stream<EventSynthesis> => {
          const listenerId = uuid();
          let subscription: Subscription;
          return adapt(xs.create({
            start(observer) {
              const attachMessage = {
                cmd: WorkerDOMMessageCommand.attach,
                payload: {
                  selector: selector,
                  events: events,
                  options: options,
                  listenerId
                }
              }
              tx.postMessage(attachMessage);
              subscription = fromEvent(rx, 'message')
                .filter(e => (e.data as WorkerDOMEvent).listenerId === listenerId)
                .subscribe({
                  next (event) {
                    const payload = event.data.payload as EventSynthesis;
                    observer.next(payload);
                  },
                  error (error) {
                    console.error(error)
                  },
                  complete () {

                  }
                })
            },
            stop() {
              const detachMessage = {
                cmd: WorkerDOMMessageCommand.detach,
                payload: {
                  listenerId
                }
              }
              tx.postMessage(detachMessage);
              subscription.unsubscribe();
            }
          }) as Stream<EventSynthesis>);
        }
      }
    }
    return {
      select,
      isolateSource (source: any, scope: string) {
				return {
					select: (sel) => select(`[x-scope="${scope}"] ${sel} `)
				}
			},
			// optimistic isoloate
			isolateSink (sink: Stream<VNode>, scope: string) {
				return sink.map(
          (vnode: VNode): VNode => h('span', {attrs: {'x-scope': scope}}, [vnode])
        );
			}
    }
  }
}