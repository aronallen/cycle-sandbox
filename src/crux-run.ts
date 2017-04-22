import fromEvent from 'xstream/extra/fromevent';
import {CycleProgram, Sources, Sinks, Drivers, FantasyObservable,  DisposeFunction } from '@cycle/run';
import { run as cycleRun } from '@cycle/most-run';


import { makeDOMDriver } from './crux-dom';

export type MessageChannels = {
  [name: string]: MessageChannel;
}
export type MessagePorts = {
  [name: string]: MessagePort;
}

export enum ProccessAction {
  Init,
  Run,
  End
}

export type ProcessMessage = {
  id: string,
  action: ProccessAction,
  ports?: MessagePorts,
}

export function unique(v: any, i: number, a: Array<any> ) {
  return a.indexOf(v) === i;
}


export function makePortDriver(rx: MessagePort, tx: MessagePort) {
  return (sources$: FantasyObservable): FantasyObservable => {
    sources$.subscribe({
      next: (message) => tx.postMessage(message),
      error: (error) => console.error(error),
      complete: () => null
    });
    return fromEvent(rx, 'message')
      .map((e: MessageEvent) => e.data)
  }
}

export function run(
    main: (sources: Sources) => Sinks,
    localDrivers: Drivers<Sources, Sinks>
  ) {
  
  function init(data: ProcessMessage): DisposeFunction {
    // capture downlink channels
    const receive = data.ports as MessagePorts;
    // make channels for uplink streams
    const channels = Object.keys(receive).reduce((acc: MessageChannels, key: string) => ({
      ...acc,
      [key]: new MessageChannel()
    }), {});

    // generate drivers, local drivers have preceedence
    const drivers = [
      ...Object.keys(receive),
    ]
    .reduce((drivers: Drivers<Sources, Sinks>, key: string) => {
      // need special case for DOM
      if (key === 'DOM') {
        return {
          [key] : makeDOMDriver(receive[key], channels[key].port1),
          ...drivers
        }
      } else if(drivers[key] === undefined) {
        return {
          [key] : makePortDriver(receive[key], channels[key].port1),
          ...drivers
        }
      } else {
        return drivers;
      }
    }, localDrivers);


    // build key value pair of send ports
    const send = Object.keys(channels).reduce((acc: MessagePorts, n: string) => ({
      ...acc,
      [n] : channels[n].port2
    }), {});

    // prepare message for main thread
    const message: ProcessMessage = {
      id: data.id,
      ports: send,
      action: ProccessAction.Init
    }

    // transfer ports back to main thread
    postMessage(message, Object.values(send))

    // return run and wait for run signal
    return () => cycleRun(main, drivers);
  };

  // instances table
  const instances: {[key: string]: Function} = {

  };

  fromEvent(self, 'message')
    .map(e => e.data as ProcessMessage)
    .subscribe({
      next (message) {
        if (message.action === ProccessAction.Init) {
          instances[message.id] = init(message);
        } else if (message.action === ProccessAction.Run) {
          instances[message.id] = instances[message.id]();
        } else if (message.action === ProccessAction.End) {
          instances[message.id]();
        }
      },
      error () {

      },
      complete () {

      }
    });
}