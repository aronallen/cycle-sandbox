import { periodic } from 'most';
import { setup, sandboxDOMDriver } from './sandbox-worker';
import { Sources, Sinks } from '@cycle/run';
import { run } from '@cycle/most-run';

const SIZE = 256;

function line (offset, frequency) {
  const radians = Math.PI * frequency / SIZE;
  return Array(SIZE)
    .fill(null)
    .map((n, i) => [i, Math.sin((i + offset) * radians ) * SIZE / 2 + SIZE / 2].join(',')).join(' ')
}

function Component (sources: Sources): Sinks {
  const multiply$ = sources.DOM
    .select('svg')
    .events('mousedown')
    .map(() => 0).scan((acc, n) => acc + 1, 1)
    .tap(e => console.log(e));
  return {
    DOM: periodic(1000 / 60, 0)
    .scan((acc, n) => acc + 1, 0)
    .combine(Array, multiply$)
    .map(([n, freq]) => ({
      tag: 'svg',
      options: {
        attrs : {
          width: SIZE,
          height: SIZE
        }
      },
      children: [{
        tag: 'polyline',
        options: {
          attrs : {
            points: line(n, freq)
          }
        },
        children: []
      }]
    }))
  };
}

setup(Component, {
  // regular drivers such as @cycle/http
}, {
  // worker drivers 
  // (return a function that returns a driver)
  DOM: sandboxDOMDriver
}, run);