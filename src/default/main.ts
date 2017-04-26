import { Subscription, Stream, default as xs } from 'xstream';
import fromEvent from 'xstream/extra/fromevent';
import { MainConnector } from '../types';
import {
  adapt
} from '@cycle/run/lib/adapt';

export const defaultMainConnector: MainConnector = (rx, tx) => {
  return (stream$: Stream<any>) => {
    let receiver: Subscription;
    let sender: Subscription;
    return adapt(xs.create({
      start(observer) {
        rx.start();
        tx.start();
        if (stream$) {
            sender = stream$.subscribe({
            next(event) {
              tx.postMessage(event);
            },
            error(error) {
              console.error(error);
            },
            complete() {

            }
          });
        } {
          receiver = fromEvent(rx, 'message')
          .subscribe({
            next(event: MessageEvent) {
              observer.next(event.data);
            },
            error(error) {
              console.error(error);
            },
            complete() {

            }
          });
        }
      },
      stop() {
        if (sender) {
          sender.unsubscribe();
        }
        if (receiver) {
          receiver.unsubscribe();
        }
        rx.close();
        tx.close();
      }
    }))
  }
}