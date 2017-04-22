import { periodic } from 'most';
import { run } from './crux-run';
import { Sources, Sinks } from '@cycle/run';

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
    .events('click')
    .map(() => 0).scan((acc, n) => acc + 1, 1)
    .tap(e => console.log(e));
  return {
    DOM: periodic(1000 / 60, 0)
    .scan((acc, n) => acc + 1, 0)
    .combine(Array, multiply$)
    .map(([n, freq]) => ({
      t: 'svg',
      o: {
        attrs : {
          width: SIZE,
          height: SIZE
        }
      },
      c: [{
        t: 'polyline',
        o: {
          attrs : {
            points: line(n, freq)
          }
        },
        c: []
      }]
    }))
  };
}

run(Component, {
  
});