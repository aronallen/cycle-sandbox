import { Sources, Sinks } from '@cycle/run';
import { run } from '@cycle/most-run';
import { makeDOMDriver, h, VNode } from '@cycle/dom';
import { combineArray, Stream, periodic, just } from 'most';
import { makeSandboxDriver } from '../src/main';
import { mainDOMConnector } from '../src/dom';

function Component ({Sandbox, ...sources}: Sources & {Sandbox: any} ): Sinks {
  const vdom$ = periodic(1000)
    .startWith(null)
    .map(() => combineArray(
      (...children) => h('div', {}, children as Array<VNode>),
      Array(4).fill(null).map(() => Sandbox.select(
        './widget.js',
        sources,
        ['DOM'],
        {
          DOM: mainDOMConnector
        }
      ).DOM)))
    .switch()

  return {
    DOM: vdom$
  };
};

run(Component, {
  DOM : makeDOMDriver('#app'),
  Sandbox: makeSandboxDriver()
});