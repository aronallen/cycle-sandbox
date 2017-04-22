import fromEvent from 'xstream/extra/fromevent';
import xs from 'xstream';
import { Stream, Subscription} from 'xstream';
import * as uuid from 'uuid/v4';

import {
  Drivers,
  run as defaultRun,
  CycleProgram,
  FantasyObservable,
  DisposeFunction,
  Sources,
  FantasySinks,
} from '@cycle/run';

import {
  adapt
} from '@cycle/run/lib/adapt';

import {
  SandboxMessage,
  SandboxMessageCommand,
  createChannels,
  portMap,
  VNode,
  WorkerDOMMessage,
  WorkerDOMMessageCommand,
  WorkerDOMListenerOptions,
  EventSynthesis,
  WorkerDOMEvent
} from './sandbox';

type WorkerDriver = (rx: MessagePort, tx: MessagePort) => (source$: Stream<VNode>) => any;

type WorkerDrivers = {
  [key: string]: WorkerDriver
}

export function setup (
  component: (Sources: Sources) => FantasySinks<any>,
  drivers: Drivers<FantasyObservable, any>,
  workerDrivers: WorkerDrivers,
  run = defaultRun
) {
  fromEvent(self, 'message')
    .map((event: MessageEvent) => event.data as SandboxMessage)
    .filter(message => message.cmd === SandboxMessageCommand.init)
    .subscribe({
      next: message => {
      let dispose: DisposeFunction;
      const instanceId = message.instanceId;
      const receivePorts = message.ports;
      let channels = createChannels(Object.keys(receivePorts));
      const transferPorts = portMap(channels, 2);
      const sendPorts = portMap(channels, 1);
      const initMessage: SandboxMessage = {
        cmd: SandboxMessageCommand.init,
        ports: transferPorts,
        instanceId
      }
      postMessage(initMessage, Object.values(transferPorts));

      const start$ = fromEvent(self, 'message')
        .map((event: MessageEvent) => event.data as SandboxMessage)
        .filter(message => message.instanceId === instanceId && message.cmd === SandboxMessageCommand.start)
        .mapTo(SandboxMessageCommand.start)
        .debug('start')
        
      
      const stop$ = fromEvent(self, 'message')
        .map((event: MessageEvent) => event.data as SandboxMessage)
        .filter(message => message.instanceId === instanceId && message.cmd === SandboxMessageCommand.stop)
        .mapTo(SandboxMessageCommand.stop)
        .debug('stop');
      
      start$
        .endWhen(stop$)
        .subscribe({
          next () {
            const connectedWorkerDrivers = Object.keys(workerDrivers).reduce((acc, n) => ({
              [n]: workerDrivers[n](receivePorts[n], sendPorts[n]),
              ...acc
            }), {});
            dispose = run(
              component,
              {
                ...drivers,
                ...connectedWorkerDrivers
              }
            );
          },
          error (e) {
            console.error(e);
          },
          complete () {
            if (dispose) {
              dispose();
            }
            Object.values(sendPorts).forEach(port => {
              port.close();
            });
            channels = null;
          }
        })
    },
    error: (e) => console.error(e),
    complete: () => null
    })
}

export const sandboxDOMDriver: WorkerDriver = (rx, tx) => {
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
      error () {

      },
      complete () {

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
                    console.error(error);
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
				return sink.map((vnode: VNode): VNode => ({
					tag: 'span',
					options: {
						attrs : {
							'x-scope' : scope
						}
					},
					children: [vnode]
				}))
			}
    }
  }
}