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

import { Stream } from 'xstream';
import xs from 'xstream';
import fromEvent from 'xstream/extra/fromevent';
import { MainConnectors } from './types';

import * as uuid from 'uuid/v4';

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


export type SandboxMessage = {
  cmd: SandboxMessageCommand,
  ports?: MessagePorts,
  instanceId: string
}

type MessageChannels = {
  [type: string]: MessageChannel
}

const unique = (n: any, i: number, a: Array<any>) => a.indexOf(n) === i;

export function createChannels(channels: string[]): MessageChannels {
  return channels.reduce((acc: MessageChannels, key: string) => {
    return {
      [key]: new MessageChannel(),
      ...acc
    }
  }, {});
}

export function portMap(channels: MessageChannels, portNumber: 1 | 2): MessagePorts {
  return Object.keys(channels).reduce((acc, key) => ({
    [key]: channels[key][`port${portNumber}`]
  }), {});
}

export function makeSandboxDriver(): Driver<undefined, Sources> {
  const workers: { [key: string]: Worker } = {

  }

  const instances: { [key: string]: number } = {

  }

  const timeoutID: { [key: string]: number } = {

  }

  function open(resource: string): Worker {
    // clear the timeout
    clearTimeout(timeoutID[resource]);
    // fetch worker from cache or spawn it
    let worker = workers[resource] || new Worker(resource);
    // get the current count
    let count = instances[resource] || 0;
    // assing the worker to the cache
    workers[resource] = worker;
    // increment the instances count
    instances[resource] = count + 1;
    // return the worker reference
    return worker;
  }

  function close(resource: string): void {
    // fetch worker from cache
    let worker: Worker = workers[resource];
    // fetch instance count
    let count = instances[resource];
    // if instance count is
    if (count < 2) {
      // prepare to terminate the worker
      clearTimeout(timeoutID[resource]);
      timeoutID[resource] = self.setTimeout(() => {
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
    const sandbox = (
      resource: string,
      sources: Sources,
      connectors: MainConnectors = {}
    ) => {
      let channels: MessageChannels;
      let subscription: FantasySubscription;
      let worker: Worker;
      let receivePorts: MessagePorts = {};
      const instanceId = uuid();
      return adapt(xs.create({
        start(observer) {
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
          function listener(message: SandboxMessage) {
            receivePorts = message.ports;

            const sinks = [
              ...Object.keys(sendPorts),
              ...Object.keys(receivePorts)
            ]
              .filter(unique)
              .reduce((acc: Sinks, key: string) => {
                if (connectors[key]) {
                  return {
                    ...acc,
                    [key]: connectors[key](
                      receivePorts[key],
                      sendPorts[key]
                    )(sources[key])
                  }
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
              error (error) {console.error(error)},
              complete: () => null
            })
        },
        stop() {
          Object.values(channels)
            .forEach(channel =>
              channel.port1.close()
            )
          Object.values(receivePorts)
            .forEach(port => port.close());
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

    function select(
      resource: string,
      { Sandbox, ...sources }: { Sandbox: any } & Sources,
      expectedSinks: string[],
      connectors: MainConnectors = {}): Sinks {
      return isolate((sources) => {
        const sinks$ = xs.from(sandbox(resource, sources, connectors));
        return expectedSinks.reduce((acc, key) => ({
          ...acc,
          [key]: adapt(sinks$.debug('sinks').map((sinks) => xs.from(sinks[key])).flatten())
        }), {});
      })(sources);
    }

    return {
      select 
    };
  }
};