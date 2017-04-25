import { periodic, just, combineArray, Stream } from 'most';
import { setup } from '../src/worker';
import { workerDOMConnector } from '../src/dom/index';
import { Sources, Sinks } from '@cycle/run';
import { run } from '@cycle/most-run';
import { makeHTTPDriver } from '@cycle/http';
import { h, VNodeData } from '@cycle/dom';

const SIZE = 256;

function line(offset, frequency) {
  const radians = Math.PI * frequency / SIZE;
  return Array(SIZE)
    .fill(null)
    .map((n, i) => [i, Math.sin((i + offset) * radians) * SIZE / 2 + SIZE / 2].join(',')).join(' ')
}

export function Component(sources: Sources): Sinks {
  const multiply$ = sources.DOM
    .select('svg')
    .events('mousedown')
    .map(() => 0).scan((acc, n) => acc * 1.1, 1)

  const title$ = sources
    .HTTP
    .select()
    .switch()
    .map(e => e.body.message) as Stream<string>;

  const tick$ = periodic(1000 / 60, 0)
    .scan((acc, n) => acc + 1, 0);
  return {
    HTTP: just(`./data.json?${Math.random()}`),
    DOM:
    combineArray(Array, [tick$, multiply$, title$])
      .map(([n, freq, title]) => (
        h('svg', {
          attrs: {
            title: title,
            width: SIZE,
            height: SIZE
          }
        },

          [
            h('polyline',
              {
                attrs: {
                  points: line(n, freq)
                }
              }
            ),
            h('text', {

              attrs: {
                fontSize: 12,
                fill: 'black',
                x: 0,
                y: 12
              }
            },
              title
            )
          ]
        )
      )
    )
  };
}

setup(Component, {
  HTTP: makeHTTPDriver()
}, {
  DOM: workerDOMConnector
}, run);