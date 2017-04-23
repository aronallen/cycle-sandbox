# Cycle Sandbox

Cycle Sandbox lets you run a component in a Web Worker
Cycle Sandbox is still WIP and not quite ready for prime time.
Feed back is much appreciated.

## Bridges
There is a Bridge that lets the webworker listen to events on the main thread.
A src.select().events() command is sent on tx to the main thread, and an observable is returned with a listener id filter. In the main thread, rx takes the .select().events() command and calls on the real DOM Driver. The listener is then attached until the dettach signal is recived for that listener, and events are sent to the webworker

````
-|src  tx|- | -|rx  src|-
 |   \   |  |  |   /   |
-|snk  rx|- | -|tx  snk|-
````