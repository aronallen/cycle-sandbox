import {
  Driver,
  FantasyObservable,
  FantasyObserver,
  DisposeFunction,
  Sources,
  Sinks,
  FantasySubscription,
} from '@cycle/run'

import {
  adapt
} from '@cycle/run/lib/adapt';

import isolate from '@cycle/isolate';

import {
  DOMSource,
  VNode as CycleVNode,
  h
} from '@cycle/dom';
import { Stream } from 'xstream';
import xs from 'xstream';
import fromEvent from 'xstream/extra/fromevent';
import * as uuid from 'uuid/v4';

type Bridge = (
  tx?: MessagePort,
  rx?: MessagePort, 
  source?: any
) => FantasyObservable

export type Bridges = {
  [type: string]: Bridge
};

export enum SandboxMessageCommand {
  init,
  start,
  stop
}

type MessagePorts = {
  [type: string]: MessagePort
}


type JSONValue = {
  [key: string]: boolean | number | string | Array<JSONValue> | JSONValue
};


export type VNode = {
  tag: string,
  options: JSONValue,
  children: Array<VNode>
}

export enum WorkerDOMMessageCommand {
  vnode,
  attach,
  detach
};

export type EventSynthesis = {
  type: string;
}

export type WorkerDOMEvent = {
  listenerId: string,
  payload: EventSynthesis
}

export type WorkerDOMListenerOptions = {
  preventDefault?: boolean,
  stopPropegation?: boolean,
  useCapture?: boolean
}

export type WorkerDOMAttachMessage = {
  selector: string,
  events: string,
  listenerId: string,
  options?: WorkerDOMListenerOptions
}

export type WorkerDOMDettachMessage = {
  listenerId: string
}

export type WorkerDOMVNodeMessage = VNode;

export type WorkerDOMMessage = {
  cmd: WorkerDOMMessageCommand,
  payload : WorkerDOMAttachMessage | WorkerDOMDettachMessage | WorkerDOMVNodeMessage 
};

export type SandboxMessage = {
  cmd: SandboxMessageCommand,
  ports?: MessagePorts,
  instanceId: string
}

type MessageChannels = {
  [type: string]: MessageChannel
}

type ISpawn = (
  resource: string,  // the URL identifying the process bundle
  sources: Sources,  // the sources that need to be passed to the component
  bridges?: Bridges  // the functions that connect the sources and the sinks to the Message Channels
) => FantasyObservable


function synthesizeEvent(event: Event, listenerId: string): WorkerDOMEvent {
  return {
    listenerId,
    payload: {
      type: event.type
    }
  }
}

function toSnabbdom(node: VNode): CycleVNode { 
  const children = node.children || [];
  const mappedChildren = children.map(toSnabbdom);
  // add sanitization of tag names and malicous attributes and values
  // such as script src javascipt: pseuod protocol etc.
  // should be very extensive!
  return h(
    node.tag, 
    node.options,
    mappedChildren
  )
}

const unique = (n: any, i: number, a: Array<any>) => a.indexOf(n) === i;

export const DOMBridge: Bridge = (rx, tx, source): FantasyObservable => {
  let listener: FantasySubscription;
  // table containing DOM listener attachments
  const attachments : {[key: string]: FantasySubscription} = {
  }
  // this is the sink of VNode
  return adapt(xs.create({
    start(observer) {
      rx.start();
      tx.start();
      listener = fromEvent(rx, 'message')
        .map(e => e.data as WorkerDOMMessage)
        .subscribe({
          next (message) {
            if (message.cmd === WorkerDOMMessageCommand.vnode) {
              const vnode = message.payload as VNode;
              
              try {
                const snabbdomVNode = toSnabbdom(vnode);
                observer.next(snabbdomVNode);
              } catch ( error ) {
                observer.error( error );
              }
            } else if (message.cmd === WorkerDOMMessageCommand.attach) {
              const payload = message.payload as WorkerDOMAttachMessage;
              const options = payload.options || {};
              attachments[payload.listenerId] = (xs.from(source
                .select(payload.selector)
                .events(payload.events, options.useCapture)) as FantasyObservable)
                .subscribe({
                  next (event: Event) {
                    if (options.preventDefault) {
                      event.preventDefault();
                    }
                    if (options.stopPropegation) {
                      event.stopPropagation();
                    }
                    tx.postMessage(
                      synthesizeEvent(event, payload.listenerId)
                    )
                  },
                  error (e) {

                  },
                  complete() {

                  }
                })
            } else if (message.cmd === WorkerDOMMessageCommand.detach) {
              const payload = message.payload as WorkerDOMDettachMessage;
              attachments[payload.listenerId].unsubscribe();
              delete attachments[payload.listenerId];
            }
        },
        error () {

        },
        complete () {

        }
      });
    },
    stop() {
      rx.close();
      tx.close();
      listener.unsubscribe();
    }
  }))
}

export function createChannels(channels: string[]): MessageChannels {
  return channels.reduce((acc: MessageChannels, key: string) => {
      return {
        [key] : new MessageChannel(),
        ...acc
      }
  }, {});
}

export function portMap(channels: MessageChannels, portNumber: 1 | 2): MessagePorts {
  return Object.keys(channels).reduce((acc, key) => ({
      [key] : channels[key][`port${portNumber}`]
  }), {});
}

export function makeSandboxDriver(): Driver<undefined, Sources> {
  const workers: {[key: string] : Worker} = {

  }

  const instances: {[key: string]: number} = {

  }

  const timeoutID: {[key: string]: number} = {

  }

  function open (resource: string): Worker {
    // clear the timeout
    clearTimeout(timeoutID[resource]);
    // fetch worker from cache or spawn it
    let worker = workers[resource] || new Worker(resource);
    // get the current count
    let count  = instances[resource] || 0;
    // assing the worker to the cache
    workers[resource] = worker;
    // increment the instances count
    instances[resource] = count + 1;
    // return the worker reference
    return worker;
  }

  function close (resource: string): void {
    // fetch worker from cache
    let worker: Worker = workers[resource];
    // fetch instance count
    let count  = instances[resource];
    // if instance count is
    if (count < 2) {
      // prepare to terminate the worker
      clearTimeout(timeoutID[resource]);
      timeoutID[resource] = setTimeout(() => {
        worker.terminate();
        delete workers[resource];
      }, 0);
    } else {
      // do nothing
    }
    // decrement the count
    instances[resource] = count - 1;
  }

  return () => {
    const sandbox: ISpawn = (
      resource,
      sources,
      bridges = {}
    ) => {
      let channels: MessageChannels;
      let subscription: FantasySubscription;
      let worker: Worker;
      const instanceId = uuid();
      return adapt(xs.create({
        start (observer) {
          const sourceKeys = Object.keys(sources);
          channels = createChannels(sourceKeys);
          // { DOM: channel}

          worker = open(resource);

          // make a object of destination ports (rx in thread) wiil be transfered to thread
          const transferPorts = portMap(channels, 2);
          
          // make a object of entry ports (tx in main)
          const sendPorts = portMap(channels, 1);

          const message: SandboxMessage = {
            cmd: SandboxMessageCommand.init,
            ports: transferPorts,
            instanceId
          };
          // send the init command and transfer the destination ports
          worker.postMessage(message, Object.values(transferPorts));
          
          // listener method
          function listener (message: SandboxMessage) {
            const receivePorts = message.ports;

            const sinks = [
              ...Object.keys(sendPorts), 
              ...Object.keys(receivePorts)
            ]
            .filter(unique)
            .reduce((acc: Sinks, key: string) => {
              if (bridges[key]) {
                return {
                  ...acc,
                  [key]: bridges[key](
                    receivePorts[key],
                    sendPorts[key],
                    sources[key]
                  )
                }
              }
              if (key === 'DOM') {
                return {
                  ...acc,
                  [key]: DOMBridge(
                    receivePorts[key],
                    sendPorts[key],
                    sources[key]
                  )
                }
              } else {
                throw Error('We dont know how to handle this with a bridge');
              }
            }, {});
            observer.next(sinks);
            const startMessage: SandboxMessage = {
              cmd: SandboxMessageCommand.start,
              instanceId,
            }
            worker.postMessage(startMessage);
          }
          
          subscription = fromEvent(worker, 'message')
            .map((event: MessageEvent) => event.data as SandboxMessage)
            .filter(message => message.cmd === SandboxMessageCommand.init && message.instanceId === instanceId)
            .take(1)
            .subscribe({
              next: listener,
              error: (e) => console.error(e),
              complete: () => null
            })
        },
        stop () {
          Object.values(channels).forEach(channel => 
            channel.port1.close()
          )
          channels = null;
          worker.postMessage({
            instanceId,
            cmd: SandboxMessageCommand.stop
          } as SandboxMessage)
          close(resource);
          subscription.unsubscribe();
        }
      }))
    };
    return {
      select: (
  resource: string,
  { Sandbox, ...sources }: {Sandbox: any } & Sources,
  expectedSinks: string[],
  bridges: Bridges = {}): Sinks => {
    return isolate((sources) => {
      const sinks$ = xs.from(sandbox(resource, sources, bridges));
      return expectedSinks.reduce((acc, key) => ({
        ...acc,
        [key] : adapt(sinks$.debug('sinks').map((sinks) => xs.from(sinks[key])).flatten())
      }), {});
    })(sources);
}
    };
  }
};