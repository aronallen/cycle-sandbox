import { Sources, Sinks } from '@cycle/run';
import { run } from '@cycle/most-run';
import { crux } from './crux-main';
import { makeDOMDriver, h } from '@cycle/dom';
import { combineArray } from 'most';

function Component (sources: Sources): Sinks {
  const sinks = Array(4)
    .fill(null)
    .map(() => crux('./app.js', sources).DOM)
  
  
  return {
    DOM: combineArray((...children) => {
      return h('div', {}, children);
    }, sinks)
  };
};

run(Component, { DOM : makeDOMDriver('#app')});