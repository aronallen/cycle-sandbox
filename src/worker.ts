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
  VNode
} from '@cycle/dom';

import {
  adapt
} from '@cycle/run/lib/adapt';

import {
  SandboxMessage,
  SandboxMessageCommand,
  createChannels,
  portMap
} from './main';

import { WorkerConnectors } from './types';

export function setup (
  component: (Sources: Sources) => FantasySinks<any>,
  drivers: Drivers<FantasyObservable, any>,
  connectors: WorkerConnectors = {},
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
        .mapTo(SandboxMessageCommand.start);
        
        
      
      const stop$ = fromEvent(self, 'message')
        .map((event: MessageEvent) => event.data as SandboxMessage)
        .filter(message => message.instanceId === instanceId && message.cmd === SandboxMessageCommand.stop)
        .mapTo(SandboxMessageCommand.stop);
        
      
      start$
        .endWhen(stop$)
        .subscribe({
          next () {
            const connected = Object.keys(connectors).reduce((acc, n) => ({
              [n]: connectors[n](receivePorts[n], sendPorts[n]),
              ...acc
            }), {});
            dispose = run(
              component,
              {
                ...drivers,
                ...connected
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
    error (error) {console.error(error)},
    complete () {}
    })
}