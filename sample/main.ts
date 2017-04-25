import { Sources, Sinks } from '@cycle/run';
import { run } from '@cycle/most-run';
import { makeDOMDriver, h, VNode } from '@cycle/dom';
import { combineArray, Stream, periodic, just } from 'most';
import { makeSandboxDriver } from '../src/main';
import { mainDOMConnector } from '../src/dom';
import { makeHTTPDriver } from '@cycle/http';
import isolate from '@cycle/isolate';

import { Component as SubComponent } from './widget';
function Component ({Sandbox, ...sources}: Sources & {Sandbox: any} ): Sinks {
  const sub = isolate(SubComponent)(sources);
  const vdom$ = periodic(1000)
    .startWith(null)
    .map(() => combineArray(
      (...children) => h('div', {}, children as Array<VNode>),
      Array(4).fill(null).map(() => Sandbox.select(
        './widget.js',
        { DOM: sources.DOM },
        ['DOM'],
        {
          DOM: mainDOMConnector
        }
      ).DOM).concat(sub.DOM)))
    .switch()

  return {
    DOM: vdom$,
    HTTP: sub.HTTP
  };
};

run(Component, {
  HTTP: makeHTTPDriver(),
  DOM : makeDOMDriver('#app'),
  Sandbox: makeSandboxDriver()
});