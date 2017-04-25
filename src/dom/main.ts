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

import * as uuid from 'uuid/v4';

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
  payload: WorkerDOMAttachMessage | WorkerDOMDettachMessage | WorkerDOMVNodeMessage
};

function synthesizeEvent(event: Event, listenerId: string): WorkerDOMEvent {
  return {
    listenerId,
    payload: {
      type: event.type
    }
  }
}

export const mainDOMConnector: MainConnector = (rx, tx) => {
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
                  .events(payload.events, options.useCapture)) as FantasyObservable)
                  .subscribe({
                    next(event: Event) {
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