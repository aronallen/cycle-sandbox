import {
  FantasyObservable,
  FantasySubscription
} from '@cycle/run';

import {
  adapt
} from '@cycle/run/lib/adapt';

import {
  DOMSource,
  VNode,
  h
} from '@cycle/dom';

import { default as xs, Stream, Subscription } from 'xstream';

import fromEvent from 'xstream/extra/fromevent';

import { MainConnector } from '../types';

import { default as uuid} from 'uuid/v4';

export enum WorkerDOMMessageCommand {
  vnode,
  attach,
  detach
};

export type WorkerDOMEvent = {
  listenerId: string,
  payload: EventSynthesis
}

export type WorkerDOMListenerOptions = {
  preventDefault?: boolean
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
  payload: WorkerDOMAttachMessage | WorkerDOMDettachMessage | WorkerDOMVNodeMessage
};
export type JSONValue = number | string | boolean | JSONObject;
export type JSONObject = {
  [key: string] : JSONValue | Array<JSONValue>
};

export type EventSynthesis = JSONObject;

function eventKeys(event: Event): string[] {
  const keys = [];
  for (const key in event) {
    keys.push(key);
  }
  return keys;
}

function synthesizeEvent(event: Event, listenerId: string): WorkerDOMEvent {
  
  const payload = eventKeys(event).reduce((acc, key) => {
    const value = event[key];
    const type = typeof value;
    if (
      type === 'string' ||
      type === 'number' ||
      type === 'boolean'
      ) {
      return {
        ...acc,
        [key]: value
      };
    } else if (value instanceof Element) {
      const tag = value.tagName;
      const id = value.id ? `#${value.id}` : '';
      const classes = value.classList.length 
        ? Array(...value.classList).map(c => `.${c}`).join('')
        : '';
      return {
        ...acc,
        [key] : tag + id + classes
      };
    } {
      return acc;
    }
  }, {});
  return {
    payload,
    listenerId
  };
}

export const DOMMainConnector: MainConnector = (rx, tx) => {
  let listener: FantasySubscription;
  // table containing DOM listener attachments
  const attachments: { [key: string]: FantasySubscription } = {
  }
  return (source) => {
    // this is the sink of VNode
    return adapt(xs.create({
      start(observer) {
        rx.start();
        tx.start();
        listener = fromEvent(rx, 'message')
          .map(e => e.data as WorkerDOMMessage)
          .subscribe({
            next(message) {
              if (message.cmd === WorkerDOMMessageCommand.vnode) {
                const vnode = message.payload as VNode;
                observer.next(vnode);
              } else if (message.cmd === WorkerDOMMessageCommand.attach) {
                const payload = message.payload as WorkerDOMAttachMessage;
                const options = payload.options || {};
                attachments[payload.listenerId] = (xs.from(source
                  .select(payload.selector)
                  .events(payload.events, options)) as FantasyObservable)
                  .subscribe({
                    next(event: Event) {
                      if (options.preventDefault) {
                        event.preventDefault();
                      }
                      tx.postMessage(
                        synthesizeEvent(event, payload.listenerId)
                      )
                    },
                    error(error) {
                      console.error(error);
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
            error(error) {
              console.error(error);
            },
            complete() {

            }
          });
      },
      stop() {
        rx.close();
        tx.close();
        listener.unsubscribe();
        Object.keys(attachments).forEach((key) => {
          attachments[key].unsubscribe();
          delete attachments[key];
        });
      }
    }))
  }
}