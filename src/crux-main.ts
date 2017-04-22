import { Sources, Sinks } from '@cycle/run'

import { VNode } from '@cycle/dom';
import { DOMSource } from '@cycle/dom/most-typings';
import { Subscription, Stream } from 'most';
import { async, Subject } from 'most-subject';
import { DOMMessage, VNode as WNode, DOMEvent, DOMAction, DOMDetachment, DOMAttachment, transpose } from './crux-dom'
import * as uuid from 'uuid/v4';
import { ProcessMessage, ProccessAction, MessagePorts } from './crux-run';
import isolate from '@cycle/isolate';
type WorkerProcess = {
  src: string,
  instances: string[],
  process: Worker
}

type WorkerPool = {
  [key: string]: WorkerProcess
}

const workers = {

};

export function spawn(src: string): Worker {
  return new Worker(src);
}

export class DOMBridge {
  public key: string
  public id: string
  public source: DOMSource
  public process: Worker
  public sink: Subject<VNode>
  public events: Subject<DOMEvent>
  public rx: MessagePort
  public tx: MessagePort
  public channel: MessageChannel
  public listeners: {
    [key: string]: Subscription<any>
  }

  constructor(props) {
    
    this.source = props.source;
    this.channel = new MessageChannel();
    this.tx = this.channel.port1;
    this.tx.start();
    this.listeners = {

    }
    
    this.events = async<DOMEvent>();
    {}
    this.sink = async<VNode>();
    {}

    this.key = props.key;
    this.id = props.id;

    const self = this;
    
    function attach(e: MessageEvent) {
      props.process.removeEventListener('message', attach);
      const message = e.data as ProcessMessage;
      if (message.id === self.id) {
        self.rx = message.ports[self.key];
        self.listen();
      }
    };
    props.process.addEventListener('message', attach);
  }

  ports (): MessagePorts {
    return {
      [this.key] : this.channel.port2
    };
  }
  
  listen() {
    this.rx.onmessage = message => {
      const data = message.data as DOMMessage;
      if (data.action === DOMAction.UPDATE) {
        // we need to convert this to snabbdom and push it on the sink
        const cmd = data.message as WNode;
        this.sink.next(transpose(cmd));
      } else if (data.action === DOMAction.ATTACH) {
        const cmd = data.message as DOMAttachment;
        const observable$ = this.source
          // select the element
          .select(cmd.selector)
          // and the events
          .events(cmd.events)
          // synthesize the event data
          .map(e => ({
            action: DOMAction.EVENT,
            message: { type: cmd.events, listener: cmd.listener }
          }))
        // subscribe and push on the outbound port;
        const subscription = observable$.subscribe({
          next: e => {
            this.tx.postMessage(e);
          },
          complete: _ => null,
          error: _ => null
        });
        this.listeners[cmd.listener] = subscription;
      } else if (data.action === DOMAction.DETACH) {
        const cmd = message.data as DOMDetachment;
        this.listeners[cmd.listener].unsubscribe();
        delete this.listeners[cmd.listener];
      }
    };
  }
}

export function crux(src: string, sources: Sources ): Sinks  {
  return isolate((sources) => {
    const id = uuid();
    const process = spawn(src);
    const bridge = new DOMBridge({
      source: sources.DOM,
      id,
      process,
      key: 'DOM'
    });
    const ports = bridge.ports();
    const message: ProcessMessage = {
      id,
      action: ProccessAction.Init,
      ports
    }
    const start: ProcessMessage = {
      id,
      action: ProccessAction.Run
    }
    process.postMessage(message, Object.values(ports));
    process.postMessage(start);
    return {
      DOM: bridge.sink
    }
  })(sources);
}